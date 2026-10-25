// R-124 (25 Oct 2026): Gym timings, on a server that has 0036 (the pretend server's `timingsServer`).
// The owner starts from "Morning and evening", closes Sunday, changes Monday and copies it to the
// week, is told in plain words about an overlap and an am/pm slip, keeps a late-night Saturday, adds
// Diwali as a closed day and a note, saves, and removes them again. The front desk sees them
// read-only. A server before 0036 says so in one line. On a 360px phone; the clock is Saturday
// 17 Oct 2026, 10:00 am India time.
import { expect, test } from '@playwright/test';

import { DESK, addDeskPerson, expectFitsPhone, open, openApp, secondPhone, sheet, signIn, startOnlineGym, toast } from './support.mjs';

test.use({ viewport: { width: 360, height: 780 } });

/** One day's box in the editor. */
function day(page, name) {
  return page.getByRole('main').getByRole('group', { name, exact: true });
}

test('J70 gym timings: the owner sets morning and evening, a closed Sunday, a holiday and a note; members see them', async ({ page }) => {
  const server = await openApp(page);
  server.timingsServer = true;
  await startOnlineGym(page);

  await open(page, 'Gym timings');
  const main = page.getByRole('main');
  await expect(page.getByRole('heading', { name: 'Gym timings', exact: true })).toBeVisible();
  await expect(main).toContainText('Start from');
  await main.getByRole('button', { name: /^Morning and evening/ }).tap();

  // What members see right now (Saturday 10:00 am, open 5-11 am).
  await expect(main.getByText(/^Right now members see:/)).toContainText('Right now members see: Open now · closes 11:00 am');
  await expectFitsPhone(page, 'in the timings editor');

  // ---- Sunday closed; Monday closes at 10:30 and is copied to Tuesday to Saturday.
  await day(page, 'Sunday').getByRole('button', { name: 'Closed', exact: true }).tap();
  await expect(day(page, 'Sunday')).toContainText('Closed');
  await day(page, 'Monday').getByLabel('Monday closes', { exact: true }).fill('10:30');
  await day(page, 'Monday').getByRole('button', { name: 'Copy Monday to Tue to Sat' }).tap();
  await expect(day(page, 'Saturday')).toContainText('5:00 am to 10:30 am, 4:00 pm to 10:00 pm');
  await expect(main.getByText(/^Right now members see:/)).toContainText('Closes soon · 10:30 am');

  // ---- Two times that overlap: refused in plain words, then fixed.
  await day(page, 'Wednesday').getByLabel('Wednesday opens again').fill('10:00');
  await main.getByRole('button', { name: 'Save and show members' }).tap();
  await expect(main.getByText('Wednesday: the two times overlap. The second must start after the first ends.')).toBeVisible();
  await day(page, 'Wednesday').getByLabel('Wednesday opens again').fill('16:00');

  // ---- An am/pm slip (4:00 pm to 9:00 am) is caught.
  await day(page, 'Friday').getByLabel('Friday closes again').fill('09:00');
  await main.getByRole('button', { name: 'Save and show members' }).tap();
  await expect(main.getByText(/^Friday: 4:00 pm to 9:00 am would end the next day\. Check am and pm\./)).toBeVisible();
  await day(page, 'Friday').getByLabel('Friday closes again').fill('22:00');

  // ---- A late Saturday night is fine: it ends the next day.
  await day(page, 'Saturday').getByLabel('Saturday closes again').fill('02:00');
  await expect(day(page, 'Saturday')).toContainText('Ends the next day at 2:00 am.');

  // ---- Diwali closed, and a note for members.
  await main.getByRole('button', { name: '+ Add a special day' }).tap();
  await main.getByLabel('Special day 1: date').fill('2026-11-08');
  await main.getByLabel('Special day 1: why (optional)').fill('Diwali');
  await expect(day(page, 'Sun 8 Nov')).toContainText('Closed');
  await main.getByLabel('One line members see under the timings').fill('Ladies batch 11 am to 12 pm');
  await expectFitsPhone(page, 'with a special day');

  await main.getByRole('button', { name: 'Save and show members' }).tap();
  await expect(toast(page)).toContainText('Gym timings saved. Members see them in the MettleUp app (Gym tab) within 10 minutes.');
  const saves = server.log.filter((c) => c.fn === 'owner_save_gym_timings');
  expect(saves).toHaveLength(1);
  const sent = saves[0].args.p_hours;
  expect(sent.week.sun).toEqual({ kind: 'closed', ranges: [] });
  expect(sent.week.tue.ranges).toEqual([
    { open: '05:00', close: '10:30' },
    { open: '16:00', close: '22:00' },
  ]);
  expect(sent.week.sat.ranges[1]).toEqual({ open: '16:00', close: '02:00' });
  expect(sent.special).toEqual([{ date: '2026-11-08', kind: 'closed', ranges: [], note: 'Diwali' }]);
  expect(sent.note).toBe('Ladies batch 11 am to 12 pm');
  await expect(main).toContainText('Last saved 17 Oct 2026 by Ramesh Sharma.');
  // Nothing changed since: Save waits.
  await expect(main.getByRole('button', { name: 'Save timings' })).toBeDisabled();

  // ---- Opened again later: the saved timings come back.
  await page.reload();
  await expect(day(page, 'Monday')).toContainText('5:00 am to 10:30 am, 4:00 pm to 10:00 pm');
  await expect(main.getByLabel('Special day 1: why (optional)')).toHaveValue('Diwali');

  // ---- Remove: asked first; members then see nothing.
  await main.getByRole('button', { name: 'Remove timings' }).tap();
  const confirm = sheet(page, 'Remove the gym timings?');
  await expect(confirm).toContainText('Members will no longer see when your gym is open.');
  await confirm.getByRole('button', { name: 'Remove', exact: true }).tap();
  await expect(toast(page)).toContainText('Gym timings removed. Members no longer see them.');
  expect(server.timings).toBeNull();
  await expect(main).toContainText('Start from');
});

test('J71 gym timings: the front desk sees them but cannot change them; Settings and the sidebar lead there', async ({ page, browser }) => {
  const server = await openApp(page);
  server.timingsServer = true;
  await startOnlineGym(page);
  await open(page, 'Settings');
  await page.getByRole('button', { name: 'Open gym timings' }).tap();
  await expect(page.getByRole('heading', { name: 'Gym timings', exact: true })).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: /^One long day/ }).tap();
  await page.getByRole('main').getByRole('button', { name: 'Save and show members' }).tap();
  await expect(toast(page)).toContainText('Gym timings saved.');

  await addDeskPerson(page);
  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);
  await open(desk, 'Gym timings');
  const main = desk.getByRole('main');
  await expect(main).toContainText('Your gym’s timings');
  await expect(main).toContainText('Right now members see: Open now · closes 10:00 pm');
  await expect(main.getByRole('definition').first()).toHaveText('5:00 am to 10:00 pm');
  await expect(main).toContainText('Only the owner can change the gym timings.');
  await expect(main.getByRole('button', { name: /Save/ })).toHaveCount(0);
  await expectFitsPhone(desk, 'on the desk’s Gym timings');
  await desk.context().close();
});

test('J72 a server before 0036 says gym timings are not switched on yet', async ({ page }) => {
  await openApp(page);
  await startOnlineGym(page);
  await open(page, 'Gym timings');
  await expect(page.getByRole('main')).toContainText('Gym timings are not switched on for your gym yet');
  await expect(page.getByRole('button', { name: /^Morning and evening/ })).toHaveCount(0);
});
