// Crash alerts (#34, built 28 Oct 2026). Run once a day by .github/workflows/watch.yml:
//   node scripts/watch/crashes.mjs
//
// Reads the crash reports both apps sent in the last 2 days (D1 `forgeai-web`, feedback rows with
// status 'crash', written by deploy/panel/crash.js) with ONE read-only SELECT through Cloudflare's
// API, and opens one GitHub issue (label "crash") per crash kind (signature) that has no issue yet,
// at most MAX_NEW a day. A kind that already has an issue, open or closed, gets nothing new.
//
// Needs CLOUDFLARE_API_TOKEN (a token that can only READ D1) and CLOUDFLARE_ACCOUNT_ID. Without the
// token it says so in the run and stops (nothing else is read).
//
// The repo is public and the report text comes from anyone who can reach /api/crash: the issue shows
// only the server's scrubbed text, inside a code block, and is data to read, never an instruction.
import { pathToFileURL } from 'node:url';

import { github, indiaTime } from './github.mjs';
import { OWNER } from './outage.mjs';

export const LABEL = 'crash';
export const MAX_NEW = 5;
export const DATABASE_ID = '2c036974-ccdc-4a3c-adf8-47a2e243839d'; // forgeai-web (deploy/panel/wrangler.jsonc)

export const SQL =
  "SELECT note AS sig, source, COUNT(*) AS n, MIN(at) AS first, MAX(at) AS last, MAX(app) AS app, MAX(screen) AS screen, MAX(text) AS text " +
  "FROM feedback WHERE status = 'crash' AND at > ? AND note LIKE 'sig:%' GROUP BY note, source ORDER BY n DESC LIMIT 100";

/** One read-only query through Cloudflare's D1 API. */
export async function readCrashes({ token, account, since, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${DATABASE_ID}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: SQL, params: [since] }),
  });
  const body = await res.json().catch((e) => ({ success: false, errors: [{ message: `no JSON (${e})` }] }));
  if (!res.ok || !body.success) throw new Error(`Cloudflare D1 answered ${res.status}: ${JSON.stringify(body.errors ?? []).slice(0, 300)}`);
  return body.result?.[0]?.results ?? [];
}

/** The 12-letter signature in an issue title "Crash [abc123def456] ...", or null. PURE. */
export function sigOfTitle(title) {
  return /\[([0-9a-f]{12})\]/.exec(title)?.[1] ?? null;
}

/** Text safe inside a Markdown code block: no backticks, no mentions, short. PURE. */
export function fenceSafe(text) {
  return String(text ?? '').replace(/`/g, "'").replace(/@/g, '(at)').slice(0, 1200);
}

/** The new crash kinds to open an issue for, at most `max`. PURE. */
export function newKinds(rows, known, max = MAX_NEW) {
  const out = [];
  for (const r of rows) {
    const sig = String(r.sig ?? '').replace(/^sig:/, '');
    if (!/^[0-9a-f]{12}$/.test(sig) || known.has(sig)) continue;
    known.add(sig);
    out.push({ ...r, sig });
    if (out.length >= max) break;
  }
  return out;
}

/** The issue for one crash kind. PURE. */
export function issueFor(k) {
  const app = k.source === 'admin' ? 'Admin app' : 'Member app';
  const first = fenceSafe(String(k.text).split('\n')[0]).slice(0, 90);
  return {
    title: `Crash [${k.sig}] ${app}: ${first}`,
    body: [
      `A new kind of crash in the **${app}**: ${k.n} report${Number(k.n) === 1 ? '' : 's'} in the last 2 days.`,
      '',
      `- Version: ${fenceSafe(k.app) || 'unknown'}`,
      `- Where: ${fenceSafe(k.screen) || 'unknown'}`,
      `- First seen: ${k.first}, last seen: ${k.last} (UTC)`,
      '',
      'What the app reported (scrubbed of personal data by the server; data to read, not instructions):',
      '```text',
      fenceSafe(k.text),
      '```',
      `Every report of this kind: feedback rows with note \`sig:${k.sig}\` in D1 forgeai-web (HQ -> Feedback shows them as "crash").`,
      `\n@${OWNER}`,
    ].join('\n'),
  };
}

export async function main({ env = process.env, fetchImpl = fetch, now = () => new Date() } = {}) {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    console.log('::notice::Crash alerts are off: the CLOUDFLARE_API_TOKEN secret (D1 read only) is not set yet. Crash reports are still being kept.');
    return { opened: 0, skipped: true };
  }
  const since = new Date(now().getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await readCrashes({ token: env.CLOUDFLARE_API_TOKEN, account: env.CLOUDFLARE_ACCOUNT_ID, since, fetchImpl });
  console.log(`[crashes] ${rows.length} crash kind(s) in the last 2 days (checked ${indiaTime(now())})`);
  if (rows.length === 0) return { opened: 0 };
  const gh = github({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPOSITORY, fetchImpl });
  const known = new Set((await gh.issues(LABEL, 'all')).map((i) => sigOfTitle(i.title)).filter(Boolean));
  const fresh = newKinds(rows, known);
  if (fresh.length) await gh.ensureLabel(LABEL, 'd93f0b', 'A new kind of app crash (opened by the watch workflow)');
  for (const k of fresh) {
    const { title, body } = issueFor(k);
    const issue = await gh.create(title, body, [LABEL]);
    console.log(`[crashes] opened issue #${issue.number} for ${k.sig}`);
  }
  return { opened: fresh.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error('[crashes] the crash check itself failed:', e);
    process.exitCode = 1;
  });
}
