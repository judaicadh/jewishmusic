/**
 * Client for the Shira Wikibase (https://shira.wikibase.cloud).
 *
 * Two ways to read data:
 *   - sparql(): run a SELECT against the Blazegraph query service. Best for
 *     lists and for pulling in linked labels in one round trip.
 *   - getEntity(): fetch a single entity's full JSON via Special:EntityData.
 *
 * Raw SPARQL does NOT auto-inject the wd:/wdt: prefixes the query GUI adds, so
 * every query string here must declare the prefixes it uses (see PREFIXES).
 */

export const WIKIBASE_BASE = 'https://shira.wikibase.cloud';
export const SPARQL_ENDPOINT = `${WIKIBASE_BASE}/query/sparql`;

/** Property IDs, resolved from the live instance. Keep in sync with Wikibase. */
export const P = {
  instanceOf: 'P39',
  title: 'P7',
  freedmanTitle: 'P151',
  performer: 'P21',
  recordLabel: 'P20',
  tracklist: 'P110',
  catalogNumber: 'P152',
  publicationDate: 'P72',
  discogsReleaseId: 'P34',
  discogsArtistId: 'P148',
  discogsLabelId: 'P63',
  freedmanAlbumId: 'P68',
  partOf: 'P1',
  formOfWork: 'P24',
  recordingOf: 'P118',
  releaseCover: 'P160',
  image: 'P22',
  spotifyAlbumId: 'P28',
  youtubePlaylistId: 'P30',
  audio: 'P85',
  describedAtUrl: 'P4',
  dartmouthLink: 'P162',
  rsaLink: 'P163',
  // Internet Archive identifier: property does NOT exist in the Wikibase yet.
  // Create it as datatype External ID with formatter URL
  // https://archive.org/details/$1, then set its PID here to light up IA art +
  // audio across the site (see buildAlbums / album/[id].astro).
  internetArchiveId: undefined as string | undefined,
  // tracklist qualifiers
  seriesOrdinal: 'P104',
  duration: 'P13',
} as const;

/** Class item IDs (objects of P39 "instance of"). */
export const CLASS = {
  album: 'Q4',
  artist: 'Q28',
  human: 'Q279',
  recordLabel: 'Q24',
  audioTrack: 'Q302',
  musicalWork: 'Q303',
  composition: 'Q11',
  song: 'Q284',
} as const;

/** Item classes treated as "compositions" (musical works / songs). */
export const WORK_CLASSES = [CLASS.musicalWork, CLASS.composition, CLASS.song] as const;

/** Prefix block prepended to every SPARQL query. */
export const PREFIXES = `
PREFIX wd: <${WIKIBASE_BASE}/entity/>
PREFIX wdt: <${WIKIBASE_BASE}/prop/direct/>
PREFIX p: <${WIKIBASE_BASE}/prop/>
PREFIX ps: <${WIKIBASE_BASE}/prop/statement/>
PREFIX pq: <${WIKIBASE_BASE}/prop/qualifier/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

export type SparqlValue = { type: string; value: string; datatype?: string; 'xml:lang'?: string };
export type SparqlRow = Record<string, string | undefined>;

/**
 * Run a SPARQL SELECT and return rows as plain {var: value} objects.
 * PREFIXES are prepended automatically; pass only the query body.
 */
export async function sparql(query: string): Promise<SparqlRow[]> {
  const body = new URLSearchParams({ query: PREFIXES + query });
  const res = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'shira-music-site (https://music.judaicadhpenn.org)',
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`SPARQL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    results: { bindings: Record<string, SparqlValue>[] };
  };
  return json.results.bindings.map((b) => {
    const row: SparqlRow = {};
    for (const [k, v] of Object.entries(b)) row[k] = v.value;
    return row;
  });
}

/** Strip the entity-URI prefix, leaving the bare QID/PID (e.g. "Q3257"). */
export const toId = (uri: string | undefined): string | undefined =>
  uri?.split('/').pop();

export type WikibaseEntity = {
  id: string;
  labels: Record<string, { value: string }>;
  descriptions: Record<string, { value: string }>;
  claims: Record<string, any[]>;
};

/** Fetch a single entity's full JSON via Special:EntityData. */
export async function getEntity(qid: string): Promise<WikibaseEntity | null> {
  const res = await fetch(`${WIKIBASE_BASE}/wiki/Special:EntityData/${qid}.json`, {
    headers: { 'User-Agent': 'shira-music-site (https://music.judaicadhpenn.org)' },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { entities: Record<string, WikibaseEntity> };
  return json.entities[qid] ?? Object.values(json.entities)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------

export type AlbumTrack = {
  id?: string;
  label: string;
  ordinal: number;
  /** The raw P104 value as stored (may be non-numeric, e.g. "3-7", "sides"). */
  rawOrdinal?: string;
  duration?: string;
};

/**
 * Sort key for a track's P104 "series ordinal", which comes in two schemes:
 *   - side + track: "A1", "A2", "B1", "B2"  (78s / vinyl)
 *   - plain number: "1", "2", "3"
 * Returns [sideRank, trackNo]; side letters rank A<B<C… (multi-letter handled),
 * plain numbers sort as side 0, and anything unparseable (e.g. "sides") sorts
 * last so it falls back to query order.
 */
function ordinalKey(raw?: string): [number, number] {
  const s = raw?.trim() ?? '';
  const sided = s.match(/^([A-Za-z]+)\s*[-.]?\s*(\d+)/); // "A1", "B-2", "AA1"
  if (sided) {
    let sideRank = 0;
    for (const ch of sided[1].toUpperCase()) sideRank = sideRank * 36 + (ch.charCodeAt(0) - 64);
    return [sideRank, Number(sided[2])];
  }
  const num = s.match(/\d+/); // "1", "12", "3-7" → 3
  if (num) return [0, Number(num[0])];
  return [Number.MAX_SAFE_INTEGER, 0]; // non-numeric → end, query order
}

/**
 * A tracklist statement can carry several P104 values (e.g. both "A1" and the
 * junk label "sides"). Given the pipe-joined GROUP_CONCAT of them, pick the one
 * that actually looks like an ordinal (side+number or a number), so sorting and
 * display use "A1" rather than "sides".
 */
function bestOrdinal(concat?: string): string | undefined {
  if (!concat) return undefined;
  const tokens = concat.split('|').map((t) => t.trim()).filter(Boolean);
  return tokens.find((t) => /^[A-Za-z]*\s*[-.]?\s*\d+/.test(t)) ?? tokens[0];
}

/** Order tracks by ordinal scheme, falling back to original query order. */
function sortTracks<T extends { rawOrdinal?: string; _i: number }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const [as, at] = ordinalKey(a.rawOrdinal);
    const [bs, bt] = ordinalKey(b.rawOrdinal);
    return as - bs || at - bt || a._i - b._i;
  });
}

export type Album = {
  id: string;
  title: string;
  freedmanTitle?: string;
  catalogNumber?: string;
  publicationDate?: string;
  discogsReleaseId?: string;
  freedmanAlbumId?: string;
  cover?: string;
  spotifyAlbumId?: string;
  youtubePlaylistId?: string;
  dartmouthUrl?: string;
  rsaUrl?: string;
  /** Populated once the Internet Archive identifier property exists (see P.internetArchiveId). */
  internetArchiveId?: string;
  performers: Array<{ id?: string; label: string }>;
  recordLabels: Array<{ id?: string; label: string }>;
  tracks: AlbumTrack[];
};

// ---------------------------------------------------------------------------
// Bulk loader
//
// Building a page per album one-at-a-time would fire ~3 SPARQL queries × 6,355
// albums. Instead, load the entire catalog in two bulk queries (~23s total),
// assemble it in memory once, and memoize. Both getStaticPaths() and the album
// index consume the cached Map.
// ---------------------------------------------------------------------------

let _allAlbums: Promise<Map<string, Album>> | null = null;

/** Every album, fully assembled, keyed by QID. Cached for the build's lifetime. */
export function getAllAlbums(): Promise<Map<string, Album>> {
  if (!_allAlbums) _allAlbums = loadAllAlbums();
  return _allAlbums;
}

/** Parse a GROUP_CONCAT of "entityURI::label" pairs into {id,label}[]. */
function parseRefs(concat?: string): Array<{ id?: string; label: string }> {
  if (!concat) return [];
  const seen = new Set<string>();
  const out: Array<{ id?: string; label: string }> = [];
  for (const part of concat.split('||')) {
    const idx = part.lastIndexOf('::');
    if (idx === -1) continue;
    const id = toId(part.slice(0, idx));
    const label = part.slice(idx + 2);
    if (!label || (id && seen.has(id))) continue;
    if (id) seen.add(id);
    out.push({ id, label });
  }
  return out;
}

async function loadAllAlbums(): Promise<Map<string, Album>> {
  const [scalarRows, trackRows] = await Promise.all([
    sparql(`
      SELECT ?s (SAMPLE(?title) AS ?title) (SAMPLE(?freedmanTitle) AS ?freedmanTitle)
             (SAMPLE(?lbl) AS ?lbl)
             (SAMPLE(?catalog) AS ?catalog) (SAMPLE(?pubDate) AS ?pubDate)
             (SAMPLE(?discogs) AS ?discogs) (SAMPLE(?freedmanId) AS ?freedmanId)
             (SAMPLE(?cover) AS ?cover) (SAMPLE(?spotify) AS ?spotify) (SAMPLE(?youtube) AS ?youtube)
             (SAMPLE(?dartmouth) AS ?dartmouth) (SAMPLE(?rsa) AS ?rsa)
             (GROUP_CONCAT(DISTINCT ?perfStr; separator="||") AS ?performers)
             (GROUP_CONCAT(DISTINCT ?labelStr; separator="||") AS ?labels) WHERE {
        ?s wdt:${P.instanceOf} wd:${CLASS.album} .
        OPTIONAL { ?s wdt:${P.title} ?title }
        OPTIONAL { ?s wdt:${P.freedmanTitle} ?freedmanTitle }
        OPTIONAL { ?s rdfs:label ?lbl FILTER(LANG(?lbl)="en") }
        OPTIONAL { ?s wdt:${P.catalogNumber} ?catalog }
        OPTIONAL { ?s wdt:${P.publicationDate} ?pubDate }
        OPTIONAL { ?s wdt:${P.discogsReleaseId} ?discogs }
        OPTIONAL { ?s wdt:${P.freedmanAlbumId} ?freedmanId }
        OPTIONAL { ?s wdt:${P.releaseCover} ?cover }
        OPTIONAL { ?s wdt:${P.spotifyAlbumId} ?spotify }
        OPTIONAL { ?s wdt:${P.youtubePlaylistId} ?youtube }
        OPTIONAL { ?s wdt:${P.dartmouthLink} ?dartmouth }
        OPTIONAL { ?s wdt:${P.rsaLink} ?rsa }
        OPTIONAL { ?s wdt:${P.performer} ?perf . ?perf rdfs:label ?pl FILTER(LANG(?pl)="en")
                   BIND(CONCAT(STR(?perf),"::",?pl) AS ?perfStr) }
        OPTIONAL { ?s wdt:${P.recordLabel} ?lab . ?lab rdfs:label ?ll FILTER(LANG(?ll)="en")
                   BIND(CONCAT(STR(?lab),"::",?ll) AS ?labelStr) }
      } GROUP BY ?s
    `),
    sparql(`
      SELECT ?s ?track (SAMPLE(?tl) AS ?label) (SAMPLE(?qt) AS ?qtitle)
             (GROUP_CONCAT(DISTINCT ?ord; separator="|") AS ?ordinal) (SAMPLE(?dur) AS ?duration) WHERE {
        ?s wdt:${P.instanceOf} wd:${CLASS.album} ; p:${P.tracklist} ?st .
        ?st ps:${P.tracklist} ?track .
        OPTIONAL { ?st pq:${P.seriesOrdinal} ?ord }
        OPTIONAL { ?st pq:${P.title} ?qt }
        OPTIONAL { ?st pq:${P.duration} ?dur }
        OPTIONAL { ?track rdfs:label ?tl FILTER(LANG(?tl)="en") }
      } GROUP BY ?s ?st ?track
    `),
  ]);

  const albums = new Map<string, Album>();
  for (const r of scalarRows) {
    const id = toId(r.s)!;
    albums.set(id, {
      id,
      title: r.title || r.freedmanTitle || r.lbl || id,
      freedmanTitle: r.freedmanTitle,
      catalogNumber: r.catalog,
      publicationDate: r.pubDate,
      discogsReleaseId: r.discogs,
      freedmanAlbumId: r.freedmanId,
      cover: r.cover,
      spotifyAlbumId: r.spotify,
      youtubePlaylistId: r.youtube,
      dartmouthUrl: r.dartmouth,
      rsaUrl: r.rsa,
      performers: parseRefs(r.performers),
      recordLabels: parseRefs(r.labels),
      tracks: [],
    });
  }

  // Group tracks by album, then order each list (see getAlbum for the P104 caveat).
  const byAlbum = new Map<string, typeof trackRows>();
  for (const r of trackRows) {
    const id = toId(r.s)!;
    (byAlbum.get(id) ?? byAlbum.set(id, []).get(id)!).push(r);
  }
  for (const [id, rows] of byAlbum) {
    const album = albums.get(id);
    if (!album) continue;
    const mapped = rows.map((r, i) => {
      const raw = bestOrdinal(r.ordinal);
      return {
        id: toId(r.track),
        label: r.qtitle || r.label || `Track ${i + 1}`,
        ordinal: ordinalKey(raw)[1] || i + 1,
        rawOrdinal: raw,
        duration: r.duration,
        _i: i,
      };
    });
    album.tracks = sortTracks(mapped).map(({ _i, ...t }) => t);
  }

  return albums;
}

// ---------------------------------------------------------------------------
// Derived entities: artists, labels, compositions
//
// Albums already embed their performers, record labels, and tracks, so the
// other entity pages are reverse-indexes over the album cache — no per-entity
// queries. Two small bulk queries enrich artists/labels with their Discogs IDs.
// ---------------------------------------------------------------------------

export type AlbumRef = { id: string; title: string; cover?: string };

export type Artist = {
  id: string;
  name: string;
  albums: AlbumRef[];
  discogsArtistId?: string;
};

export type Label = {
  id: string;
  name: string;
  albums: AlbumRef[];
  discogsLabelId?: string;
};

export type Composition = {
  id: string;
  title: string;
  /** instance-of label for work entities (e.g. "musical work", "song"). */
  type?: string;
  performers: Array<{ id?: string; label: string }>;
  appearsOn: Array<{ albumId: string; albumTitle: string; ordinal: number }>;
  /** Audio-track recordings of this work (reverse P118), with their album(s). */
  recordings: Array<{ id: string; title: string; albums: AlbumRef[] }>;
};

let _artists: Promise<Map<string, Artist>> | null = null;
let _labels: Promise<Map<string, Label>> | null = null;
let _compositions: Promise<Map<string, Composition>> | null = null;

const albumRef = (a: Album): AlbumRef => ({ id: a.id, title: a.title, cover: a.cover });

/** Fetch {entityId -> externalId} for everything carrying a property. */
async function externalIds(prop: string): Promise<Map<string, string>> {
  const rows = await sparql(`SELECT ?s ?v WHERE { ?s wdt:${prop} ?v }`);
  const m = new Map<string, string>();
  for (const r of rows) if (r.s && r.v) m.set(toId(r.s)!, r.v);
  return m;
}

export function getAllArtists(): Promise<Map<string, Artist>> {
  if (!_artists) _artists = buildArtists();
  return _artists;
}

async function buildArtists(): Promise<Map<string, Artist>> {
  const [albums, discogs] = await Promise.all([
    getAllAlbums(),
    externalIds(P.discogsArtistId),
  ]);
  const artists = new Map<string, Artist>();
  for (const album of albums.values()) {
    for (const perf of album.performers) {
      if (!perf.id) continue;
      let artist = artists.get(perf.id);
      if (!artist) {
        artist = { id: perf.id, name: perf.label, albums: [], discogsArtistId: discogs.get(perf.id) };
        artists.set(perf.id, artist);
      }
      artist.albums.push(albumRef(album));
    }
  }
  for (const a of artists.values()) a.albums.sort((x, y) => x.title.localeCompare(y.title));
  return artists;
}

export function getAllLabels(): Promise<Map<string, Label>> {
  if (!_labels) _labels = buildLabels();
  return _labels;
}

async function buildLabels(): Promise<Map<string, Label>> {
  const [albums, discogs] = await Promise.all([
    getAllAlbums(),
    externalIds(P.discogsLabelId),
  ]);
  const labels = new Map<string, Label>();
  for (const album of albums.values()) {
    for (const lab of album.recordLabels) {
      if (!lab.id) continue;
      let label = labels.get(lab.id);
      if (!label) {
        label = { id: lab.id, name: lab.label, albums: [], discogsLabelId: discogs.get(lab.id) };
        labels.set(lab.id, label);
      }
      label.albums.push(albumRef(album));
    }
  }
  for (const l of labels.values()) l.albums.sort((x, y) => x.title.localeCompare(y.title));
  return labels;
}

export function getAllCompositions(): Promise<Map<string, Composition>> {
  if (!_compositions) _compositions = buildCompositions();
  return _compositions;
}

async function buildCompositions(): Promise<Map<string, Composition>> {
  // Two sources, merged by entity id:
  //   1. Every musical-work / composition / song entity (title, type, performers).
  //   2. Anything an album lists in its tracklist (so album → track links resolve).
  // A work that appears in no tracklist still gets a page; a tracklist entry that
  // isn't a catalogued work still gets one too.
  const valuesClause = WORK_CLASSES.map((c) => `wd:${c}`).join(' ');
  const [albums, workRows, recRows] = await Promise.all([
    getAllAlbums(),
    sparql(`
      SELECT ?s (SAMPLE(?title) AS ?title) (SAMPLE(?lbl) AS ?lbl) (SAMPLE(?clsL) AS ?type)
             (GROUP_CONCAT(DISTINCT ?perfStr; separator="||") AS ?performers) WHERE {
        ?s wdt:${P.instanceOf} ?c . VALUES ?c { ${valuesClause} }
        ?c rdfs:label ?clsL FILTER(LANG(?clsL)="en")
        OPTIONAL { ?s wdt:${P.title} ?title }
        OPTIONAL { ?s rdfs:label ?lbl FILTER(LANG(?lbl)="en") }
        OPTIONAL { ?s wdt:${P.performer} ?p . ?p rdfs:label ?pl FILTER(LANG(?pl)="en")
                   BIND(CONCAT(STR(?p),"::",?pl) AS ?perfStr) }
      } GROUP BY ?s
    `),
    // Audio-track recordings of each work: ?rec "recording or performance of" ?work.
    sparql(`
      SELECT ?work ?rec (SAMPLE(?recLabel) AS ?recTitle) WHERE {
        ?rec wdt:${P.recordingOf} ?work .
        ?work wdt:${P.instanceOf} ?c . VALUES ?c { ${valuesClause} }
        OPTIONAL { ?rec rdfs:label ?recLabel FILTER(LANG(?recLabel)="en") }
      } GROUP BY ?work ?rec
    `),
  ]);

  const comps = new Map<string, Composition>();
  for (const r of workRows) {
    const id = toId(r.s)!;
    comps.set(id, {
      id,
      title: r.title || r.lbl || id,
      type: r.type,
      performers: parseRefs(r.performers),
      appearsOn: [],
      recordings: [],
    });
  }

  // Map every tracklist entry (audio track or work) to the albums that list it.
  const trackToAlbums = new Map<string, AlbumRef[]>();
  for (const album of albums.values()) {
    for (const track of album.tracks) {
      if (!track.id) continue;
      let comp = comps.get(track.id);
      if (!comp) {
        comp = { id: track.id, title: track.label, performers: [], appearsOn: [], recordings: [] };
        comps.set(track.id, comp);
      } else if (comp.title === comp.id) {
        comp.title = track.label;
      }
      comp.appearsOn.push({ albumId: album.id, albumTitle: album.title, ordinal: track.ordinal });
      (trackToAlbums.get(track.id) ?? trackToAlbums.set(track.id, []).get(track.id)!).push(albumRef(album));
    }
  }

  // Attach each work's recordings (with the album each recording appears on).
  for (const r of recRows) {
    const work = comps.get(toId(r.work)!);
    const recId = toId(r.rec);
    if (!work || !recId) continue;
    work.recordings.push({
      id: recId,
      title: r.recTitle || recId,
      albums: trackToAlbums.get(recId) ?? [],
    });
  }

  for (const c of comps.values()) {
    c.appearsOn.sort((a, b) => a.albumTitle.localeCompare(b.albumTitle));
    c.recordings.sort((a, b) => a.title.localeCompare(b.title));
  }
  return comps;
}

/** List every album QID (bare, e.g. "Q3257"). Use for getStaticPaths(). */
export async function listAlbumIds(limit?: number): Promise<string[]> {
  const rows = await sparql(
    `SELECT ?s WHERE { ?s wdt:${P.instanceOf} wd:${CLASS.album} } ORDER BY ?s${
      limit ? ` LIMIT ${limit}` : ''
    }`
  );
  return rows.map((r) => toId(r.s)!).filter(Boolean);
}

/** Fetch one album with linked performer/label names and an ordered tracklist. */
export async function getAlbum(qid: string): Promise<Album | null> {
  const [scalar] = await sparql(`
    SELECT ?title ?freedmanTitle ?catalog ?pubDate ?discogs ?freedmanId ?cover ?spotify ?youtube WHERE {
      OPTIONAL { wd:${qid} wdt:${P.title} ?title }
      OPTIONAL { wd:${qid} wdt:${P.freedmanTitle} ?freedmanTitle }
      OPTIONAL { wd:${qid} wdt:${P.catalogNumber} ?catalog }
      OPTIONAL { wd:${qid} wdt:${P.publicationDate} ?pubDate }
      OPTIONAL { wd:${qid} wdt:${P.discogsReleaseId} ?discogs }
      OPTIONAL { wd:${qid} wdt:${P.freedmanAlbumId} ?freedmanId }
      OPTIONAL { wd:${qid} wdt:${P.releaseCover} ?cover }
      OPTIONAL { wd:${qid} wdt:${P.spotifyAlbumId} ?spotify }
      OPTIONAL { wd:${qid} wdt:${P.youtubePlaylistId} ?youtube }
    } LIMIT 1
  `);

  // An album that doesn't even exist returns no scalar row at all.
  if (!scalar) {
    const entity = await getEntity(qid);
    if (!entity) return null;
  }

  const linked = await sparql(`
    SELECT ?prop ?item ?itemLabel WHERE {
      VALUES ?prop { wdt:${P.performer} wdt:${P.recordLabel} }
      wd:${qid} ?prop ?item .
      ?item rdfs:label ?itemLabel FILTER(LANG(?itemLabel)="en")
    }
  `);

  // Group by statement: P104 ("series ordinal") is sometimes multi-valued and
  // non-numeric (e.g. "3-7", "sides"), so a plain join double-counts tracks and
  // an xsd:integer ORDER BY breaks. SAMPLE collapses each statement to one row;
  // we order in JS via sortTracks (handles "A1/B2" sides and plain numbers).
  const trackRows = await sparql(`
    SELECT ?track (SAMPLE(?trackLabel) AS ?label) (SAMPLE(?qtitle) AS ?qt)
           (GROUP_CONCAT(DISTINCT ?ord; separator="|") AS ?ordinal) (SAMPLE(?dur) AS ?duration) WHERE {
      wd:${qid} p:${P.tracklist} ?st .
      ?st ps:${P.tracklist} ?track .
      OPTIONAL { ?st pq:${P.seriesOrdinal} ?ord }
      OPTIONAL { ?st pq:${P.title} ?qtitle }
      OPTIONAL { ?st pq:${P.duration} ?dur }
      OPTIONAL { ?track rdfs:label ?trackLabel FILTER(LANG(?trackLabel)="en") }
    } GROUP BY ?st ?track
  `);

  const performerProp = `${WIKIBASE_BASE}/prop/direct/${P.performer}`;
  const labelProp = `${WIKIBASE_BASE}/prop/direct/${P.recordLabel}`;

  const performers = linked
    .filter((r) => r.prop === performerProp)
    .map((r) => ({ id: toId(r.item), label: r.itemLabel! }));
  const recordLabels = linked
    .filter((r) => r.prop === labelProp)
    .map((r) => ({ id: toId(r.item), label: r.itemLabel! }));

  const mapped = trackRows.map((r, i) => {
    const raw = bestOrdinal(r.ordinal);
    return {
      id: toId(r.track),
      label: r.qt || r.label || `Track ${i + 1}`,
      ordinal: ordinalKey(raw)[1] || i + 1,
      rawOrdinal: raw,
      duration: r.duration,
      _i: i,
    };
  });
  const tracks: AlbumTrack[] = sortTracks(mapped).map(({ _i, ...t }) => t);

  const title =
    scalar?.title || scalar?.freedmanTitle || (await getEntity(qid))?.labels?.en?.value || qid;

  return {
    id: qid,
    title,
    freedmanTitle: scalar?.freedmanTitle,
    catalogNumber: scalar?.catalog,
    publicationDate: scalar?.pubDate,
    discogsReleaseId: scalar?.discogs,
    freedmanAlbumId: scalar?.freedmanId,
    cover: scalar?.cover,
    spotifyAlbumId: scalar?.spotify,
    youtubePlaylistId: scalar?.youtube,
    performers,
    recordLabels,
    tracks,
  };
}
