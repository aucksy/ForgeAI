// R-86 (23 Oct 2026): Messages & offers → Automatic reminders, on a server that has 0029 (the
// pretend server's `reminderServer`). The owner sees every case with the common ones on, changes the
// days and two switches, saves; the change is on the server and still there after a reload. The front
// desk can look but not change. A server before 0029 says it in one line. On a 360px phone.
import { expect, test } from '@playwright/test';

import { DESK, addDeskPerson, expectFitsPhone, open, openApp, secondPhone, signIn, startOnlineGym } from './support.mjs';

test.use({ viewport: { width: 360, height: 780 } });

/** One reminder's row (its switch, words and days field). */
const row = (page, title) => page.getByRole('group', { name: title, exact: true });

async function openReminders(page) {
  await open(page, 'Messages & offers');
  await page.getByRole('group', { name: 'Section' }).getByRole('button', { name: 'Reminders' }).tap();
}

test('J38 automatic reminders: the owner switches them and sets the days; members get them from the server', async ({ page }) => {
  const server = await openApp(page);
  server.reminderServer = true;
  await startOnlineGym(page);
  await openReminders(page);

  // ---- The common ones start on; the touchy ones off.
  const main = page.getByRole('main');
  await expect(main).toContainText('Members with the ForgeAI app get these on their phone at 9:30 am, never more than one a day.');
  await expect(main).toContainText('6 of 11 on · the usual ones');
  for (const on of ['Plan ends soon', 'Plan ends today', 'Plan ended', 'Birthday wish', 'Welcome', 'Workout offer: days added']) {
    await expect(row(page, on).getByRole('switch')).toBeChecked();
  }
  for (const off of ["We haven't seen you", 'One year with you', 'Workout offer: ending soon', 'Workout offer: almost there', 'Personal training running low']) {
    await expect(row(page, off).getByRole('switch')).not.toBeChecked();
  }
  await expect(row(page, 'Plan ends soon').getByLabel('Days before the last day')).toHaveValue('7, 3');
  await expect(row(page, 'Birthday wish')).toContainText('Happy birthday, Asha! Best wishes from all of us at Shakti Gym.');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await expectFitsPhone(page, 'on Automatic reminders');

  // ---- A wrong number is said plainly and blocks the save.
  const soonDays = row(page, 'Plan ends soon').getByLabel('Days before the last day');
  await soonDays.fill('1, 2, 3, 4');
  await expect(page.getByText('Days before the last day: whole numbers from 1 to 30, up to 3 (like 7, 3).')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await soonDays.fill('3, 1');

  // ---- "We haven't seen you" on (its days appear), birthday off.
  await row(page, "We haven't seen you").getByRole('switch').tap();
  await expect(row(page, "We haven't seen you").getByLabel('Days without a check-in')).toHaveValue('14');
  await row(page, 'Birthday wish').getByRole('switch').tap();
  await expect(main).toContainText('6 of 11 on');
  await page.getByRole('button', { name: 'Save changes' }).tap();
  await expect(page.getByText("Saved. Members' phones pick this up the next time they open ForgeAI.")).toBeVisible();

  const saved = server.log.filter((c) => c.fn === 'owner_save_auto_reminders');
  expect(saved).toHaveLength(1);
  expect(saved[0].args.p_settings).toMatchObject({
    plan_ends_soon: { on: true, days: [3, 1] },
    plan_ended: { on: true, days: [7, 1] },
    miss_you: { on: true, days: [14] },
    birthday: { on: false },
    welcome: { on: true },
  });
  expect(Object.keys(saved[0].args.p_settings)).toHaveLength(11);
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();

  // ---- Still there after a reload, with who changed it.
  await page.reload();
  await expect(main).toContainText('last changed by Ramesh Sharma', { timeout: 15_000 });
  await expect(row(page, 'Plan ends soon').getByLabel('Days before the last day')).toHaveValue('3, 1');
  await expect(row(page, 'Birthday wish').getByRole('switch')).not.toBeChecked();
  await expect(row(page, "We haven't seen you").getByRole('switch')).toBeChecked();
  await expectFitsPhone(page, 'after saving');
});

test('J38b the front desk can look at the automatic reminders but not change them', async ({ page, browser }) => {
  const server = await openApp(page);
  server.reminderServer = true;
  await startOnlineGym(page);
  await addDeskPerson(page);

  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);
  await desk.goto('./#/messages/reminders');
  // The desk's page title and the section title both read "Automatic reminders" (run 39968489102).
  await expect(desk.getByRole('heading', { name: 'Automatic reminders', level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(desk.getByText('Only the owner can change these.')).toBeVisible();
  await expect(row(desk, 'Plan ends soon').getByRole('switch')).toBeDisabled();
  await expect(row(desk, 'Plan ends soon')).toContainText('Days before the last day: 7, 3');
  await expect(desk.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  // The desk's sections: the workout offer and the reminders, never Messages.
  const tabs = desk.getByRole('group', { name: 'Section' });
  await expect(tabs.getByRole('button', { name: 'Messages' })).toHaveCount(0);
  await expect(tabs.getByRole('button', { name: 'Workout offer' })).toBeVisible();
  await expectFitsPhone(desk, 'desk on Automatic reminders');
  expect(server.log.some((c) => c.fn === 'owner_save_auto_reminders')).toBe(false);
  await desk.context().close();
});

test('J38c a server before 0029: Automatic reminders says it is not switched on', async ({ page }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  await openReminders(page);
  await expect(page.getByText('Automatic reminders are not switched on for your gym yet.')).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Until then, members with the ForgeAI app get the usual ones');
  await expectFitsPhone(page, 'on an old server');
  expect(server.log.some((c) => c.fn === 'owner_save_auto_reminders')).toBe(false);
});
