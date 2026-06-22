import type { APIRoute } from 'astro';
import { sparql, toId, P } from '../lib/wikibase';

// Static JSON map of track/recording QID → the composition it is a "recording
// or performance of" (Wikibase P118). The Algolia index doesn't carry P118, so
// the front page loads this and links an audio-track card to its composition
// page. All P118 targets are musical work/composition (Q11), which have pages.
export const GET: APIRoute = async () => {
  const rows = await sparql(`SELECT ?t ?w WHERE { ?t wdt:${P.recordingOf} ?w }`);
  const map: Record<string, string> = {};
  for (const r of rows) {
    const t = toId(r.t);
    const w = toId(r.w);
    if (t && w && !map[t]) map[t] = w;
  }
  return new Response(JSON.stringify(map), {
    headers: { 'content-type': 'application/json' },
  });
};
