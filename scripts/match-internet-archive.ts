/**
 * Propose Internet Archive matches for albums in the Shira Wikibase.
 *
 * For each album it queries the IA advanced-search API by title (and catalog
 * number), scores the candidates against the album title, and writes a CSV of
 * suggestions for HUMAN REVIEW. It does NOT write anything back to Wikibase —
 * IA matching is fuzzy and needs eyes on it. Review the CSV, then add the good
 * `identifier` values to each album under your new "Internet Archive
 * identifier" property.
 *
 * Usage:
 *   npx tsx scripts/match-internet-archive.ts                 # all albums -> ia-matches.csv
 *   npx tsx scripts/match-internet-archive.ts --limit 100     # first 100 only
 *   npx tsx scripts/match-internet-archive.ts --min-score 0.5 # tighten the cutoff
 *   npx tsx scripts/match-internet-archive.ts --out out.csv
 *
 * Output columns: shiraId, shiraTitle, catalog, score, iaIdentifier,
 * iaTitle, iaYear, iaUrl
 */

import { writeFileSync } from 'node:fs';
import { getAllAlbums, type Album } from '../src/lib/wikibase';

type Args = { limit?: number; minScore: number; out: string; delayMs: number; rows: number };

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  return {
    limit: get('--limit') ? Number(get('--limit')) : undefined,
    minScore: get('--min-score') ? Number(get('--min-score')) : 0.4,
    out: get('--out') ?? 'ia-matches.csv',
    delayMs: get('--delay') ? Number(get('--delay')) : 200,
    rows: get('--rows') ? Number(get('--rows')) : 5,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Normalize a title for comparison: lowercase, strip punctuation/diacritics. */
function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dice coefficient over character bigrams — robust to small differences. */
function similarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      set.set(g, (set.get(g) ?? 0) + 1);
    }
    return set;
  };
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const A = bigrams(na);
  const B = bigrams(nb);
  let overlap = 0;
  for (const [g, ca] of A) overlap += Math.min(ca, B.get(g) ?? 0);
  const total = na.length - 1 + (nb.length - 1);
  return total > 0 ? (2 * overlap) / total : 0;
}

type IaDoc = { identifier: string; title?: string | string[]; year?: string | number };

async function searchIa(query: string, rows: number): Promise<IaDoc[]> {
  const params = new URLSearchParams({ q: `${query} AND mediatype:audio`, rows: String(rows), output: 'json' });
  params.append('fl[]', 'identifier');
  params.append('fl[]', 'title');
  params.append('fl[]', 'year');
  const url = `https://archive.org/advancedsearch.php?${params}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'shira-music-site IA matcher' } });
    if (!res.ok) return [];
    const json = (await res.json()) as { response?: { docs?: IaDoc[] } };
    return json.response?.docs ?? [];
  } catch {
    return [];
  }
}

function bestMatch(album: Album, docs: IaDoc[]) {
  let best: { doc: IaDoc; score: number } | null = null;
  for (const doc of docs) {
    const t = Array.isArray(doc.title) ? doc.title[0] : doc.title ?? '';
    const score = similarity(album.title, t);
    if (!best || score > best.score) best = { doc, score };
  }
  return best;
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const albums = [...(await getAllAlbums()).values()];
  // Only albums with a real title are searchable; the rest fall back to the QID.
  const titled = albums
    .filter((a) => a.title !== a.id && !/^Q\d+$/.test(a.title))
    .sort((a, b) => a.title.localeCompare(b.title));
  const skipped = albums.length - titled.length;
  const work = args.limit ? titled.slice(0, args.limit) : titled;
  console.error(
    `Matching ${work.length} titled albums against Internet Archive (${skipped} untitled skipped)…`
  );

  const rows: string[] = [
    ['shiraId', 'shiraTitle', 'catalog', 'score', 'iaIdentifier', 'iaTitle', 'iaYear', 'iaUrl']
      .map(csvCell)
      .join(','),
  ];
  let matched = 0;

  for (let i = 0; i < work.length; i++) {
    const album = work[i];
    // Title first; if the title is very short, append the catalog number.
    const query = album.title.length < 6 && album.catalogNumber
      ? `${album.title} ${album.catalogNumber}`
      : album.title;
    const docs = await searchIa(query, args.rows);
    const best = bestMatch(album, docs);

    if (best && best.score >= args.minScore) {
      matched++;
      const t = Array.isArray(best.doc.title) ? best.doc.title[0] : best.doc.title;
      rows.push(
        [
          album.id,
          album.title,
          album.catalogNumber ?? '',
          best.score.toFixed(3),
          best.doc.identifier,
          t ?? '',
          best.doc.year ?? '',
          `https://archive.org/details/${best.doc.identifier}`,
        ]
          .map(csvCell)
          .join(',')
      );
    }

    if ((i + 1) % 50 === 0) console.error(`  …${i + 1}/${work.length} (${matched} candidates)`);
    await sleep(args.delayMs);
  }

  writeFileSync(args.out, rows.join('\n'), 'utf8');
  console.error(`\nDone. ${matched} candidate matches (score ≥ ${args.minScore}) from ${work.length} titled albums written to ${args.out}`);
  console.error('Review the CSV, then add good identifiers to each album in Wikibase.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
