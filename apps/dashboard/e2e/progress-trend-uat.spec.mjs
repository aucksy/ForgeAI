// R-535 / R-537 (owner, 14 Nov 2026): UAT of "Training progress" as lines. The list shows each member's 12-week line
// of workouts and one tag from their strength score; a card opens the member's full progress (workouts per week, a
// strength line per main exercise with its tag, every shared workout, the range shown); the member's own page shows
// the same. Phone (390 x 844) and computer (1280 x 900). Pictures go to e2e/.results/uat (CI uploads them as
// "dashboard-uat-pictures"). The gym's server is the pretend one (support.mjs) with 0050 + 0053 answered here.
//
// The members (clock fixed at 17 Oct 2026, support.mjs):
//  - Arjun Mehta: 3 months, 2 workouts a week. Bench press goes up 2.5 kg every 2 weeks (Getting stronger);
//    squat stays at 80 kg x 5 (Steady); pull-ups stay at 8 reps (no weight: drawn as reps). Overall: Getting stronger.
//  - Priya Nair: deadlift drops from 100 kg x 5 to 85 kg x 5 (Dropping).
//  - Rahul Das: 2 workouts so far (Not enough data yet).
//  - Kabir Shah: an older app (weekly summary only): no lines, says so.
//  - Neha Iyer: not on the gym's list: her card cannot open.
//
//  1. List: every card has the 12-week line and "N workouts in 12 weeks"; tags as above; no "This week:" line.
//  2. Arjun's full progress: range line, Overall tag and its rule, workouts per week line, bench press "Getting
//     stronger", squat "Steady", the tag rule in words; All workouts lists all 26 (10, then Show all).
//  3. Negative / edge: Rahul "Not enough data yet"; Kabir's older app; Neha's card has no button; a broken read shows
//     the try-again words; the list asks for each member's workouts only once.
//  4. Member page: the same lines on Arjun's own page.
//  5. Computer width: list and Arjun's full progress.
//  6. Hinglish: the tag and the rule.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { NOW, TODAY, addMember, expectFitsPhone, openApp, openMember, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

const PHONE = { width: 390, height: 844 };
const COMPUTER = { width: 1280, height: 900 };

const DAY = 86_400_000;
const iso = (ms) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(`${TODAY}T00:00:00Z`).getTime() - n * DAY);
const mondayOf = (d) => {
  const t = new Date(`${d}T00:00:00Z`);
  return new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
};

/** The weekly summary the phone sends (0050): workouts per week for the weeks that have any. */
function summaryOf(recent, best = []) {
  const weeks = new Map();
  for (const w of recent) {
    const m = mondayOf(w.d);
    weeks.set(m, (weeks.get(m) ?? 0) + 1);
  }
  const from = mondayOf(daysAgo(77));
  return {
    weeks: [...weeks.entries()].filter(([w]) => w >= from).map(([w, n]) => ({ w, n, kg: n * 4000 })).sort((a, b) => (a.w < b.w ? 1 : -1)),
    best,
    records: [],
    last: recent[0]?.d ?? null,
  };
}

/** Arjun: 26 workouts over 13 weeks, newest first. */
function arjunWorkouts() {
  const out = [];
  for (let i = 0; i < 26; i++) {
    const d = daysAgo(1 + Math.floor(i / 2) * 7 + (i % 2) * 3);
    const step = Math.floor((25 - i) / 4);
    out.push({
      d,
      n: i % 2 ? 'Leg day' : 'Push day',
      x: [
        { n: 'Bench press', w: 50 + 2.5 * step, r: 8, s: 4 },
        { n: 'Squat', w: 80, r: 5, s: 5 },
        { n: 'Pull-up', w: 0, r: 8, s: 3 },
      ],
    });
  }
  return out;
}

function priyaWorkouts() {
  const out = [];
  for (let i = 0; i < 10; i++) out.push({ d: daysAgo(2 + i * 8), n: 'Pull day', x: [{ n: 'Deadlift', w: i < 5 ? 85 : 100, r: 5, s: 3 }] });
  return out;
}

const rahulWorkouts = () => [
  { d: daysAgo(2), n: 'Full body', x: [{ n: 'Leg press', w: 100, r: 10, s: 3 }] },
  { d: daysAgo(5), n: 'Full body', x: [{ n: 'Leg press', w: 95, r: 10, s: 3 }] },
];

function installProgress(server, members) {
  const base = server.answer.bind(server);
  const reads = [];
  let broken = null;
  server.answer = (fn, args) => {
    if (fn === 'owner_trainer_members') {
      server.calls.push(fn);
      return {
        ok: true,
        role: 'owner',
        members: members.map((m) => ({ appId: `app-${m.name}`, memberId: m.memberId, name: m.name, phone: null, trainerId: null, trainerName: m.trainer ?? null, summary: m.summary, updatedAt: NOW.getTime() - 3600_000, helpAt: null })),
      };
    }
    if (fn === 'owner_member_progress') {
      server.calls.push(fn);
      reads.push(args.p_member);
      if (broken === args.p_member) throw new Error('boom');
      const m = members.find((x) => x.memberId === args.p_member);
      if (!m) return { ok: true, allowed: true, shared: false };
      return { ok: true, allowed: true, shared: true, summary: m.summary, recent: m.recent ?? [], hasRecent: m.recent != null, updatedAt: NOW.getTime() - 3600_000, helpAt: null };
    }
    if (fn === 'owner_trainer_setup') return { people: [], assigned: [] };
    if (fn === 'owner_question_count') return { ok: true, open: 0 };
    if (fn === 'owner_questions') return { ok: true, role: 'owner', open: 0, questions: [] };
    return base(fn, args);
  };
  return {
    reads,
    breakFor(id) {
      broken = id;
    },
  };
}

const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);

function card(page, name) {
  return page.getByRole('main').locator('[data-testid="progress-row"]').filter({ hasText: name });
}

test.use({ viewport: PHONE });

test('R-535: Training progress shows lines and a tag per member, and the full progress over 3 months', async ({ page }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  // Arjun is on the gym's list, so his own member page exists too.
  await addMember(page, { name: 'Arjun Mehta', phone: '98290 11111' });
  await openMember(page, 'Arjun Mehta');
  const arjunId = decodeURIComponent(page.url().split('#/members/')[1]);
  expect(arjunId).toBeTruthy();

  const arjun = arjunWorkouts();
  const priya = priyaWorkouts();
  const rahul = rahulWorkouts();
  const kabirSummary = summaryOf([{ d: daysAgo(3) }, { d: daysAgo(6) }, { d: daysAgo(10) }], [{ n: 'Shoulder press', w: 30, r: 10, t: 6 }]);
  const fake = installProgress(server, [
    { name: 'Arjun Mehta', memberId: arjunId, summary: summaryOf(arjun), recent: arjun, trainer: 'Sunita' },
    { name: 'Priya Nair', memberId: 'm-priya', summary: summaryOf(priya), recent: priya },
    { name: 'Rahul Das', memberId: 'm-rahul', summary: summaryOf(rahul), recent: rahul },
    { name: 'Kabir Shah', memberId: 'm-kabir', summary: kabirSummary, recent: null },
    { name: 'Neha Iyer', memberId: null, summary: summaryOf([{ d: daysAgo(1) }]), recent: [] },
  ]);
  const main = page.getByRole('main');

  // 1. The list.
  await go(page, '/trainer');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Training progress', level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(card(page, 'Arjun Mehta')).toBeVisible();
  await expect(main).not.toContainText('This week:');
  await expect(main).not.toContainText('kg lifted');
  await expect(card(page, 'Arjun Mehta')).toContainText('24 workouts in 12 weeks');
  await expect(card(page, 'Arjun Mehta')).toContainText('Workouts per week, last 12 weeks');
  await expect(card(page, 'Arjun Mehta').getByRole('img', { name: /Workouts per week, last 12 weeks: / })).toBeVisible();
  await expect(card(page, 'Arjun Mehta').getByTestId('progress-tag')).toContainText('Getting stronger');
  await expect(card(page, 'Arjun Mehta').getByTestId('progress-tag')).toContainText('Bench press: strength score');
  await expect(card(page, 'Priya Nair').getByTestId('progress-tag')).toContainText('Dropping', { timeout: 10_000 });
  await expect(card(page, 'Rahul Das').getByTestId('progress-tag')).toContainText('Not enough data yet', { timeout: 10_000 });
  // Kabir's older app sends no workouts: no tag, the line still shows from his weekly summary.
  await expect(card(page, 'Kabir Shah')).toContainText('3 workouts in 12 weeks');
  await expect(card(page, 'Kabir Shah').getByTestId('progress-tag')).toHaveCount(0);
  // Neha is not on the gym's list: no button, and it says why.
  await expect(card(page, 'Neha Iyer').getByRole('button', { name: 'See full progress' })).toHaveCount(0);
  await expect(card(page, 'Neha Iyer')).toContainText('This member is not on your gym’s list yet, so their full progress cannot open.');
  await expectFitsPhone(page, 'on Training progress');
  await shot(page, 'progress-1-list-phone');

  // 2. Arjun's full progress.
  const before = fake.reads.filter((x) => x === arjunId).length;
  await card(page, 'Arjun Mehta').getByRole('button', { name: 'See full progress of Arjun Mehta' }).tap();
  await expect(page.getByRole('heading', { name: 'Arjun Mehta', level: 1 })).toBeVisible();
  await expect(main.getByTestId('progress-range')).toHaveText(/^Shared from the member’s app: 26 workouts, \d+ \w+ 2026 to \d+ \w+ 2026\.$/);
  await expect(main.getByTestId('progress-overall')).toContainText('Getting stronger');
  await expect(main.getByTestId('progress-overall')).toContainText('Overall is “Getting stronger” when more of their main exercises go up than down');
  await expect(main.getByRole('img', { name: /^Workouts per week: / })).toBeVisible();
  const bench = main.getByTestId('exercise-line').filter({ hasText: 'Bench press' });
  const squat = main.getByTestId('exercise-line').filter({ hasText: 'Squat' });
  const pull = main.getByTestId('exercise-line').filter({ hasText: 'Pull-up' });
  await expect(bench).toContainText('Getting stronger');
  await expect(bench).toContainText('Strength score (kg)');
  await expect(bench).toContainText('Best: 65 kg × 8');
  await expect(squat).toContainText('Steady');
  await expect(pull).toContainText('Most reps in one set (no weight)');
  await expect(bench.getByRole('img')).toBeVisible();
  await expect(main.getByTestId('progress-rule')).toContainText('3% or more higher');
  await expect(main).toContainText('Strength score is the estimated 1-rep max of the day’s heaviest set');
  for (const bad of ['volume', 'Volume', ' PR ', 'session']) await expect(main).not.toContainText(bad);
  // Opened from the list: read once, kept.
  expect(fake.reads.filter((x) => x === arjunId).length).toBe(before);
  await expectFitsPhone(page, 'on full progress');
  await shot(page, 'progress-2-detail-phone');
  const all = main.getByTestId('all-workouts');
  await all.scrollIntoViewIfNeeded();
  await expect(all.locator('details')).toHaveCount(10);
  await all.getByRole('button', { name: 'Show all 26 workouts' }).tap();
  await expect(all.locator('details')).toHaveCount(26);
  await all.locator('details').first().locator('summary').tap();
  await expect(all.locator('details').first()).toContainText('Bench press 65 kg × 8 · 4 sets');
  await shot(page, 'progress-3-all-workouts-phone', false);

  // 3. Edge cases: Rahul (2 workouts), Kabir (older app), a read that fails.
  await go(page, '/trainer/m-rahul');
  await expect(page.getByRole('heading', { name: 'Rahul Das', level: 1 })).toBeVisible();
  await expect(main.getByTestId('exercise-line').filter({ hasText: 'Leg press' })).toContainText('Not enough data yet');
  await go(page, '/trainer/m-kabir');
  await expect(page.getByRole('heading', { name: 'Kabir Shah', level: 1 })).toBeVisible();
  await expect(main).toContainText('The member’s app is an older version. The lines show here after they update the MettleUp app.');
  await expect(main).toContainText('Shoulder press 30 kg × 10');
  await shot(page, 'progress-4-older-app-phone', false);
  fake.breakFor('m-broken');
  await go(page, '/trainer/m-broken');
  await expect(main).toContainText('Could not read this member’s progress. Check the internet and try again.');
  await page.getByRole('button', { name: 'Back to Training progress' }).tap();
  await expect(page.getByRole('heading', { name: 'Training progress', level: 1 })).toBeVisible();

  // 4. Arjun's own member page: the same lines.
  await go(page, `/members/${arjunId}`);
  await expect(page.getByRole('heading', { name: 'Arjun Mehta', exact: true })).toBeVisible();
  await expect(main.getByTestId('progress-overall')).toContainText('Getting stronger');
  await main.getByTestId('progress-overall').scrollIntoViewIfNeeded();
  await expect(main).toContainText('For every workout, use “Full workout history” below.');
  await expectFitsPhone(page, 'on the member page');
  await shot(page, 'progress-5-member-page-phone', false);

  // 5. Computer width.
  await page.setViewportSize(COMPUTER);
  await go(page, '/trainer');
  await expect(card(page, 'Arjun Mehta').getByTestId('progress-tag')).toContainText('Getting stronger');
  await shot(page, 'progress-6-list-computer');
  await go(page, `/trainer/${arjunId}`);
  await expect(main.getByTestId('progress-overall')).toContainText('Getting stronger');
  await shot(page, 'progress-7-detail-computer');

  // 6. Hinglish.
  await page.setViewportSize(PHONE);
  await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'hinglish'));
  await page.reload();
  await expect(main.getByTestId('progress-overall')).toContainText('Strength badh rahi hai', { timeout: 15_000 });
  await expect(main.getByTestId('progress-rule')).toContainText('Har tag member ke pichhle 6 hafton');
  await expectFitsPhone(page, 'on full progress, Hinglish');
  await shot(page, 'progress-8-detail-hinglish-phone');
});
