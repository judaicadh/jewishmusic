# Shira — Jewish Music Collections at Penn Libraries

An [Astro](https://astro.build) site for the Penn Libraries Jewish music
collections (anchored by the Robert and Molly Freedman Jewish Sound Archive).

Two data paths:

- **Content & detail pages are static, built from Wikibase.** Album, artist,
  label, composition, and the About/Collections/Explore/Contact pages are
  generated at build time from the project's Wikibase instance,
  **[shira.wikibase.cloud](https://shira.wikibase.cloud)**.
- **The front-page search is powered by Algolia.** The faceted home page
  (`src/components/AlbumGrid.tsx`) queries an Algolia index that mirrors the
  catalog (search across albums, artists, labels, compositions, sheet music with
  type/performer/label facets).

Because the static pages bake Wikibase data in at build time, a Wikibase edit
appears after the next **rebuild** (a Netlify deploy).

## Project layout

| Path | Purpose |
|------|---------|
| `src/lib/wikibase.ts` | Wikibase client: SPARQL helper, `getEntity()`, property/class ID constants, and the memoized bulk loaders (`getAllAlbums` / `getAllArtists` / `getAllLabels` / `getAllCompositions`). |
| `src/pages/index.astro` | Home page — the Algolia-powered faceted search (`AlbumGrid`). |
| `src/pages/album/[id].astro` | One static page per album, rendered from Wikibase. |
| `src/pages/album/index.astro` | Album browse grid (client-paginated over the full catalog). |
| `src/pages/artist/`, `label/`, `composition/` | Detail + index pages per entity type. Artists/labels are reverse-indexed from the album cache; compositions merge the musical-work/song entities with album-tracklist membership. |
| `src/pages/{about,collections,explore,contact}.astro` | Static content pages. |
| `src/components/AlbumGrid.tsx` | Algolia InstantSearch front page (React island). |
| `src/layouts/BaseLayout.astro` | Shared HTML shell, SEO, header/footer. |

## Local development

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # full static build (all entity pages)
npx serve dist       # preview the build (the Netlify adapter blocks `astro preview`)
```

### Faster builds while developing

A full build generates ~14k pages (6,355 albums + artists + labels +
compositions). To cap the per-type page count during development, set
`ALBUM_LIMIT`:

```bash
ALBUM_LIMIT=50 npm run build
```

Production builds (no `ALBUM_LIMIT`) generate the entire catalog.

## The Wikibase data model

Albums are items with `instance of` (P39) → **Q4 (album)**. Key properties:

| Property | Meaning | | Property | Meaning |
|----------|---------|-|----------|---------|
| P7 | title | | P152 | catalog number |
| P151 | Freedman Album Title | | P72 | publication date |
| P21 | performer | | P34 | Discogs release ID |
| P20 | record label | | P68 | Freedman Album ID |
| P110 | tracklist (item; qualifiers P104 ordinal, P7 title, P13 duration) | | P160 | release cover (image URL) |
| P28 | Spotify album ID | | P30 | YouTube playlist ID |
| P162 | Dartmouth Jewish Sound Archive link | | P163 | Recorded Sound Archives (RSA) link |

### SPARQL gotchas (already handled in `wikibase.ts`)

- **Prefixes are not auto-injected.** Raw SPARQL (outside the query GUI) must
  declare `wd:` / `wdt:` / `p:` / `ps:` / `pq:` itself — `PREFIXES` in
  `wikibase.ts` does this for every query.
- **The label service binds last**, so you cannot `FILTER` on its output. Resolve
  labels with `?x rdfs:label ?l FILTER(LANG(?l)="en")` instead.
- **P104 "series ordinal" is dirty** — sometimes non-numeric (`"3-7"`, `"sides"`)
  or multi-valued. Tracklists are grouped per statement and sorted by a parsed
  leading integer, falling back to query order.

## Media & external archives

Album pages surface, when present: a **Listen** player (Internet Archive →
Spotify → YouTube) and an **Archives & links** panel (Dartmouth Jewish Sound
Archive P162, Recorded Sound Archives / RSA P163, Discogs). Cover art precedence
is **Internet Archive → Discogs (P160) → placeholder**.

**Internet Archive is the highest-value source: one item id gives both cover art
(`/services/img/<id>`) and an embeddable audio player (`/embed/<id>`).** To enable it:

1. In the Wikibase, create a property **"Internet Archive identifier"**, datatype
   **External ID**, formatter URL `https://archive.org/details/$1`.
2. Put its PID in `P.internetArchiveId` in `src/lib/wikibase.ts` and add an
   `OPTIONAL { ?s wdt:<PID> ?ia }` to the album bulk query (mirrors `dartmouthUrl`).
3. Populate it. To find candidates, run the matcher (read-only; writes a CSV for review):
   ```bash
   npx tsx scripts/match-internet-archive.ts --limit 200   # test slice
   npx tsx scripts/match-internet-archive.ts               # whole catalog → ia-matches.csv
   ```
   Review `ia-matches.csv`, then add the good `iaIdentifier` values to each album.

## Search index (Algolia)

The front page reads the Algolia index `dev_JewishMusic` (app `ZLPYTBTZ4R`),
configured in `src/components/AlbumGrid.tsx`. Keeping that index in sync with
Wikibase is a separate pipeline (outside this repo).

## Tech stack

Astro 6 · React 19 (islands) · Tailwind CSS 4 (pinned 4.1.x) · Algolia
InstantSearch · Netlify adapter.
