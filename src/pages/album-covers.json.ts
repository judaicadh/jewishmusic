import type { APIRoute } from 'astro';
import { getAllAlbums } from '../lib/wikibase';

// Static JSON map of album QID → cover-art URL (Wikibase P160 "release cover").
// The front-page Algolia index doesn't carry the cover, so AlbumGrid loads this
// at runtime and fills covers in by objectID. Generated at build time.
export const GET: APIRoute = async () => {
  const albums = await getAllAlbums();
  const map: Record<string, string> = {};
  for (const a of albums.values()) if (a.cover) map[a.id] = a.cover;
  return new Response(JSON.stringify(map), {
    headers: { 'content-type': 'application/json' },
  });
};
