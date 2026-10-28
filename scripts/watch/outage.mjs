// Outage alerts (#34, built 28 Oct 2026; no new accounts: GitHub Actions + GitHub issues).
// Run every 10 minutes by .github/workflows/watch.yml:  node scripts/watch/outage.mjs
//
// Opens the website, the admin app, HQ, and the gym server (Supabase) through our own /sb address,
// the way the apps reach it. Each check is tried 3 times, a little apart, so one slow answer is not
// an outage. Then, on the GitHub issue labelled "outage":
//   something down, no open issue  -> open one (GitHub emails the owner; the issue @mentions him)
//   something down, issue open     -> a comment only when WHAT is down changes (no email every 10 min)
//   all fine, issue open           -> a comment "back" and the issue is closed
// The public, read-only app key is the only key used (the same one inside both apps).
import { pathToFileURL } from 'node:url';

import { github, indiaTime } from './github.mjs';

const KEY = 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';
export const OWNER = 'aucksy';
export const LABEL = 'outage';

export const CHECKS = [
  { name: 'Website (mettleup.fit)', url: 'https://mettleup.fit/', ok: (s, t) => s === 200 && /<html/i.test(t) },
  { name: 'Admin app (app.mettleup.fit)', url: 'https://app.mettleup.fit/', ok: (s, t) => s === 200 && t.includes('id="root"') },
  { name: 'HQ (hq.mettleup.fit)', url: 'https://hq.mettleup.fit/signin.css', ok: (s) => s === 200 },
  {
    name: 'Gym server (data, through app.mettleup.fit/sb)',
    url: 'https://app.mettleup.fit/sb/rest/v1/gyms?select=gym_id&limit=1',
    headers: { apikey: KEY },
    ok: (s, t) => s === 200 && t.trim().startsWith('['),
  },
  {
    name: 'Gym server (sign-in, through app.mettleup.fit/sb)',
    url: 'https://app.mettleup.fit/sb/auth/v1/health',
    headers: { apikey: KEY },
    ok: (s) => s === 200,
  },
];

/** One check, tried up to `tries` times. Returns null when fine, else what went wrong (plain words). */
export async function runCheck(check, { fetchImpl = fetch, tries = 3, gapMs = 20_000, timeoutMs = 20_000, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last = '';
  for (let i = 0; i < tries; i++) {
    if (i > 0) await wait(gapMs);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(check.url, { headers: { 'User-Agent': 'mettleup-watch', ...check.headers }, signal: ctrl.signal, redirect: 'follow' });
      const text = await res.text();
      if (check.ok(res.status, text)) return null;
      last = `answered ${res.status}`;
    } catch (e) {
      last = e?.name === 'AbortError' ? `no answer in ${timeoutMs / 1000} s` : `could not connect (${String(e?.message ?? e).slice(0, 120)})`;
    } finally {
      clearTimeout(timer);
    }
    console.log(`[outage] ${check.name}: try ${i + 1} failed: ${last}`);
  }
  return last;
}

const TITLE_PREFIX = 'Outage: ';

/** The issue's title for what is down. PURE. */
export function titleFor(down) {
  return `${TITLE_PREFIX}${down.map((d) => d.name.replace(/ \(.*\)$/, '')).join(', ')} not answering`;
}

/** What to do on GitHub. PURE. `down`: [{ name, why }]; `open`: the open outage issue or null. */
export function plan(down, open) {
  if (down.length === 0) return open ? { kind: 'close' } : { kind: 'none' };
  if (!open) return { kind: 'open', title: titleFor(down) };
  return open.title === titleFor(down) ? { kind: 'none' } : { kind: 'change', title: titleFor(down) };
}

/** The words of a report. PURE. */
export function reportBody(down, when, runUrl) {
  return [
    `MettleUp check at ${when} (India time): ${down.length === 1 ? 'this part is' : 'these parts are'} not answering.`,
    '',
    ...down.map((d) => `- **${d.name}**: ${d.why}`),
    '',
    'Members or gyms may not be able to open it now. I check every 10 minutes and close this issue by myself when everything answers again.',
    runUrl ? `\nCheck details: ${runUrl}` : '',
    `\n@${OWNER}`,
  ].join('\n');
}

export async function main({ env = process.env, fetchImpl = fetch, now = () => new Date(), checkOpts = {} } = {}) {
  const results = await Promise.all(CHECKS.map(async (c) => ({ name: c.name, why: await runCheck(c, { fetchImpl, ...checkOpts }) })));
  const down = results.filter((r) => r.why !== null);
  for (const r of results) console.log(`[outage] ${r.why === null ? 'OK  ' : 'DOWN'} ${r.name}${r.why ? `: ${r.why}` : ''}`);

  const gh = github({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPOSITORY, fetchImpl });
  const open = (await gh.issues(LABEL, 'open'))[0] ?? null;
  const step = plan(down, open);
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : '';
  const when = indiaTime(now());
  if (step.kind === 'open') {
    await gh.ensureLabel(LABEL, 'b60205', 'A part of MettleUp is not answering (opened and closed by the watch workflow)');
    const issue = await gh.create(step.title, reportBody(down, when, runUrl), [LABEL]);
    console.log(`[outage] opened issue #${issue.number}`);
  } else if (step.kind === 'change') {
    await gh.update(open.number, { title: step.title });
    await gh.comment(open.number, `What is down changed.\n\n${reportBody(down, when, runUrl)}`);
    console.log(`[outage] updated issue #${open.number}`);
  } else if (step.kind === 'close') {
    await gh.comment(open.number, `Everything answers again (checked ${when}, India time). Closing.`);
    await gh.update(open.number, { state: 'closed', state_reason: 'completed' });
    console.log(`[outage] closed issue #${open.number}`);
  }
  return { down, step };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error('[outage] the watch itself failed:', e);
    process.exitCode = 1;
  });
}
