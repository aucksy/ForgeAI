// #49 step 2 (23 Oct 2026; R-82): the workout offer and group / timed messages, on a server that has
// 0025 (the pretend server's `offerServer`). The owner starts "Train 10 times in 30 days, get 3
// extra days" with the desk giving the days; a member who joined in the app reaches 10 (seeded on
// the pretend server, the way member_offer_days leaves it); the list shows "Ready for reward"; one
// tap gives the days; the member's page shows the new last day and the reward in the plan's history.
// On a 360px phone.
import { expect, test } from '@playwright/test';

import { addMember, addPlan, expectFitsPhone, open, openApp, openMember, sell, startOnlineGym } from './support.mjs';

test.use({ viewport: { width: 360, height: 780 } });

/** The roster id (the gym's own record id) of a member, read off the pretend server. */
function rosterIdOf(server, fullName) {
  const r = [...server.records.values()].find((x) => x.k === 'member' && !x.x && x.d.fullName === fullName);
  if (!r) throw new Error(`no member ${fullName}`);
  return r.id;
}

/** An online gym with one plan and one member on it (sold today, ends 16 Nov 2026). */
async function onlineGymWithMember(page) {
  const server = await openApp(page);
  server.offerServer = true;
  await startOnlineGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', months: '1' });
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await sell(page, { received: '1500' });
  return server;
}

test('J37 workout offer: the owner starts it, a member reaches 10, the desk gives 3 days with one tap', async ({ page }) => {
  const server = await onlineGymWithMember(page);

  // ---- Messages & offers → Workout offer: the form starts on the approved numbers.
  await open(page, 'Messages & offers');
  await page.getByRole('group', { name: 'Section' }).getByRole('button', { name: 'Workout offer' }).tap();
  await expect(page.getByText('Start a workout offer', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Workouts', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel('Within (days of joining)', { exact: true })).toHaveValue('30');
  await expect(page.getByLabel('Reward (extra days)', { exact: true })).toHaveValue('3');
  await expect(page.getByRole('button', { name: 'I give them (the desk gives with one tap)', pressed: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Train 10 times in 30 days, get 3 extra days');
  await expect(page.getByRole('main')).toContainText('Check in at the gym and log a workout of 20+ minutes with 6+ sets.');
  await expectFitsPhone(page, 'on Start a workout offer');

  // A number out of range is said plainly and blocks the start.
  await page.getByLabel('Workouts', { exact: true }).fill('3');
  await expect(page.getByText('Workouts: a whole number from 4 to 30.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start offer' })).toBeDisabled();
  await page.getByLabel('Workouts', { exact: true }).fill('10');

  await page.getByRole('button', { name: 'Start offer' }).tap();
  await expect(page.getByText('Offer started. Members see it in the ForgeAI app now.')).toBeVisible();
  const saved = server.log.find((c) => c.fn === 'owner_save_offer');
  expect(saved.args.p_offer).toMatchObject({ workouts: 10, windowDays: 30, rewardDays: 3, autoGive: false, countAppCheckins: true, joinUntil: '2026-11-16' });
  await expect(page.getByRole('main')).toContainText('Joined 0 · Ready 0 · Rewarded 0');
  await expect(page.getByRole('main')).toContainText('The desk gives the days with one tap.');

  // ---- Asha joins in the app and the register matches 10 of her workout days.
  server.joinOffer(rosterIdOf(server, 'Asha Verma'), 10);
  await page.reload();
  const row = page.getByRole('group', { name: 'Asha Verma: Ready for reward' });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('10 of 10 workouts · desk 10 · app 0 · until 15 Nov 2026');
  await expect(page.getByRole('main')).toContainText('Joined 1 · Ready 1 · Rewarded 0');
  await expectFitsPhone(page, 'with a reward to give');

  // ---- One tap gives the days.
  await row.getByRole('button', { name: 'Give 3 days to Asha Verma' }).tap();
  await expect(page.getByText('3 days added for Asha Verma. New last day: 19 Nov 2026.')).toBeVisible();
  const given = page.getByRole('group', { name: 'Asha Verma: Rewarded' });
  await expect(given).toContainText('Extended free by 3 days (reward) · by Ramesh Sharma · new last day 19 Nov 2026');
  await expect(page.getByRole('main')).toContainText('Joined 1 · Ready 0 · Rewarded 1');
  // A second tap is impossible: the button is gone.
  await expect(given.getByRole('button', { name: /^Give/ })).toHaveCount(0);
  expect(server.log.filter((c) => c.fn === 'staff_give_reward')).toHaveLength(1);

  // ---- The member's page: the new last day, and the reward in the plan's history (no receipt).
  await openMember(page, 'Asha Verma');
  const main = page.getByRole('main');
  await expect(main).toContainText('19 Nov 2026');
  await expect(main).toContainText('Extended free by 3 days (reward): 16 Nov 2026 → 19 Nov 2026');
  await expectFitsPhone(page, 'on the member page after the reward');

  // ---- The owner can take it back (a mistake): the plan's last day goes back, and it says so.
  page.once('dialog', (d) => void d.accept());
  await page.goto('./#/messages/offer');
  await page.getByRole('group', { name: 'Asha Verma: Rewarded' }).getByRole('button', { name: 'Take back the reward from Asha Verma' }).tap();
  await expect(page.getByText('Reward taken back. Last day: 16 Nov 2026.')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Asha Verma: Reward taken back' })).toBeVisible();
  await openMember(page, 'Asha Verma');
  await expect(page.getByRole('main')).toContainText('Reward taken back: 19 Nov 2026 → 16 Nov 2026');
});

test('J37b on a server with 0025: a group message goes only to the group, at a chosen time', async ({ page }) => {
  const server = await onlineGymWithMember(page);
  await addMember(page, { name: 'Bharat Singh', phone: '98290 22222' });
  // Asha has the app; so does someone not in the group (no plan) — Bharat's number.
  server.appMembers = [
    { member_id: 'app-asha', name: 'Asha', phone: '+919829011111', joined_at: '2026-10-01T10:00:00Z', last_seen: '2026-10-16T10:00:00Z', orders: 0, spent_p: 0 },
    { member_id: 'app-bharat', name: 'Bharat', phone: '+919829022222', joined_at: '2026-10-02T10:00:00Z', last_seen: '2026-10-16T10:00:00Z', orders: 0, spent_p: 0 },
  ];

  await open(page, 'Messages & offers');
  await page.getByRole('group', { name: 'Kind of message' }).getByRole('button', { name: 'Write my own' }).tap();
  await page.getByLabel('Title', { exact: true }).fill('Steam room closed on Sunday');
  await page.getByLabel('Message', { exact: true }).fill('The steam room is closed on Sunday for cleaning.');
  await page.getByLabel('Group', { exact: true }).selectOption('active');
  await expect(page.getByRole('main')).toContainText('In this group: 1 member. In the app: 1 member of this group.');
  await expect(page.getByText('In the app this goes to everyone; for just this group, use WhatsApp.')).toHaveCount(0);

  // Tomorrow, 9 am.
  await page.getByRole('group', { name: 'When' }).getByRole('button', { name: 'Pick a day and time' }).tap();
  await page.getByLabel('Day and time', { exact: true }).fill('2026-10-18T09:00');
  await page.getByRole('button', { name: 'Send in the app' }).tap();
  await expect(page.getByText('Goes to 1 member of this group in the app on 18 Oct 2026, 9:00 am. Send then?')).toBeVisible();
  await expectFitsPhone(page, 'confirming a timed group message');
  await page.getByRole('button', { name: 'Yes, send' }).tap();
  await expect(page.getByText('Goes out 18 Oct 2026, 9:00 am to 1 member in the app.')).toBeVisible();

  const sent = server.log.find((c) => c.fn === 'owner_send_message');
  expect(sent.args.p_to).toEqual(['app-asha']);
  expect(sent.args.p_send_at).toBe('2026-10-18T09:00:00+05:30');
  // The Sent list: to a group, and when it goes out; it can still be cancelled.
  await expect(page.getByRole('main')).toContainText('Goes out 18 Oct 2026, 9:00 am · 1 member');
  await expect(page.getByRole('main')).toContainText('To a group');
  await expect(page.getByRole('button', { name: 'Cancel Steam room closed on Sunday' })).toBeVisible();
  await expectFitsPhone(page, 'with a timed message in the Sent list');
});

test('J37c a server before 0025: the Workout offer page says it is not switched on', async ({ page }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  await open(page, 'Messages & offers');
  await page.getByRole('group', { name: 'Section' }).getByRole('button', { name: 'Workout offer' }).tap();
  await expect(page.getByText('Workout offers in the app are not switched on for your gym yet.')).toBeVisible();
  await expectFitsPhone(page, 'on an old server');
  expect(server.log.some((c) => c.fn === 'owner_save_offer')).toBe(false);
});
