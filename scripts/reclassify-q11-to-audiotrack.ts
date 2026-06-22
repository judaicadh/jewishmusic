#!/usr/bin/env npx tsx
/**
 * Bulk-reclassify misclassified Q11 ("musical work/composition") entities to
 * Q302 ("audio track") in shira.wikibase.cloud.
 *
 * Only Q11 entities WITHOUT P26 ("language of work or name") are changed —
 * those with P26 are true compositions (A la una, Tzena Tzena, Chad Gadya,
 * Hava Nagila) and are left alone.
 *
 * Usage:
 *   1. Log in to shira.wikibase.cloud in the browser
 *   2. Go to Special:BotPasswords and create a bot password with "Edit" rights
 *   3. Run:  WIKI_USER="YourUser@BotName" WIKI_PASS="bot-password" npx tsx scripts/reclassify-q11-to-audiotrack.ts
 *
 * Dry-run (default): prints what it would change. Pass --apply to actually edit.
 */

const BASE = 'https://shira.wikibase.cloud';
const SPARQL = `${BASE}/query/sparql`;
const API = `${BASE}/w/api.php`;

const APPLY = process.argv.includes('--apply');
const USER = process.env.WIKI_USER;
const PASS = process.env.WIKI_PASS;

if (APPLY && (!USER || !PASS)) {
  console.error('Set WIKI_USER and WIKI_PASS env vars for --apply mode.');
  console.error('Create a bot password at https://shira.wikibase.cloud/wiki/Special:BotPasswords');
  process.exit(1);
}

const PREFIXES = `
PREFIX wd: <${BASE}/entity/>
PREFIX wdt: <${BASE}/prop/direct/>
`;

async function sparql(query: string): Promise<Array<Record<string, string>>> {
  const res = await fetch(SPARQL, {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'shira-reclassify-script',
    },
    body: new URLSearchParams({ query: PREFIXES + query }),
  });
  if (!res.ok) throw new Error(`SPARQL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json() as any;
  return json.results.bindings.map((b: any) => {
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(b)) row[k] = (v as any).value;
    return row;
  });
}

const toId = (uri: string) => uri.split('/').pop()!;

async function findMisclassified(): Promise<string[]> {
  const rows = await sparql(`
    SELECT ?s WHERE {
      ?s wdt:P39 wd:Q11 .
      FILTER NOT EXISTS { ?s wdt:P26 ?lang }
    }
  `);
  return rows.map((r) => toId(r.s));
}

// --- MediaWiki API login + edit ---

let cookies: string[] = [];

function cookieHeader(): string {
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

async function apiPost(params: Record<string, string>): Promise<any> {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'shira-reclassify-script',
      Cookie: cookieHeader(),
    },
    body: new URLSearchParams({ format: 'json', ...params }),
    redirect: 'manual',
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  if (setCookies.length) cookies.push(...setCookies);
  return res.json();
}

async function login() {
  const tokenRes = await apiPost({ action: 'query', meta: 'tokens', type: 'login' });
  const loginToken = tokenRes.query.tokens.logintoken;
  const loginRes = await apiPost({
    action: 'login',
    lgname: USER!,
    lgpassword: PASS!,
    lgtoken: loginToken,
  });
  if (loginRes.login?.result !== 'Success') {
    console.error('Login failed:', JSON.stringify(loginRes.login));
    process.exit(1);
  }
  console.log(`Logged in as ${loginRes.login.lgusername}`);
}

async function getCsrfToken(): Promise<string> {
  const res = await apiPost({ action: 'query', meta: 'tokens', type: 'csrf' });
  return res.query.tokens.csrftoken;
}

async function reclassify(qid: string, csrfToken: string): Promise<boolean> {
  // Fetch entity to find the P39=Q11 claim GUID
  const entityRes = await fetch(`${BASE}/wiki/Special:EntityData/${qid}.json`, {
    headers: { 'User-Agent': 'shira-reclassify-script' },
  });
  if (!entityRes.ok) { console.error(`  Failed to fetch ${qid}`); return false; }
  const entity = (await entityRes.json() as any).entities[qid];
  const p39Claims: any[] = entity.claims?.P39 ?? [];
  const targetClaim = p39Claims.find(
    (c: any) => c.mainsnak?.datavalue?.value?.id === 'Q11'
  );
  if (!targetClaim) { console.error(`  ${qid}: no P39=Q11 claim found`); return false; }

  // Change Q11 → Q302 (audio track)
  const res = await apiPost({
    action: 'wbsetclaimvalue',
    claim: targetClaim.id,
    snaktype: 'value',
    value: JSON.stringify({ 'entity-type': 'item', 'numeric-id': 302, id: 'Q302' }),
    token: csrfToken,
  });
  if (res.error) {
    console.error(`  ${qid}: ${res.error.info}`);
    return false;
  }
  return true;
}

async function main() {
  console.log('Finding Q11 entities without P26 (misclassified recordings)...');
  const ids = await findMisclassified();
  console.log(`Found ${ids.length} misclassified Q11 entities.\n`);

  if (!APPLY) {
    console.log('DRY RUN — these would be changed from Q11 → Q302 (audio track):');
    for (const id of ids) console.log(`  ${id}`);
    console.log(`\nRe-run with --apply to make the changes.`);
    return;
  }

  await login();
  const token = await getCsrfToken();
  let ok = 0, fail = 0;

  for (let i = 0; i < ids.length; i++) {
    const qid = ids[i];
    process.stdout.write(`[${i + 1}/${ids.length}] ${qid}...`);
    const success = await reclassify(qid, token);
    if (success) { ok++; console.log(' ✓'); }
    else { fail++; console.log(' ✗'); }
    // Small delay to avoid hammering the API
    if (i < ids.length - 1) await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nDone. ${ok} reclassified, ${fail} failed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
