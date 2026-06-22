#!/usr/bin/env npx tsx
/**
 * Bulk-reclassify "musical work" (Q303) entities to "audio track" (Q302) in
 * shira.wikibase.cloud, using a CSV export from the SPARQL query GUI.
 *
 * Reads entity URIs from the CSV (one per line, header "musical_work"), finds
 * each entity's P39 = Q303 claim, and changes its value to Q302.
 *
 * Usage:
 *   1. Log in to shira.wikibase.cloud
 *   2. Go to Special:BotPasswords and create a bot password with "Edit" rights
 *   3. Dry run (prints what it would change):
 *        npx tsx scripts/reclassify-musicalwork-to-audiotrack.ts path/to/query.csv
 *   4. Apply for real:
 *        WIKI_USER="YourUser@BotName" WIKI_PASS="bot-password" \
 *        npx tsx scripts/reclassify-musicalwork-to-audiotrack.ts path/to/query.csv --apply
 */

import { readFileSync } from 'fs';

const BASE = 'https://shira.wikibase.cloud';
const API = `${BASE}/w/api.php`;

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const APPLY = process.argv.includes('--apply');
const CSV_PATH = args[0];

if (!CSV_PATH) {
  console.error('Usage: npx tsx scripts/reclassify-musicalwork-to-audiotrack.ts <csv-file> [--apply]');
  process.exit(1);
}

const USER = process.env.WIKI_USER;
const PASS = process.env.WIKI_PASS;

if (APPLY && (!USER || !PASS)) {
  console.error('Set WIKI_USER and WIKI_PASS env vars for --apply mode.');
  console.error('Create a bot password at https://shira.wikibase.cloud/wiki/Special:BotPasswords');
  process.exit(1);
}

function parseQids(csvPath: string): string[] {
  const text = readFileSync(csvPath, 'utf-8');
  const ids: string[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const match = trimmed.match(/Q\d+$/);
    if (match) ids.push(match[0]);
  }
  return ids;
}

// --- MediaWiki API helpers ---

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

// Source class to find, target class to change to
const SOURCE_CLASS = 'Q303'; // musical work
const TARGET_CLASS = 'Q302'; // audio track
const TARGET_NUMERIC = 302;

async function reclassify(qid: string, csrfToken: string): Promise<boolean> {
  const entityRes = await fetch(`${BASE}/wiki/Special:EntityData/${qid}.json`, {
    headers: { 'User-Agent': 'shira-reclassify-script' },
  });
  if (!entityRes.ok) { console.error(`  Failed to fetch ${qid}`); return false; }
  const entity = (await entityRes.json() as any).entities[qid];
  const p39Claims: any[] = entity.claims?.P39 ?? [];
  const targetClaim = p39Claims.find(
    (c: any) => c.mainsnak?.datavalue?.value?.id === SOURCE_CLASS
  );
  if (!targetClaim) {
    console.error(`  ${qid}: no P39=${SOURCE_CLASS} claim found (may already be changed)`);
    return false;
  }

  const res = await apiPost({
    action: 'wbsetclaimvalue',
    claim: targetClaim.id,
    snaktype: 'value',
    value: JSON.stringify({ 'entity-type': 'item', 'numeric-id': TARGET_NUMERIC, id: TARGET_CLASS }),
    token: csrfToken,
  });
  if (res.error) {
    console.error(`  ${qid}: ${res.error.info}`);
    return false;
  }
  return true;
}

async function main() {
  const qids = parseQids(CSV_PATH);
  console.log(`Parsed ${qids.length} QIDs from ${CSV_PATH}`);
  console.log(`Will change P39 from ${SOURCE_CLASS} (musical work) → ${TARGET_CLASS} (audio track)\n`);

  if (!APPLY) {
    console.log('DRY RUN — first 20 QIDs:');
    for (const id of qids.slice(0, 20)) console.log(`  ${id}`);
    if (qids.length > 20) console.log(`  ... and ${qids.length - 20} more`);
    console.log(`\nRe-run with --apply to make the changes.`);
    return;
  }

  await login();
  const token = await getCsrfToken();
  let ok = 0, fail = 0;

  for (let i = 0; i < qids.length; i++) {
    const qid = qids[i];
    process.stdout.write(`[${i + 1}/${qids.length}] ${qid}...`);
    const success = await reclassify(qid, token);
    if (success) { ok++; console.log(' ✓'); }
    else { fail++; console.log(' ✗'); }
    // Small delay to avoid hammering the API
    if (i < qids.length - 1) await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nDone. ${ok} reclassified, ${fail} failed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
