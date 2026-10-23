// node --test apps/hq/test  (CI: ci.yml "HQ Worker and page tests"). ForgeAI HQ page words, #51.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  actionWords,
  ago,
  codeMessage,
  daysLeft,
  errorWords,
  flags,
  gymByCode,
  needsLook,
  recordCells,
  rupees,
  rupeesExact,
} from '../public/logic.js';

const NOW = Date.parse('2026-10-23T09:00:00Z');
const day = (n) => new Date(NOW - n * 864e5).toISOString();
const gym = (extra = {}) => ({ status: 'active', staff: 2, createdAt: day(60), lastDeskActivity: day(1), failedSignins24h: 0, deleteRequest: null, supportUntil: null, aiLimit: 20, aiToday: 0, ...extra });

test('money in rupees with Indian grouping, from paise', () => {
  assert.equal(rupees(12345600), '₹1,23,456');
  assert.equal(rupees(0), '₹0');
  assert.equal(rupees(null), '₹0');
  assert.equal(rupeesExact(0.4), '₹0.40');
  assert.equal(rupeesExact(1234.5), '₹1,235');
});

test('times as words', () => {
  assert.equal(ago(null, NOW), 'never');
  assert.equal(ago(new Date(NOW - 30_000).toISOString(), NOW), 'just now');
  assert.equal(ago(new Date(NOW - 5 * 60_000).toISOString(), NOW), '5 min ago');
  assert.equal(ago(day(1), NOW), '1 day ago');
  assert.equal(ago(day(9), NOW), '9 days ago');
});

test('the flags on a gym row, most urgent first', () => {
  assert.deepEqual(flags(gym(), NOW), []);
  const f = flags(gym({ status: 'suspended', deleteRequest: { day: 12 }, failedSignins24h: 14, aiToday: 20, lastDeskActivity: day(10) }), NOW).map((x) => x.words);
  assert.deepEqual(f, ['Paused', 'Delete asked (day 12 of 30)', 'Many wrong sign-in codes', 'AI limit hit today', 'No desk activity for 7 days']);
  const fresh = flags(gym({ status: 'trial', createdAt: day(2), lastDeskActivity: null }), NOW).map((x) => x.words);
  assert.deepEqual(fresh, ['Not checked yet', 'New this week'], 'a gym started this week is not "no activity"');
  const open = flags(gym({ supportUntil: new Date(NOW + 30 * 60_000).toISOString() }), NOW);
  assert.match(open[0].words, /^Support access open until \d\d:\d\d$/);
  assert.deepEqual(flags(gym({ supportUntil: day(1) }), NOW), [], 'a closed window is not shown');
  assert.deepEqual(flags(gym({ aiLimit: 0, aiToday: 0 }), NOW), [], 'AI switched off is not "limit hit"');
});

test('need a look: warnings and unchecked gyms, not just "new this week"', () => {
  assert.equal(needsLook([gym(), gym({ createdAt: day(2), lastDeskActivity: day(0) }), gym({ status: 'trial' }), gym({ failedSignins24h: 50 })], NOW), 2);
});

test('a demo or browser-only gym (nobody signs in) is labelled, not chased', () => {
  const demo = gym({ staff: 0, status: 'trial', lastDeskActivity: null });
  assert.deepEqual(flags(demo, NOW).map((f) => f.words), ['Demo or browser-only (nobody signs in)']);
  assert.equal(needsLook([demo], NOW), 0);
  // ... but a paused one still says so first.
  assert.deepEqual(flags({ ...demo, status: 'suspended' }, NOW).map((f) => f.words), ['Paused', 'Demo or browser-only (nobody signs in)']);
});

test('every refusal has plain words; an unknown one has a safe sentence', () => {
  for (const code of ['FRESH', 'NEED_REASON', 'CONFIRM_CALL', 'WRONG_CODE', 'NOT_CALLED', 'NOT_REMINDED', 'NO_ACCESS', 'SUSPENDED', 'OFFLINE']) {
    assert.ok(!/[A-Z]{2,}_/.test(errorWords(code)), `${code} words must not show a code`);
  }
  assert.equal(errorWords('relation does not exist'), 'Something went wrong. Try again, or tell Claude.');
  assert.equal(actionWords('support_view'), 'Looked at a gym’s records (support access)');
  assert.equal(actionWords('something_new'), 'something_new');
});

test('every action the server logs has words on the Log page', () => {
  const sql = ['0026_hq_audit_and_counts.sql', '0027_hq_actions.sql', '0028_hq_breakglass_and_logs.sql']
    .map((f) => readFileSync(new URL(`../../../supabase/migrations/${f}`, import.meta.url), 'utf8'))
    .join('\n');
  const worker = readFileSync(new URL('../../../deploy/hq/api.js', import.meta.url), 'utf8') + readFileSync(new URL('../../../deploy/hq/worker.js', import.meta.url), 'utf8');
  const names = new Set();
  // ('delete_request_' || p_step is one name per step: added below.)
  for (const m of sql.matchAll(/_hq_log\([^,]+,\s*'([a-z_]*[a-z])'(?!\s*\|\|)/g)) names.add(m[1]);
  for (const m of worker.matchAll(/(?:log\(|p_action: )'([a-z_]+)'/g)) names.add(m[1]);
  for (const step of ['called', 'reminded', 'cancel', 'member_done']) names.add(`delete_request_${step}`);
  assert.ok(names.size >= 25, `found ${names.size}`);
  for (const n of names) assert.notEqual(actionWords(n), n, `no words for ${n}`);
});

test('the read-only support view shows a few plain cells per record', () => {
  assert.deepEqual(recordCells('payment', { id: 'p1', d: { receiptNo: 'R-12', amountP: 150000, paidOn: '2026-10-01', voided: false } }),
    [['Receipt', 'R-12'], ['Amount', '₹1,500'], ['Paid on', '2026-10-01'], ['Cancelled', '']]);
  assert.deepEqual(recordCells('staff', { name: 'Ravi', phone: '9800000000', role: 'staff' }), [['Name', 'Ravi'], ['Mobile', '9800000000'], ['Role', 'Front desk']]);
  assert.deepEqual(recordCells('nothing', {}), []);
});

test('the sign-in code message and small helpers', () => {
  assert.match(codeMessage('Iron Gym', '123456'), /Iron Gym is 123456\. .*30 minutes/);
  assert.equal(gymByCode([{ joinCode: 'ABC123', name: 'A' }], 'ABC123').name, 'A');
  assert.equal(gymByCode([], 'ABC123'), null);
  assert.equal(daysLeft({ day: 4 }), 26);
  assert.equal(daysLeft({ day: 31 }), -1);
});

test('the page loads nothing from outside and writes no HTML from data', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /style="|onclick=/);
  assert.doesNotMatch(app, /localStorage|sessionStorage|indexedDB/, 'HQ keeps nothing in the browser');
});

test('test and demo gyms are told apart from real ones', async () => {
  const { testKind } = await import('../public/logic.js');
  assert.equal(testKind({ name: 'QA Check-in Gym', ownerPhone: '9876500001', staff: 1 }), 'test');
  assert.equal(testKind({ name: 'My Gym', ownerPhone: '9876500042', staff: 1 }), 'test');
  assert.equal(testKind({ name: 'T29 Gym', staff: 0 }), 'test');
  assert.equal(testKind({ name: 'ForgeAI Test Gym', staff: 0 }), 'test');
  assert.equal(testKind({ name: 'Iron Temple Fitness', staff: 0 }), 'demo');
  // A real gym that happens to share the sample name, with people signing in, stays visible.
  assert.equal(testKind({ name: 'Iron Temple Fitness', staff: 2, ownerPhone: '9829012345' }), '');
  assert.equal(testKind({ name: "RAM'S FITNESS CLUB IMPACT", staff: 0 }), '');
  assert.equal(testKind({ name: 'Quality Gym', ownerPhone: '9876500100' }), '');
});
