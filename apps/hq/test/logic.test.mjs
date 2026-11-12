// node --test apps/hq/test  (CI: ci.yml "HQ Worker and page tests"). MettleUp HQ page words, #51.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  actionWords,
  ago,
  assistMonthWords,
  creditRowWords,
  checkDoneWords,
  checkReasonWords,
  checkWords,
  codeMessage,
  confirmWords,
  underpaidWords,
  daysLeft,
  extendPaidUntil,
  outcomeWords,
  paymentWords,
  errorWords,
  flags,
  gymByCode,
  needsLook,
  needsLines,
  needsRose,
  needsTotal,
  newGymsToCheck,
  titleWithCount,
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
  for (const code of ['FRESH', 'NEED_REASON', 'CONFIRM_CALL', 'WRONG_CODE', 'NOT_CALLED', 'NOT_REMINDED', 'NO_ACCESS', 'SUSPENDED', 'OFFLINE',
    'TRIAL_PAST', 'TRIAL_CAP', 'NEED_DATE', 'BAD_DATE', 'NOT_READY']) {
    assert.notEqual(errorWords(code), errorWords('SOMETHING_ELSE'), `${code} has its own words`);
    assert.ok(!/[A-Z]{2,}_/.test(errorWords(code)), `${code} words must not show a code`);
  }
  assert.equal(errorWords('relation does not exist'), 'Something went wrong. Try again, or tell Claude.');
  assert.equal(actionWords('support_view'), 'Looked at a gym’s records (support access)');
  assert.equal(actionWords('something_new'), 'something_new');
});

test('every action the server logs has words on the Log page', () => {
  const sql = ['0026_hq_audit_and_counts.sql', '0027_hq_actions.sql', '0028_hq_breakglass_and_logs.sql', '0030_plans_and_trials.sql']
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
  assert.equal(testKind({ name: 'MettleUp Test Gym', staff: 0 }), 'test');
  assert.equal(testKind({ name: 'Iron Temple Fitness', staff: 0 }), 'demo');
  // A real gym that happens to share the sample name, with people signing in, stays visible.
  assert.equal(testKind({ name: 'Iron Temple Fitness', staff: 2, ownerPhone: '9829012345' }), '');
  assert.equal(testKind({ name: "RAM'S FITNESS CLUB IMPACT", staff: 0 }), '');
  assert.equal(testKind({ name: 'Quality Gym', ownerPhone: '9876500100' }), '');
});

// ------------------------------------------------------------------ free trial and plan (0030, R-97)
const L = await import('../public/logic.js');
const T0 = Date.parse('2026-10-24T06:00:00Z'); // 11:30 India time
const trialGym = (extra = {}) => ({
  ...gym(), name: 'Iron', joinCode: 'IRON01', ownerName: 'Ravi Kumar', ownerPhone: '9829012345', membersRegister: 120, membersApp: 40,
  trialStartsAt: '2026-10-24T05:00:00Z', trialEndsAt: '2027-01-24T05:00:00Z', trialCapAt: '2027-04-24T05:00:00Z', plan: null, billing: null, paidUntil: null, ...extra,
});

test('free trial: days left on the India calendar, the last day, and after the end', () => {
  assert.equal(L.trialDaysLeft(trialGym(), T0), 92);
  assert.equal(L.trialWords(trialGym(), T0), 'Free trial: 92 days left');
  assert.equal(L.trialWords(trialGym({ trialEndsAt: '2026-10-25T05:00:00Z' }), T0), 'Free trial: 1 day left');
  // Ends at 23:00 India time today: still the last day.
  assert.equal(L.trialWords(trialGym({ trialEndsAt: '2026-10-24T17:30:00Z' }), T0), 'Free trial: last day');
  // Ended at 09:00 India time today.
  assert.equal(L.trialWords(trialGym({ trialEndsAt: '2026-10-24T03:30:00Z' }), T0), 'Free trial ended today');
  assert.equal(L.trialWords(trialGym({ trialEndsAt: '2026-10-21T05:00:00Z' }), T0), 'Free trial ended 3 days ago');
  assert.equal(L.trialDaysLeft({}, T0), null);
});

test('where a gym stands, and its one badge', () => {
  assert.equal(L.billingState({ name: 'old server' }, T0), 'unknown', 'no trial keys: database without 0030');
  assert.equal(L.billingBadge({ name: 'old server' }, T0), null);
  assert.equal(L.billingState(trialGym(), T0), 'trial');
  assert.equal(L.billingBadge(trialGym(), T0).tone, 'info');
  assert.equal(L.billingBadge(trialGym({ trialEndsAt: '2026-11-01T05:00:00Z' }), T0).tone, 'warn', 'within 14 days');
  assert.deepEqual(L.billingBadge(trialGym({ trialEndsAt: '2026-10-21T05:00:00Z' }), T0), { tone: 'bad', words: 'Free trial ended 3 days ago, no plan' });
  const paying = trialGym({ plan: 'pro', billing: 'yearly', paidUntil: '2027-10-24T05:00:00Z' });
  assert.equal(L.billingState(paying, T0), 'paying');
  assert.deepEqual(L.billingBadge(paying, T0), { tone: 'good', words: 'Pro, yearly, paid until 24 Oct 2027' });
  assert.equal(L.billingState({ ...paying, paidUntil: '2026-10-01T05:00:00Z' }, T0), 'lapsed');
  assert.equal(L.billingBadge({ ...paying, paidUntil: '2026-10-01T05:00:00Z' }, T0).words, 'Pro: payment due since 1 Oct 2026');
  assert.equal(L.billingState(trialGym({ plan: 'ai', billing: 'lifetime' }), T0), 'lifetime');
  // F201: a gym still on the retired 'ai' pack is shown as Pro; the picker offers Starter and Pro only.
  assert.equal(L.planWords(trialGym({ plan: 'ai', billing: 'lifetime' })), 'Pro, lifetime');
  assert.deepEqual(L.PLAN_CHOICES.map(([v]) => v), ['', 'starter', 'pro']);
  assert.equal(L.planPickValue('ai'), 'pro');
  assert.equal(L.planPickValue('starter'), 'starter');
  assert.equal(L.planPickValue(null), '');
});

test('the gym-list filters', () => {
  const gyms = {
    trial: trialGym(),
    ending: trialGym({ trialEndsAt: '2026-11-03T05:00:00Z' }),
    ended: trialGym({ trialEndsAt: '2026-10-01T05:00:00Z' }),
    lapsed: trialGym({ plan: 'starter', billing: 'monthly', paidUntil: '2026-10-10T05:00:00Z' }),
    paying: trialGym({ plan: 'pro', billing: 'monthly', paidUntil: '2026-11-10T05:00:00Z' }),
    lifetime: trialGym({ plan: 'ai', billing: 'lifetime' }),
    paused: trialGym({ status: 'suspended' }),
    unchecked: trialGym({ status: 'trial' }),
  };
  const who = (f) => Object.entries(gyms).filter(([, g]) => L.inFilter(g, f, T0)).map(([k]) => k);
  assert.deepEqual(who('trial'), ['trial', 'ending', 'paused', 'unchecked']);
  assert.deepEqual(who('ending'), ['ending']);
  assert.deepEqual(who('ended'), ['ended', 'lapsed']);
  assert.deepEqual(who('paying'), ['paying']);
  assert.deepEqual(who('lifetime'), ['lifetime']);
  assert.deepEqual(who('paused'), ['paused']);
  assert.deepEqual(who('unchecked'), ['unchecked']);
  assert.equal(who('all').length, 8);
  assert.equal(L.filterNeedsTrial('ending'), true);
  assert.equal(L.filterNeedsTrial('paused'), false);
  // "New, not checked yet" is the gym status, never the free trial.
  assert.equal(L.STATUS_WORDS.trial, 'New, not checked yet');
  assert.ok(!/trial/i.test(Object.values(L.STATUS_WORDS).join(' ')));
});

test('search, sort and the summary across the top', () => {
  const a = trialGym({ name: 'Iron Temple', joinCode: 'IRON01', ownerName: 'Ravi', ownerPhone: '9829012345', createdAt: '2026-10-01T00:00:00Z', membersRegister: 50 });
  const b = trialGym({ name: 'Zen Fitness', joinCode: 'ZEN001', ownerName: 'Asha', ownerPhone: '9811100000', createdAt: '2026-10-20T00:00:00Z', membersRegister: 200, trialEndsAt: '2026-11-01T05:00:00Z' });
  const c = trialGym({ name: 'alpha gym', joinCode: 'ALP001', ownerName: 'Om', ownerPhone: '9822200000', createdAt: '2026-09-01T00:00:00Z', membersRegister: 5, plan: 'pro', billing: 'yearly', paidUntil: '2027-09-01T00:00:00Z' });
  assert.equal(L.matchesSearch(a, 'iron'), true);
  assert.equal(L.matchesSearch(a, 'temple ravi'), true);
  assert.equal(L.matchesSearch(a, 'zen001'), false);
  assert.equal(L.matchesSearch(b, 'zen001'), true);
  assert.equal(L.matchesSearch(a, '90123'), true, 'part of the owner mobile');
  assert.equal(L.matchesSearch(a, '98'), false, 'too few digits to mean a mobile');
  assert.equal(L.matchesSearch(a, ''), true);
  const names = (key) => L.sortGyms([a, b, c], key, T0).map((g) => g.name);
  assert.deepEqual(names('new'), ['Zen Fitness', 'Iron Temple', 'alpha gym']);
  assert.deepEqual(names('name'), ['alpha gym', 'Iron Temple', 'Zen Fitness']);
  assert.deepEqual(names('members'), ['Zen Fitness', 'Iron Temple', 'alpha gym']);
  assert.deepEqual(names('trial'), ['Zen Fitness', 'Iron Temple', 'alpha gym'], 'paying gyms last');
  const s = L.summary([a, b, c], T0);
  assert.equal(s.gyms, 3);
  assert.equal(s.members, 255);
  assert.equal(s.onTrial, 2);
  assert.equal(s.endingSoon, 1);
  assert.equal(s.paying, 1);
});

test('months are added like the database does (UTC calendar, day held at the month end)', () => {
  assert.equal(L.addMonths('2026-10-24T05:00:00.000Z', 6), '2027-04-24T05:00:00.000Z');
  assert.equal(L.addMonths('2026-08-31T10:00:00.000Z', 6), '2027-02-28T10:00:00.000Z');
  assert.equal(L.addMonths('2027-08-31T10:00:00.000Z', 6), '2028-02-29T10:00:00.000Z');
  assert.equal(L.addMonths('2026-10-31T00:00:00.000Z', 1), '2026-11-30T00:00:00.000Z');
  assert.equal(L.trialCap({ trialStartsAt: '2026-08-31T10:00:00Z' }), '2027-02-28T10:00:00.000Z');
  assert.equal(L.trialCap({ trialStartsAt: '2026-08-31T10:00:00Z', trialCapAt: '2027-02-28T10:00:00+00:00' }), '2027-02-28T10:00:00.000Z');
});

test('the extend-trial quick picks never pass the cap; the cap is offered and said in words', () => {
  const picks = L.trialPicks(trialGym(), T0);
  assert.deepEqual(picks.map((p) => p.endsAt), ['2027-02-24T05:00:00.000Z', '2027-03-24T05:00:00.000Z', '2027-04-24T05:00:00.000Z']);
  assert.equal(picks[0].label, '+1 month (to 24 Feb 2027)');
  // Ended trial: counted from today, not from the old end.
  const ended = L.trialPicks(trialGym({ trialEndsAt: '2026-10-20T05:00:00Z' }), T0);
  assert.equal(ended[0].endsAt, '2026-11-24T06:00:00.000Z');
  assert.equal(ended[ended.length - 1].label, 'Up to the most allowed (24 Apr 2027)');
  assert.ok(ended.every((p) => Date.parse(p.endsAt) <= Date.parse('2027-04-24T05:00:00Z')));
  // At the cap: nothing more to give.
  assert.deepEqual(L.trialPicks(trialGym({ trialEndsAt: '2027-04-24T05:00:00Z' }), T0), []);
  assert.match(L.capWords(trialGym()), /up to 24 Apr 2027 at most \(6 months from its start on 24 Oct 2026\)/);
  assert.equal(L.endOfIndiaDay('2027-10-24'), '2027-10-24T18:29:59.000Z');
  assert.equal(L.endOfIndiaDay('soon'), null);
});

test('Export gyms (CSV): gym-level facts only, safe for Excel', () => {
  const csv = L.gymsCsv([
    trialGym({ name: 'Iron, "The" Gym', createdAt: '2026-10-24T05:00:00Z', status: 'active' }),
    trialGym({ name: '=HYPERLINK("x")', ownerName: '+Ravi', plan: 'ai', billing: 'lifetime' }),
  ]);
  assert.equal(csv.charCodeAt(0), 0xfeff, 'Excel reads Hindi names');
  const lines = csv.slice(1).trim().split('\r\n');
  assert.equal(lines[0], 'Gym name,Gym code,Owner name,Owner mobile,Started,Status,Free trial ends,Plan,Billing,Paid until,Members in the register,Members in the app');
  assert.equal(lines[1], '"Iron, ""The"" Gym",IRON01,Ravi Kumar,9829012345,24 Oct 2026,Active (checked),24 Jan 2027,,,,120,40');
  assert.ok(lines[2].startsWith(`"'=HYPERLINK(""x"")",IRON01,'+Ravi,`), 'a formula never runs');
  assert.ok(lines[2].includes(',Pro,lifetime,for ever,'), "the retired 'ai' pack reads as Pro (F201)");
  assert.doesNotMatch(csv, /fullName|memberName|Member name/i, 'nothing about members but the two counts');
  assert.equal(L.csvName(T0), 'mettleup-gyms-2026-10-24.csv');
});

test('gym groups (0031, #41): each business with its branches, members per branch, price as information', () => {
  const groups = [
    { groupId: 'grp-1', name: 'Iron Temple', branches: [
      { gymId: 'g1', name: 'Iron Temple', joinCode: 'IRON01', receiptPrefix: null, membersRegister: 120, membersApp: 40 },
      { gymId: 'g2', name: 'Iron Temple, Vaishali', joinCode: 'IRON02', receiptPrefix: 'B2', membersRegister: 60, membersApp: 10 },
    ] },
    { groupId: 'grp-2', name: 'Solo', branches: [{ gymId: 'g9', name: 'Solo', joinCode: 'SOLO01', membersRegister: 5, membersApp: 0 }] },
  ];
  const by = L.branchOf(groups);
  assert.deepEqual(by.get('g2'), { groupId: 'grp-1', groupName: 'Iron Temple', branchNo: 2, branches: 2, receiptPrefix: 'B2' });
  assert.equal(by.get('nope'), undefined);
  const cards = L.groupCards(groups, [{ gymId: 'g1', plan: 'pro' }]);
  assert.equal(cards.length, 1, 'a group of one is just a gym');
  assert.equal(cards[0].membersRegister, 180);
  assert.equal(cards[0].membersApp, 50);
  assert.equal(cards[0].branches[0].gym.plan, 'pro');
  assert.equal(cards[0].branches[1].gym, null);
  assert.equal(L.groupCards(null, []).length, 0, 'a server without 0031: no groups, no crash');
  assert.equal(L.groupPriceWords(3), '3 branches: the first at full price, the others at half, so Starter ₹1,997 or Pro ₹2,997 a month for all of them. Information only: nothing is billed here.');
  assert.equal(L.extraBranchPrice(999), 499);
  assert.equal(L.extraBranchPrice(1499), 749);
});

test("BRANCH_PRICES are the landing page's monthly prices (one source of truth: the page)", () => {
  const html = readFileSync(new URL('../../dashboard/public/home/index.html', import.meta.url), 'utf8');
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  for (const [plan, word] of [['starter', 'Starter'], ['pro', 'Pro']]) {
    // R-324 (4 Nov 2026): each plan card has a line between its name and its price, so read the price inside the card.
    const m = new RegExp(`<h3[^>]*>${word}</h3>[^]*?class="pm"><b>₹([0-9,]+)</b> <span[^>]*>a month`).exec(html);
    assert.ok(m, `${word} price not found on the landing page`);
    assert.equal(Number(m[1].replace(/,/g, '')), L.BRANCH_PRICES[plan], `${word}: HQ and the landing page disagree`);
  }
});

test('the landing page carries the prices the owner picked on 30 Oct 2026 (#30 A), in English and Hindi', () => {
  // Raw HTML, so the Hindi copies (Hinglish since R-247, 31 Oct 2026) in data-hi count too.
  const html = readFileSync(new URL('../../dashboard/public/home/index.html', import.meta.url), 'utf8');
  for (const want of ['₹999', '₹9,990', '₹1,499', '₹14,990', '₹29,999',
    'first 25 gyms, and only until 31 March 2027', 'पहले 25 जिम, और सिर्फ 31 मार्च 2027 तक', 'FIRST 25', 'पहले 25',
    'each extra branch pays half', 'हर एक्स्ट्रा ब्रांच का हाफ प्राइस']) {
    assert.ok(html.includes(want), `landing page is missing "${want}"`);
  }
  // The old prices, and "Own it" (offered on the phone only, never on the website).
  // F201 (12 Nov 2026): the old third pack and its prices are gone; the AI Assistant is sold as credits.
  for (const gone of ['₹1,999', '₹19,990', '₹2,999', 'FIRST 50', 'पहले 50', 'first 50', '₹19,990 once', '₹4,990', 'Pro + AI', '₹24,990']) {
    assert.ok(!html.includes(gone), `landing page still says "${gone}"`);
  }
});

// R-319 item 8: HQ's Needs you.
test('Needs you: lines in order of urgency, one number, the tab title, and what rose', () => {
  const d = { helpNeedsReply: 2, leadsNew: 1, gymsNew: 0, feedbackNew: null };
  assert.deepEqual(needsLines(d).map((l) => [l.key, l.words, l.href]), [
    ['help', '2 help questions waiting for your reply', '#feedback/needs-reply'],
    ['leads', '1 new lead to call', '#leads'],
  ]);
  assert.equal(needsTotal(d), 3);
  assert.equal(needsTotal(null), 0);
  // Feedback to read is listed but never counted in the red number (fresh eyes, 8 Nov 2026).
  assert.equal(needsTotal({ leadsNew: 1, feedbackNew: 51 }), 1);
  assert.deepEqual(needsLines({ feedbackNew: 51 }).map((l) => l.key), ['feedback']);
  assert.equal(titleWithCount('MettleUp HQ', 3), '(3) MettleUp HQ');
  assert.equal(titleWithCount('(3) MettleUp HQ', 0), 'MettleUp HQ');
  assert.equal(titleWithCount('MettleUp HQ', 150), '(99+) MettleUp HQ');
  assert.deepEqual(needsRose(null, d), [], 'the first look never rings');
  assert.deepEqual(needsRose(d, { ...d, leadsNew: 2 }).map((l) => l.key), ['leads']);
  assert.deepEqual(needsRose(d, { ...d, helpNeedsReply: 1 }), [], 'fewer is not new');
});

test('new gyms to check: trial, made in the last 14 days, not a test or demo gym', () => {
  const now = Date.parse('2026-11-04T00:00:00Z');
  const gyms = [
    { name: 'Iron Den', status: 'trial', createdAt: '2026-11-01T00:00:00Z' },
    { name: 'QA Gym', status: 'trial', createdAt: '2026-11-01T00:00:00Z' },
    { name: 'Old Gym', status: 'trial', createdAt: '2026-10-01T00:00:00Z' },
    { name: 'Checked', status: 'active', createdAt: '2026-11-01T00:00:00Z' },
  ];
  assert.deepEqual(newGymsToCheck(gyms, now).map((g) => g.name), ['Iron Den']);
});

// T79 (0060): payments to MettleUp. Same maths as the database's _mettleup_extend (supabase/tests/0060).
test('a confirmed payment extends from the later of today and the current paid-until, to the end of an India day', () => {
  const at = (iso) => Date.parse(iso);
  // No paid-until yet: today (India) + 1 month.
  assert.equal(extendPaidUntil(null, 'monthly', at('2026-11-06T12:00:00+05:30')), '2026-12-06T18:29:59.000Z');
  // 19:00 UTC on 6 Nov is already 7 Nov in India.
  assert.equal(extendPaidUntil(null, 'monthly', at('2026-11-06T19:00:00Z')), '2026-12-07T18:29:59.000Z');
  // Lapsed: counts from today, not from the old date.
  assert.equal(extendPaidUntil('2020-01-01T00:00:00+05:30', 'monthly', at('2027-03-10T12:00:00+05:30')), '2027-04-10T18:29:59.000Z');
  // Still paid: counts from that day; 31 Jan + 1 month = 28 Feb; a year from a leap day.
  assert.equal(extendPaidUntil('2027-01-31T23:59:59+05:30', 'monthly', at('2027-01-20T09:00:00+05:30')), '2027-02-28T18:29:59.000Z');
  assert.equal(extendPaidUntil('2028-02-29T23:59:59+05:30', 'yearly', at('2028-02-01T09:00:00+05:30')), '2029-02-28T18:29:59.000Z');
  assert.equal(extendPaidUntil(null, 'yearly', at('2026-12-15T10:00:00+05:30')), '2027-12-15T18:29:59.000Z');
  assert.equal(extendPaidUntil(null, 'lifetime', at('2026-12-15T10:00:00+05:30')), null);
});

test('payments in words: the facts, what Confirm will do, and the outcome', () => {
  const p = { plan: 'pro', billing: 'monthly', amountPaise: 149900, pricePaise: 149900, method: 'upi', reference: '123456789012', reportedAt: '2026-11-06T06:00:00Z' };
  assert.equal(paymentWords(p), 'Pro, monthly · ₹1,499 by UPI · reference 123456789012 · sent 6 Nov 2026');
  assert.equal(paymentWords({ ...p, amountPaise: 100000, method: 'bank' }), 'Pro, monthly · ₹1,000 by bank transfer (the price is ₹1,499) · reference 123456789012 · sent 6 Nov 2026');
  const now = Date.parse('2026-11-06T12:00:00+05:30');
  assert.equal(confirmWords({ ...p, gymPaidUntil: null }, now), 'Confirm sets Pro, monthly, paid until 6 Dec 2026.');
  assert.equal(confirmWords({ ...p, gymPaidUntil: '2026-11-20T18:29:59Z', extendsTo: '2026-12-20T18:29:59Z' }, now), 'Confirm sets Pro, monthly, paid until 20 Dec 2026 (now paid until 20 Nov 2026).');
  assert.equal(confirmWords({ ...p, gymBilling: 'lifetime' }, now), 'This gym has a lifetime plan: nothing to add.');
  // A different plan than the gym has now is said; the same plan says nothing more.
  assert.equal(confirmWords({ ...p, gymPlan: 'pro', gymPaidUntil: null }, now), 'Confirm sets Pro, monthly, paid until 6 Dec 2026.');
  assert.equal(confirmWords({ ...p, plan: 'starter', gymPlan: 'pro', gymPaidUntil: null }, now), 'Confirm sets Starter, monthly, paid until 6 Dec 2026. This changes the gym from Pro to Starter.');
  // Underpaid: said in words; paid in full or more: nothing.
  assert.equal(underpaidWords({ ...p, plan: 'starter', billing: 'yearly', pricePaise: 999000, amountPaise: 500000 }), 'Underpaid: ₹4,990 less than the price of Starter, yearly (₹9,990).');
  assert.equal(underpaidWords(p), '');
  assert.equal(underpaidWords({ ...p, amountPaise: 150000 }), '');
  assert.equal(outcomeWords({ status: 'rejected', decidedAt: '2026-11-07T06:00:00Z', rejectReason: 'No money arrived' }), 'Not confirmed 7 Nov 2026. Reason: No money arrived');
  assert.equal(outcomeWords({ status: 'confirmed', decidedAt: '2026-11-07T06:00:00Z', paidUntil: '2026-12-06T18:29:59Z' }), 'Confirmed 7 Nov 2026: paid until 6 Dec 2026.');
  assert.deepEqual(needsLines({ paymentsWaiting: 2 }).map((l) => [l.key, l.words, l.href]), [['payments', '2 payments to confirm', '#payments']]);
  assert.equal(needsTotal({ paymentsWaiting: 2, leadsNew: 1 }), 3);
  assert.equal(actionWords('confirm_payment'), 'Confirmed a gym’s payment');
  assert.equal(errorWords('PAY_NOT_READY'), 'Payments need the database update 0060 (waiting for your yes).');
  // 0063: during a running free trial the paid month starts when the trial ends.
  assert.equal(confirmWords({ ...p, gymPaidUntil: null, gymTrialEndsAt: '2026-11-26T12:30:00Z' }, now),
    'Confirm sets Pro, monthly, paid until 26 Dec 2026 (it starts when the free trial ends on 26 Nov 2026).');
  assert.equal(confirmWords({ ...p, gymPaidUntil: null, gymTrialEndsAt: '2026-11-01T12:30:00Z' }, now), 'Confirm sets Pro, monthly, paid until 6 Dec 2026.');
});

test('online payments to check (0064): the facts, why, what was done, and the Needs you line', () => {
  const c = { provider: 'razorpay', paidPaise: 100, askedPaise: 149900, paidCurrency: 'INR', paymentId: 'pay_TEST1', paidAt: '2026-11-06T06:00:00Z', reason: 'AMOUNT_MISMATCH' };
  assert.equal(checkWords(c), '₹1 by Razorpay (asked ₹1,499) · payment pay_TEST1 · paid 6 Nov 2026');
  assert.equal(checkWords({ ...c, paidPaise: 149900, provider: 'cashfree' }), '₹1,499 by Cashfree · payment pay_TEST1 · paid 6 Nov 2026');
  assert.equal(checkReasonWords('AMOUNT_MISMATCH'), 'the amount paid is not the price we asked for');
  assert.equal(checkReasonWords('LIFETIME'), 'the gym already has a lifetime plan');
  assert.equal(checkReasonWords('SOMETHING'), 'it could not be added to the plan');
  assert.equal(checkDoneWords({ ...c, checkedAt: '2026-11-07T06:00:00Z', checkedHow: 'refunded', checkedBy: 'hq@example.com', checkedNote: 'rfnd_TEST' }),
    'Refunded 7 Nov 2026 by hq@example.com. Note: rfnd_TEST');
  assert.deepEqual(needsLines({ paymentsToCheck: 1 }).map((l) => [l.key, l.words, l.href]), [['checks', '1 online payment to check (paid, but not added to a plan)', '#payments']]);
  assert.equal(needsTotal({ paymentsWaiting: 2, paymentsToCheck: 1 }), 3);
  assert.equal(actionWords('billing_refunded'), 'Marked an online payment as refunded');
  assert.equal(errorWords('CHECKS_NOT_READY'), 'Payments to check need the database update 0064 (waiting for your yes).');
});


test('F201 AI credits: history lines and this month in plain words', () => {
  assert.equal(creditRowWords({ delta: 150, reason: 'purchase', note: 'Paid Rs 399 by UPI' }), '+150 · Pack bought · Paid Rs 399 by UPI');
  assert.equal(creditRowWords({ delta: -1, reason: 'spend', note: 'Diwali message' }), '-1 · Task done · Diwali message');
  assert.equal(creditRowWords({ delta: 60, reason: 'monthly', note: 'Free credits for 2026-11' }), '+60 · Free credits for the month');
  assert.equal(creditRowWords({ delta: -10, reason: 'grant', note: 'Given twice' }), '-10 · Taken back by MettleUp · Given twice');
  assert.equal(assistMonthWords({ this_month: { spent: 1, tasks_done: 1 } }, null), '1 credit used, 1 task done');
  assert.equal(assistMonthWords({ this_month: { spent: 12, tasks_done: 9 } }, { asks: 40, voiceSeconds: 95 }), '12 credits used, 9 tasks done, 40 requests to the AI, 2 min spoken');
  assert.equal(actionWords('ai_credits_added'), 'Added or took back a gym’s AI credits');
  for (const code of ['AI_NOT_READY', 'NOT_ENOUGH']) assert.notEqual(errorWords(code), errorWords('SOMETHING_ELSE'));
});
