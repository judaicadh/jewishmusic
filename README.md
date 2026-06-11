# Shira — Jewish Music Collections at Penn Libraries

A static [Astro](https://astro.build) site for the Freedman / Penn Libraries Jewish
music collections. All catalog data comes from the project's Wikibase instance,
**[shira.wikibase.cloud](https://shira.wikibase.cloud)**, fetched at build time and
rendered to static HTML. Search runs entirely in the browser via
[Pagefind](https://pagefind.app) — there is **no hosted search service and no
database** to maintain.

## How it works

```
shira.wikibase.cloud ──(SPARQL + Special:EntityData, at build time)──▶ Astro
        │                                                                 │
        │                                                      static HTML per album
        │                                                                 ▼
        └──────────────────────────────────────────▶ Pagefind indexes the HTML
                                                       → /pagefind/ (client-side search)
```

1. **Build time** — `src/lib/wikibase.ts` loads the whole album catalog in two
   bulk SPARQL queries and Astro generates one static page per album.
2. **Pagefind** indexes the generated HTML into `/pagefind/` and provides faceted,
   typo-tolerant search that runs in the visitor's browser.
3. **Deploy** — static output is published to Netlify. Because the data is baked in
   at build time, a Wikibase edit appears on the site after the next **rebuild**
   (trigger a Netlify build hook manually or on a schedule).

## Project layout

| Path | Purpose |
|------|---------|
| `src/lib/wikibase.ts` | Wikibase client: SPARQL helper, `getEntity()`, property/class ID constants, and the memoized bulk loader `getAllAlbums()`. |
| `src/pages/album/[id].astro` | One static page per album, rendered from Wikibase. |
| `src/pages/album/index.astro` | Album browse grid (client-paginated over the full catalog) + Pagefind search. |
| `src/pages/artist/`, `label/`, `composition/` | Detail + index pages for each entity type. Artists/labels are reverse-indexed from the album cache; compositions merge the musical-work/song entities with album-tracklist membership (`getAllArtists` / `getAllLabels` / `getAllCompositions`). |
| `src/components/PagefindSearch.astro` | Loads the Pagefind UI and wires up the `type` / `year` / `performer` / `label` filters. |
| `src/layouts/BaseLayout.astro` | Shared HTML shell, SEO, header/footer. |

## Local development

```bash
npm install
npm run dev          # http://localhost:4321 — fast iteration
```

> ⚠️ **Search does not work under `npm run dev`.** Pagefind builds its index from
> the *built* HTML, so `/pagefind/` only exists after a production build. To test
> search, build and serve the static output:

```bash
npm run build        # astro build && pagefind --site dist
npx serve dist       # or any static file server
```

### Faster builds while developing

A full build generates ~6,355 album pages. To cap it during development, set
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

## Tech stack

Astro 6 · React 19 (islands) · Tailwind CSS 4 · Pagefind · Netlify adapter.

## Status & roadmap

- [x] Wikibase client + bulk loader
- [x] Static album detail pages from Wikibase
- [x] Album browse + Pagefind search (Algolia removed from the album flow)
- [x] Artist / composition / label pages (reverse-indexed from the album cache)
- [ ] Netlify build hook for rebuild-on-edit (optionally nightly)
- [ ] Remove remaining Algolia code (`AlbumGrid.tsx`, `algoliasearch`, `react-instantsearch`)
