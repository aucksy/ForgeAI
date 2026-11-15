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
// R-601: HQ's direct-read record (hq.mettleup.fit/readlog/status) counts as down when it has failed for an hour
// (same issue, same emails). And once, 30 days before the logs key ends, a reminder issue labelled "key-reminder"
// (closed by itself when a new end date is saved).
import { pathToFileURL } from 'node:url';

import { github, indiaTime } from './github.mjs';

const KEY = 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';
export const OWNER = 'aucksy';
export const LABEL = 'outage';
export const REMINDER_LABEL = 'key-reminder';
const READ_LOG_URL = 'https://hq.mettleup.fit/readlog/status';

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
  {
    // The nightly backup (deploy/hq/backup.js, launch audit 3 Nov 2026): "down" when last night's copy failed or
    // is older than 30 hours. Before the backup is deployed and switched on, this address answers with the
    // sign-in page (not this JSON) or setUp:false: that is "not switched on yet", never an alarm.
    name: 'Nightly backup (hq.mettleup.fit/backup/status)',
    url: 'https://hq.mettleup.fit/backup/status',
    ok: (s, t) => backupOk(s, t),
    why: () => "last night's copy of the gym data failed or is late (older than 30 hours)",
  },
  {
    // R-601 (deploy/hq/readLogAlert.js): "down" only after the record has failed for an hour without a break.
    // Not deployed yet (the sign-in page answers) or no logs key saved: never an alarm.
    name: 'Read log (hq.mettleup.fit/readlog/status)',
    url: READ_LOG_URL,
    members: false,
    ok: (s, t) => readLogOk(s, t),
    why: (s, t) => readLogWhy(t),
  },
];

/** The backup's answer: fine, or not switched on yet. PURE. */
export function backupOk(status, text) {
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    return true; // not deployed yet: the sign-in page answers
  }
  if (!b || typeof b !== 'object' || !('fresh' in b) || b.setUp === false) return true;
  return status === 200 && b.fresh === true;
}

/** The read log's answer as JSON, or null (not deployed yet). PURE. */
function readLogBody(text) {
  try {
    const b = JSON.parse(text);
    return b && typeof b === 'object' && 'on' in b ? b : null;
  } catch {
    return null;
  }
}

/** The read log: fine, off, or not deployed yet; down only when it has failed for an hour. PURE. */
export function readLogOk(status, text) {
  const b = readLogBody(text);
  if (!b || b.on !== true) return true;
  return !(status === 200 && b.failing === true);
}

const READ_LOG_WHY = {
  key: 'Supabase refused the logs key (it may have ended or been deleted)',
  unreachable: "Supabase's logs service did not answer",
  logs: 'Supabase would not give the logs',
  server: 'the gym server did not take the record',
  setup: 'the gym server is missing the read log setup',
};

/** The read log's trouble in plain words. PURE. */
export function readLogWhy(text) {
  const b = readLogBody(text) || {};
  const since = Date.parse(b.failingSince || '');
  return `the record of direct looks at gym data has not worked since ${Number.isFinite(since) ? `${indiaTime(new Date(since))} (India time)` : 'over an hour ago'}: `
    + `${READ_LOG_WHY[b.why] || 'it stopped with an error'}. Supabase keeps its logs only about a day, so fix it today. HQ shows the same warning.`;
}

/** "14 Nov 2027" from "2027-11-14". PURE. */
function dayWords(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}

/** The reminder issue's title for a key end date. PURE. */
export function reminderTitle(keyEnds) {
  return `Reminder: the Supabase logs key ends on ${dayWords(keyEnds)}`;
}

/** The reminder issue's words. PURE. */
export function reminderBody(keyEnds) {
  return [
    `MettleUp HQ reads Supabase's logs with a key that ends on ${dayWords(keyEnds)}. After that day, direct looks at gym data stop being recorded.`,
    '',
    'Before then:',
    '- In Supabase, make a new "Logs read" token for the MettleUp project.',
    '- Paste it into Add a key as SUPABASE_LOGS_TOKEN.',
    '- Tell Claude its end date. This reminder then closes by itself.',
    '',
    `@${OWNER}`,
  ].join('\n');
}

/**
 * The key reminder: open one issue per end date (never twice, even after it was closed), close an open one when
 * the end date moved. `status`: /readlog/status as JSON or null; `issues`: every key-reminder issue. PURE.
 */
export function reminderPlan(status, issues) {
  if (!status || status.on !== true || !/^\d{4}-\d\d-\d\d$/.test(String(status.keyEnds || ''))) return { open: null, close: [] };
  const title = reminderTitle(status.keyEnds);
  const list = Array.isArray(issues) ? issues : [];
  const open = status.renewNow === true && !list.some((i) => i.title === title) ? title : null;
  const close = list.filter((i) => i.state === 'open' && (status.renewNow !== true || i.title !== title)).map((i) => i.number);
  return { open, close };
}

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
      last = check.why ? check.why(res.status, text) : `answered ${res.status}`;
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
  return `${TITLE_PREFIX}${down.map((d) => d.name.replace(/ \(.*\)$/, '')).join(', ')} ${down.every((d) => d.members === false) ? 'not working' : 'not answering'}`;
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
    down.some((d) => d.members !== false)
      ? 'Members or gyms may not be able to open it now. I check every 10 minutes and close this issue by myself when everything answers again.'
      : 'Members and gyms are not affected. I check every 10 minutes and close this issue by myself when it works again.',
    runUrl ? `\nCheck details: ${runUrl}` : '',
    `\n@${OWNER}`,
  ].join('\n');
}

export async function main({ env = process.env, fetchImpl = fetch, now = () => new Date(), checkOpts = {} } = {}) {
  const results = await Promise.all(CHECKS.map(async (c) => ({ name: c.name, members: c.members !== false, why: await runCheck(c, { fetchImpl, ...checkOpts }) })));
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
  // R-601: the logs key reminder. Its own try: it never stops the outage alert above.
  let reminder = { open: null, close: [] };
  try {
    reminder = await keyReminder(gh, fetchImpl, when);
  } catch (e) {
    console.error('[outage] key reminder failed:', String(e?.message ?? e).slice(0, 200));
  }
  return { down, step, reminder };
}

/** Reads /readlog/status once and opens or closes the key reminder issue. */
async function keyReminder(gh, fetchImpl, when) {
  let status = null;
  try {
    const res = await fetchImpl(READ_LOG_URL, { headers: { 'User-Agent': 'mettleup-watch' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    status = res.ok ? readLogBody(await res.text()) : null;
  } catch {
    status = null;
  }
  if (!status || status.on !== true || !status.keyEnds) return { open: null, close: [] };
  const step = reminderPlan(status, await gh.issues(REMINDER_LABEL, 'all'));
  if (step.open) {
    await gh.ensureLabel(REMINDER_LABEL, 'fbca04', 'A key MettleUp uses is about to end (opened and closed by the watch workflow)');
    const issue = await gh.create(step.open, reminderBody(status.keyEnds), [REMINDER_LABEL]);
    console.log(`[outage] opened key reminder #${issue.number}`);
  }
  for (const n of step.close) {
    await gh.comment(n, `A new end date is saved for the logs key (${status.keyEnds}, checked ${when}, India time). Closing this reminder.`);
    await gh.update(n, { state: 'closed', state_reason: 'completed' });
    console.log(`[outage] closed key reminder #${n}`);
  }
  return step;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error('[outage] the watch itself failed:', e);
    process.exitCode = 1;
  });
}
