import type { APIRoute } from 'astro';
import { sparql, toId, P, CLASS } from '../lib/wikibase';

// Static JSON map of track/work QID → an album QID it belongs to. The Algolia
// index has no album link on these records, so the front page loads this and
// routes an audio-track card to its album page. Two relationships: the track's
// own P1 "part of", and the album's P110 "tracklist" pointing back at it.
export const GET: APIRoute = async () => {
  const rows = await sparql(`
    SELECT ?t ?a WHERE {
      ?a wdt:${P.instanceOf} wd:${CLASS.album} .
      { ?t wdt:${P.partOf} ?a } UNION { ?a wdt:${P.tracklist} ?t }
    }
  `);
  const map: Record<string, string> = {};
  for (const r of rows) {
    const t = toId(r.t);
    const a = toId(r.a);
    if (t && a && !map[t]) map[t] = a;
  }
  return new Response(JSON.stringify(map), {
    headers: { 'content-type': 'application/json' },
  });
};
