// R-561 item 6 (15 Nov 2026): ready-made challenges on the Challenges page, UAT. Every step taps the real screen;
// pictures go to e2e/.results/uat (CI uploads them as "dashboard-uat-pictures").
//
// The owner sees ready-made cards that are Off. "Turn on" starts one at once with its own numbers (today, or the
// day after the challenge in its way ends); the card then says On and the challenge shows above the leaderboard.
// "Turn off" asks first, then stops it. "Change" opens the card's numbers (goal, first day, days, free days) and
// turns it on. Desk staff see the cards but no buttons. Check-in cards ("Check-in habit", "Regular month") show only
// when the gym's server counts visits (supabase 0091, NOT live: owner_challenges answers `checkins: true`).
// Phone and computer, light and dark, English and Hinglish.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { NOW, TODAY, expectFitsPhone, openApp, sheet, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

async function noSideways(page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

const SIZES = { phone: { width: 390, height: 844 }, computer: { width: 1280, height: 900 } };

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The gym server's challenge calls as 0037/0047/0048 (and 0091 for `checkins`) answer them, kept in memory.
 * `saved` collects every owner_save_challenge payload, `cancelled` every owner_cancel_challenge id.
 */
async function challengeServer(page, { canEdit = true, checkins = false, challenges = [] } = {}) {
  const state = { canEdit, checkins, challenges: [...challenges], saved: [], cancelled: [] };
  const statusOf = (c) => (c.cancelledAt ? 'cancelled' : c.startsOn > TODAY ? 'upcoming' : c.endsOn < TODAY ? 'ended' : 'running');
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(/\/rest\/v1\/rpc\/owner_challenges/, (route) =>
    json(route, {
      canEdit: state.canEdit,
      autoRewards: true,
      ...(state.checkins ? { checkins: true } : {}),
      challenges: state.challenges.map((c) => ({ ...c, status: statusOf(c) })),
    }),
  );
  await page.route(/\/rest\/v1\/rpc\/owner_save_challenge/, (route) => {
    if (!state.canEdit) return json(route, { code: 'P0001', message: 'OWNER_ONLY' }, 400);
    const p = route.request().postDataJSON().p_challenge;
    state.saved.push(p);
    const old = p.id ? state.challenges.find((c) => c.id === p.id) : null;
    if (old) Object.assign(old, p);
    else
      state.challenges.unshift({
        id: `c-${state.saved.length}`,
        ...p,
        createdByName: 'Ramesh Sharma',
        createdAt: NOW.getTime(),
        cancelledAt: null,
        entrants: 0,
        hitters: [],
      });
    return json(route, { ok: true });
  });
  await page.route(/\/rest\/v1\/rpc\/owner_cancel_challenge/, (route) => {
    const id = route.request().postDataJSON().p_id;
    state.cancelled.push(id);
    const c = state.challenges.find((x) => x.id === id);
    if (c) c.cancelledAt = NOW.getTime();
    return json(route, { ok: true });
  });
  await page.route(/\/rest\/v1\/rpc\/owner_board/, (route) =>
    json(route, {
      canEdit: state.canEdit,
      members: 3,
      workouts: {
        top: [
          { rank: 1, memberId: 'm-1', name: 'Asha Patel', phone: '+919000056101', value: 9, hidden: false },
          { rank: 2, memberId: 'm-2', name: 'Rahul Verma', phone: '+919000056102', value: 6, hidden: false },
          { rank: 3, memberId: 'm-3', name: 'Priya Nair', phone: '+919000056103', value: 4, hidden: false },
        ],
      },
      kg: { top: [] },
      hiddenMembers: [],
    }),
  );
  return state;
}

/** A challenge row as owner_challenges answers it. */
function serverChallenge({ id, title, measure = 'workouts', goal = 12, startsOn, days = 30, prizeDays = 7, entrants = 0 }) {
  return { id, title, measure, goal, startsOn, endsOn: addDays(startsOn, days - 1), prizeDays, createdByName: 'Ramesh Sharma', createdAt: NOW.getTime(), cancelledAt: null, entrants, hitters: [] };
}

async function setLook(page, { dark = false, hinglish = false } = {}) {
  await page.evaluate(
    ({ dark, hinglish }) => {
      localStorage.setItem('forgeai.theme.v1', dark ? 'dark' : 'light');
      localStorage.setItem('forgeai.lang.v1', hinglish ? 'hinglish' : 'en');
    },
    { dark, hinglish },
  );
}

async function openChallenges(page) {
  await page.evaluate(() => {
    window.location.hash = '/challenges';
  });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
}

const card = (page, id) => page.getByTestId(`ready-${id}`);

async function onlineGym(page) {
  await openApp(page);
  await startOnlineGym(page);
}

test.describe('phone', () => {
  test.use({ viewport: SIZES.phone });

  test('R-561 phone: ready-made cards are Off; Turn on, the next one waits, Turn off asks first, Change picks the numbers', async ({ page }) => {
    await onlineGym(page);
    const server = await challengeServer(page);
    await setLook(page, { dark: false, hinglish: false });
    await page.reload();
    await openChallenges(page);

    const section = page.getByRole('list', { name: 'Ready-made challenges' });
    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('These challenges are ready to use. Turn one on, and members see it with their progress on the leaderboard in the MettleUp app.', { exact: false })).toBeVisible();
    // Without 0091 the server cannot count visits: only the workout cards show.
    await expect(card(page, 'workout-habit')).toBeVisible();
    await expect(card(page, 'easy-start')).toBeVisible();
    await expect(card(page, 'checkin-habit')).toHaveCount(0);
    await expect(card(page, 'regular-month')).toHaveCount(0);
    await expect(card(page, 'workout-habit')).toContainText('This challenge is off. Members do not see it.');
    await expect(card(page, 'workout-habit')).toContainText('Members log 12 workouts in the MettleUp app within 30 days.');
    await expect(card(page, 'workout-habit')).toContainText('Everyone who reaches the goal wins 7 free days on their membership. You check each winner before the days are added.');
    await expect(page.getByText('Turn on a ready-made challenge above, or make your own with “New challenge”.')).toBeVisible();
    await expectFitsPhone(page, 'on Challenges with the ready-made cards off');
    await shot(page, 'phone-challenges-ready-1-off');

    // One tap turns it on with the card's numbers, from today.
    await page.getByRole('button', { name: 'Turn on: Workout habit', exact: true }).tap();
    await expect.poll(() => server.saved.length, { timeout: 15_000 }).toBe(1);
    expect(server.saved[0]).toEqual({ title: 'Workout habit', measure: 'workouts', goal: 12, startsOn: TODAY, endsOn: '2026-11-15', prizeDays: 7 });
    await expect(page.getByRole('status').filter({ hasText: 'Turned on. Members see “Workout habit” in the MettleUp app within 10 minutes.' })).toBeVisible();
    await expect(card(page, 'workout-habit')).toContainText('This challenge is on. It runs until 15 Nov 2026');
    await expect(card(page, 'workout-habit').getByRole('button', { name: 'Turn off: Workout habit' })).toBeVisible();
    // Only one challenge at a time: the next card waits for this one to end.
    await expect(card(page, 'easy-start')).toContainText('Only one challenge runs at a time, so this one would start on 16 Nov, after “Workout habit” ends.');
    await expect(card(page, 'easy-start').getByRole('button', { name: 'Turn on from 16 Nov: Easy start' })).toBeVisible();
    await expectFitsPhone(page, 'with Workout habit on');
    await shot(page, 'phone-challenges-ready-2-on');

    // Turn off asks first; "Keep it on" changes nothing.
    await card(page, 'workout-habit').getByRole('button', { name: 'Turn off: Workout habit' }).tap();
    const off = sheet(page, 'Turn off this challenge?');
    await expect(off).toContainText('Members will no longer see “Workout habit”, and nobody gets the reward for it.');
    await shot(page, 'phone-challenges-ready-3-turn-off-sheet', false);
    await off.getByRole('button', { name: 'Keep it on' }).tap();
    await expect(off).toHaveCount(0);
    expect(server.cancelled).toEqual([]);
    await card(page, 'workout-habit').getByRole('button', { name: 'Turn off: Workout habit' }).tap();
    await off.getByRole('button', { name: 'Turn off', exact: true }).tap();
    await expect.poll(() => server.cancelled.length, { timeout: 15_000 }).toBe(1);
    await expect(page.getByRole('status').filter({ hasText: 'Turned off. Members no longer see “Workout habit”.' })).toBeVisible();
    await expect(card(page, 'workout-habit')).toContainText('This challenge is off. Members do not see it.');
    await expect(card(page, 'easy-start').getByRole('button', { name: 'Turn on: Easy start', exact: true })).toBeVisible();

    // Change: the card's numbers in a form; its name and what counts stay.
    await card(page, 'easy-start').getByRole('button', { name: 'Change: Easy start' }).tap();
    const form = sheet(page, 'Easy start');
    await expect(form).toContainText('Members see this challenge as “Easy start”. Change the goal, the days or the reward, and then turn it on.');
    await expect(form.getByLabel('Name')).toHaveCount(0);
    await form.getByLabel('Goal (number of workouts)').fill('8');
    await form.getByLabel('How many days').fill('21');
    await expect(form).toContainText('It runs from 17 Oct to 6 Nov 2026. Members log 8 workouts in the MettleUp app within 21 days.');
    await shot(page, 'phone-challenges-ready-4-change-form', false);
    // A goal the server would refuse is stopped here, in words.
    await form.getByLabel('How many days').fill('40');
    await form.getByRole('button', { name: 'Turn on', exact: true }).tap();
    await expect(form).toContainText('It must run from 7 to 31 days.');
    expect(server.saved.length).toBe(1);
    await form.getByLabel('How many days').fill('21');
    await form.getByRole('button', { name: 'Turn on', exact: true }).tap();
    await expect.poll(() => server.saved.length, { timeout: 15_000 }).toBe(2);
    expect(server.saved[1]).toEqual({ title: 'Easy start', measure: 'workouts', goal: 8, startsOn: TODAY, endsOn: '2026-11-06', prizeDays: 2 });
    await expect(card(page, 'easy-start')).toContainText('Members log 8 workouts in the MettleUp app within 21 days.');
    await expect(card(page, 'easy-start')).toContainText('This challenge is on.');
    await expectFitsPhone(page, 'with Easy start changed and on');
    await shot(page, 'phone-challenges-ready-5-changed-on');
  });

  test('R-561 phone, dark, Hinglish: with 0091 the check-in cards show; one is running', async ({ page }) => {
    await onlineGym(page);
    await challengeServer(page, {
      checkins: true,
      challenges: [serverChallenge({ id: 'c-run', title: 'Check-in habit', measure: 'checkins', goal: 12, startsOn: '2026-10-10', entrants: 9 })],
    });
    await setLook(page, { dark: true, hinglish: true });
    await page.reload();
    await openChallenges(page);

    await expect(card(page, 'checkin-habit')).toBeVisible({ timeout: 15_000 });
    await expect(card(page, 'regular-month')).toBeVisible();
    await expect(card(page, 'checkin-habit')).toContainText('Chalu');
    await expect(card(page, 'checkin-habit')).toContainText('Members 30 din ke andar 12 alag-alag din aapke gym mein check in karte hain.');
    await expect(card(page, 'checkin-habit').getByRole('button', { name: 'Off karo: Check-in habit' })).toBeVisible();
    await expect(card(page, 'workout-habit')).toContainText('Yeh challenge band hai. Members ise nahi dekhte.');
    await expect(card(page, 'workout-habit').getByRole('button', { name: /se on karo: Workout habit$/ })).toBeVisible();
    await expectFitsPhone(page, 'on Challenges, dark, Hinglish');
    await shot(page, 'phone-challenges-ready-6-dark-hinglish-checkins');

    // The owner's own challenge can count visits too ("Hazri" in Hinglish).
    await page.getByRole('button', { name: 'Naya challenge', exact: true }).tap();
    const form = sheet(page, 'Naya challenge');
    await expect(form.getByRole('button', { name: 'Hazri', exact: true })).toBeVisible();
    await form.getByRole('button', { name: 'Hazri', exact: true }).tap();
    await expect(form.getByLabel('Goal (kitne din gym aana hai)')).toBeVisible();
    await shot(page, 'phone-challenges-ready-7-new-form-visits-hinglish', false);
  });

  test('R-561 phone: desk staff see the cards but cannot turn them on or off', async ({ page }) => {
    await onlineGym(page);
    await challengeServer(page, { canEdit: false, challenges: [serverChallenge({ id: 'c-run', title: 'Workout habit', startsOn: '2026-10-10', entrants: 5 })] });
    await openChallenges(page);

    await expect(card(page, 'workout-habit')).toContainText('This challenge is on.', { timeout: 15_000 });
    await expect(page.getByText('Only the owner can turn these challenges on or off.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Ready-made challenges' }).getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New challenge' })).toHaveCount(0);
    await expectFitsPhone(page, 'on Challenges as desk staff');
    await shot(page, 'phone-challenges-ready-8-desk');
  });
});

test.describe('computer', () => {
  test.use({ viewport: SIZES.computer });

  test('R-561 computer: the cards side by side, light English and dark Hinglish', async ({ page }) => {
    await onlineGym(page);
    await challengeServer(page, {
      checkins: true,
      challenges: [serverChallenge({ id: 'c-run', title: 'Workout habit', startsOn: '2026-10-10', entrants: 14 })],
    });
    await setLook(page, { dark: false, hinglish: false });
    await page.reload();
    await openChallenges(page);
    await expect(card(page, 'regular-month')).toBeVisible({ timeout: 15_000 });
    await expect(card(page, 'workout-habit')).toContainText('This challenge is on.');
    await expect(card(page, 'checkin-habit')).toContainText('Only one challenge runs at a time, so this one would start on 9 Nov, after “Workout habit” ends.');
    await noSideways(page);
    await shot(page, 'computer-challenges-ready-1-light-english');

    await setLook(page, { dark: true, hinglish: true });
    await page.reload();
    await openChallenges(page);
    await expect(card(page, 'workout-habit')).toContainText('Yeh challenge chalu hai.', { timeout: 15_000 });
    await expect(card(page, 'easy-start').getByRole('button', { name: /se on karo: Easy start$/ })).toBeVisible();
    await noSideways(page);
    await shot(page, 'computer-challenges-ready-2-dark-hinglish');
  });
});
