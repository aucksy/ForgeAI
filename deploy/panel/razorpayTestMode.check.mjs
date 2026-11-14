// R-547 (owner, 14 Nov 2026): our REAL Razorpay code against Razorpay's REAL test API, in the cloud only (ci.yml job
// "razorpay-test-mode"). Every other payment test uses a pretend Razorpay; this one asks the real one, so a change in
// what Razorpay answers shows up here before a gym meets it.
//
// What it does, with the owner's Razorpay TEST keys (GitHub secrets RAZORPAY_TEST_KEY_ID / RAZORPAY_TEST_KEY_SECRET):
//   1. our key check and Razorpay's own answer accept the keys;
//   2. makes a Rs 1 payment link; Razorpay says "created"; we read it as open, never paid;
//   3. the server's own 10-minute check (scheduledPay, on a throw-away database) asks Razorpay: still open, not paid;
//   4. cancels it; Razorpay says "cancelled"; we read it as cancelled, never paid; the 10-minute check closes it and
//      stops asking ("done"), still not paid; a second cancel is a refusal we handle, not a crash;
//   5. a wrong secret is BAD_KEYS (not a crash) at the key check and at the status check, and the 10-minute check
//      switches that connection off as "bad keys" instead of falling over.
//
// Safety: TEST MODE ONLY. It refuses to run unless the Key ID starts with rzp_test_, and payments here are never live
// (PAY_LIVE is not set). It never prints a key. No keys at all (a fork, a pull request): it says so and passes.
// Run: node deploy/panel/razorpayTestMode.check.mjs   (not a *.test.mjs file, so the normal test run never calls out)

import { scheduledPay } from './pay.js';
import { seal } from './payCrypto.js';
import { PayError, razorpay } from './payProviders.js';
import { sqliteD1 } from './sqliteD1.mjs';

const keyId = String(process.env.RAZORPAY_TEST_KEY_ID || '').trim();
const keySecret = String(process.env.RAZORPAY_TEST_KEY_SECRET || '').trim();

if (!keyId || !keySecret) {
  console.log('SKIPPED: no Razorpay test keys here (a fork or a pull request). Nothing was asked.');
  process.exit(0);
}
if (!keyId.startsWith('rzp_test_')) {
  console.error('REFUSED: the Key ID is not a Razorpay TEST key (it must start with rzp_test_). Nothing was asked.');
  process.exit(1);
}

let failures = 0;
const said = [];
function expect(ok, what) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures += 1;
}
/** Runs fn; returns the PayError code it threw, 'OK' when it did not throw, or 'CRASH <name>' for anything else. */
async function codeOf(fn) {
  try {
    await fn();
    return 'OK';
  } catch (e) {
    return e instanceof PayError ? e.code : `CRASH ${e && e.name}`;
  }
}
/** Razorpay's own word for a link's status, read straight from its API (what Razorpay answered, for the report). */
async function rawStatus(linkId) {
  const r = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(linkId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` },
  });
  const j = await r.json().catch(() => ({}));
  return { http: r.status, status: String(j.status || ''), amountPaid: Number(j.amount_paid || 0), payments: Array.isArray(j.payments) ? j.payments.length : 0 };
}

const creds = { keyId, keySecret };
const wrong = { keyId, keySecret: 'wrongSecretForTheCheck000' };
const MASTER = Buffer.alloc(32, 9).toString('base64');
const env = { WEB: sqliteD1(), PAYMENTS_MASTER_KEY: MASTER }; // no PAY_LIVE: test mode
const GYM = 'ci-gym';
const reqId = `pr_ci${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

console.log('Razorpay test-mode check. Key ID: rzp_test_**** (hidden). Amount: Rs 1.');

// 1. The keys.
expect(razorpay.check(creds, 'test') === null, 'our key check accepts the test Key ID and Secret');
expect(razorpay.check(creds, 'live') !== null, 'our key check refuses a test key in live mode');
const tried = await razorpay.test(creds, 'test').catch((e) => ({ thrown: e instanceof PayError ? e.code : 'CRASH' }));
expect(tried.ok === true, `Razorpay accepts the keys (answer: ${JSON.stringify(tried)})`);

// 2. A Rs 1 link.
let link = null;
try {
  link = await razorpay.createLink(creds, 'test', { id: reqId, amountP: 100, description: 'MettleUp CI check (test mode, Rs 1)', note: 'ci', name: 'CI check' });
} catch (e) {
  expect(false, `Razorpay made the link (refused: ${e instanceof PayError ? `${e.code} ${e.detail}` : e && e.name})`);
}
if (link) {
  expect(/^plink_/.test(link.linkId), `Razorpay made a payment link (${link.linkId})`);
  expect(/^https:\/\//.test(link.url), 'the link has a pay page address');
  const raw1 = await rawStatus(link.linkId);
  said.push(`after making it: status "${raw1.status}", amount paid ${raw1.amountPaid}, payments ${raw1.payments}`);
  expect(raw1.status === 'created', `Razorpay says "${raw1.status}" (expected "created")`);
  const st1 = await razorpay.status(creds, 'test', link.linkId);
  expect(st1.state === 'open', `we read it as "${st1.state}" (expected open, never paid)`);

  // 3. The server's own 10-minute check, on a throw-away database with this link.
  const now = Date.now();
  await env.WEB.prepare(
    `INSERT INTO pay_connections (gym_id, provider, mode, via, creds, hint, account, hook, status, off_reason, connected_at, updated_at)
     VALUES (?, 'razorpay', 'test', 'keys', ?, '****', '', 'hook-ci-0123456789abcd', 'on', '', ?, ?)`,
  )
    .bind(GYM, await seal(env, creds), new Date(now).toISOString(), new Date(now).toISOString())
    .run();
  await env.WEB.prepare(
    `INSERT INTO pay_requests (id, gym_id, kind, member_id, ref, amount_p, provider, mode, link_id, link_url, status, created_at)
     VALUES (?, ?, 'fee', 'm-ci', 'ms-ci', 100, 'razorpay', 'test', ?, ?, 'open', ?)`,
  )
    .bind(reqId, GYM, link.linkId, link.url, new Date(now - 60000).toISOString())
    .run();
  const row = () => env.WEB.prepare('SELECT status, paid_p, payment_id, checked_at FROM pay_requests WHERE id = ?').bind(reqId).first();
  const paid1 = await scheduledPay(env, { now: now + 5 * 60000 });
  const r1 = await row();
  expect(paid1 === 0 && r1.status === 'open' && r1.paid_p === 0, `the 10-minute check: still open, not paid (status ${r1.status}, paid ${r1.paid_p})`);

  // 4. Cancel.
  const cancelled = await codeOf(() => razorpay.cancel(creds, 'test', link.linkId));
  expect(cancelled === 'OK', `Razorpay cancelled the link (${cancelled})`);
  const raw2 = await rawStatus(link.linkId);
  said.push(`after the cancel: status "${raw2.status}", amount paid ${raw2.amountPaid}, payments ${raw2.payments}`);
  expect(raw2.status === 'cancelled', `Razorpay says "${raw2.status}" (expected "cancelled")`);
  const st2 = await razorpay.status(creds, 'test', link.linkId);
  expect(st2.state === 'cancelled', `we read it as "${st2.state}" (expected cancelled, never paid)`);
  await env.WEB.prepare("UPDATE pay_requests SET status = 'cancelled' WHERE id = ?").bind(reqId).run(); // as our close step does
  const paid2 = await scheduledPay(env, { now: now + 45 * 60000 });
  const r2 = await row();
  expect(paid2 === 0 && r2.status === 'cancelled' && r2.paid_p === 0, `the 10-minute check on the closed link: cancelled, not paid (status ${r2.status}, paid ${r2.paid_p})`);
  expect(r2.checked_at === 'done', `Razorpay confirmed it closed, so we stop asking (checked: ${r2.checked_at})`);
  const again = await codeOf(() => razorpay.cancel(creds, 'test', link.linkId));
  said.push(`a second cancel: ${again}`);
  expect(!again.startsWith('CRASH'), `a second cancel is handled, not a crash (${again})`);
  const none = await codeOf(() => razorpay.status(creds, 'test', 'plink_DoesNotExist00'));
  said.push(`status of a link that does not exist: ${none}`);
  expect(!none.startsWith('CRASH') && none !== 'OK', `a link that does not exist is a refusal, never paid (${none})`);
}

// 5. A wrong secret.
const wrongTest = await razorpay.test(wrong, 'test').then((r) => (r.ok ? 'OK' : r.error), (e) => (e instanceof PayError ? e.code : `CRASH ${e && e.name}`));
said.push(`wrong secret at connect: ${wrongTest}`);
expect(wrongTest === 'BAD_KEYS', `a wrong secret is BAD_KEYS at the key check, not a crash (${wrongTest})`);
if (link) {
  const wrongStatus = await codeOf(() => razorpay.status(wrong, 'test', link.linkId));
  expect(wrongStatus === 'BAD_KEYS', `a wrong secret is BAD_KEYS at the status check (${wrongStatus})`);
  // The server's own check with a connection whose keys went wrong: switched off as bad keys, nothing paid.
  const now = Date.now();
  await env.WEB.prepare("UPDATE pay_connections SET creds = ? WHERE gym_id = ?").bind(await seal(env, wrong), GYM).run();
  await env.WEB.prepare("UPDATE pay_requests SET status = 'open', checked_at = '' WHERE id = ?").bind(reqId).run();
  let crashed = '';
  const paid3 = await scheduledPay(env, { now: now + 50 * 60000 }).catch((e) => {
    crashed = e && e.name;
    return -1;
  });
  const conn = await env.WEB.prepare('SELECT status, off_reason FROM pay_connections WHERE gym_id = ?').bind(GYM).first();
  expect(!crashed && paid3 === 0, `the 10-minute check with a wrong key does not fall over (${crashed || 'ok'})`);
  expect(conn.status === 'off' && conn.off_reason === 'bad_keys', `that connection is switched off as bad keys (${conn.status}, ${conn.off_reason})`);
}

console.log('\nWhat Razorpay answered:');
for (const s of said) console.log(`  - ${s}`);
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
