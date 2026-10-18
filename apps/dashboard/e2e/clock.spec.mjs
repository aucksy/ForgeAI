// UAT work package 10: fixed clocks. Playwright's clock starts at a chosen moment in India time and
// is moved forward (fastForward) the way the night really passes; the page is never reloaded, so
// the panel has to notice the new day by itself, as a front desk left open overnight does.
//
// J27a: 31 March 23:55 -> a sale numbered in the 2025-26 series; a check-in at 23:59; after
//       midnight (1 April 00:01) a check-in on the new day and a payment numbered 2026-27/0001.
// J27b: a plan whose last day is today is still running ("Last day is today", Ending today); one day
//       later it has ended (Expired), on its page, in the Today tiles and in the Expired list.
import { expect, test } from '@playwright/test';

import { addMember, addPlan, clockTo, expectFitsPhone, freshGym, open, openMember, sell, sheet, tile } from './support.mjs';

const register = (page) =>
  page.getByRole('searchbox', { name: 'Type a name or the last 4 digits of a mobile' }).or(page.getByLabel('Type a name or the last 4 digits of a mobile'));

test('J27a 31 March to 1 April at midnight: the receipt series restarts; two check-ins on two days', async ({ page }) => {
  await freshGym(page, { time: new Date('2026-03-31T23:55:00+05:30') });
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '0', months: '1' });

  // 23:5x on 31 March: a sale, part paid. The receipt is in the 2025-26 series.
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await page.getByRole('button', { name: 'Sell membership' }).first().tap();
  const s = sheet(page, 'Sell membership');
  await expect(s).toContainText('30 Apr 2026');
  await s.getByLabel('Received now').fill('1000');
  await expect(s.getByLabel('Received on')).toHaveValue('2026-03-31');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(page.getByText('Membership saved. Receipt 2025-26/0001.')).toBeVisible();

  // 23:59: she checks in.
  await clockTo(page, '2026-03-31T23:59:00+05:30');
  await open(page, 'Visits');
  await register(page).fill('Asha');
  await page.getByRole('main').getByRole('button', { name: 'Check in', exact: true }).tap();
  await expect(page.getByText('Asha Verma checked in.')).toBeVisible();
  await expect(tile(page, 'Check-ins today')).toContainText('1');

  // 00:01 on 1 April, the register still open: a new day, nobody in yet. She checks in again.
  await clockTo(page, '2026-04-01T00:01:00+05:30');
  await expect(tile(page, 'Check-ins today')).toContainText('0');
  await register(page).fill('Asha');
  await page.getByRole('main').getByRole('button', { name: 'Check in', exact: true }).tap();
  await expect(page.getByText('Asha Verma checked in.')).toBeVisible();
  await expect(tile(page, 'Check-ins today')).toContainText('1');

  // Two visits, on two days.
  await openMember(page, 'Asha Verma');
  await expect(tile(page, 'Total visits')).toContainText('2');
  await expect(tile(page, 'Last visit')).toContainText('1 Apr 2026');
  await open(page, 'Visits');
  await page.getByRole('group', { name: 'Day' }).getByRole('button', { name: 'Yesterday' }).tap();
  await expect(tile(page, 'Check-ins on 31 Mar')).toContainText('1');

  // The rest of her fee, taken after midnight: the new year's first receipt.
  await openMember(page, 'Asha Verma');
  await page.getByRole('button', { name: 'Collect payment' }).tap();
  const c = sheet(page, 'Collect payment');
  await expect(c.getByLabel('Received on')).toHaveValue('2026-04-01');
  await c.getByRole('button', { name: 'Save payment' }).tap();
  await expect(page.getByText('Payment saved. Receipt 2026-27/0001.')).toBeVisible();

  // Collections: this financial year holds only the new receipt; last month the old one.
  await open(page, 'Money');
  const period = page.getByRole('group', { name: 'Period' });
  await period.getByRole('button', { name: 'This financial year' }).tap();
  await expect(page.getByRole('main')).toContainText('1 Apr 2026 → 31 Mar 2027');
  await expect(tile(page, 'Collected')).toContainText('₹500');
  await expect(page.getByRole('main').getByRole('link', { name: '2026-27/0001' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: '2025-26/0001' })).toHaveCount(0);
  await period.getByRole('button', { name: 'Last month' }).tap();
  await expect(tile(page, 'Collected')).toContainText('₹1k');
  await expect(page.getByRole('main').getByRole('link', { name: '2025-26/0001' })).toBeVisible();
});

test('J27b a plan ending today is still running; a day later it has expired, everywhere', async ({ page }) => {
  await freshGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '0', months: '1' });
  // Asha's month runs 18 Sep - 17 Oct: today is her last day. Bharat's started today.
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await page.getByRole('button', { name: 'Sell membership' }).first().tap();
  const s = sheet(page, 'Sell membership');
  await s.getByLabel('Starts on').fill('2026-09-18');
  await expect(s).toContainText('17 Oct 2026');
  await s.getByLabel('Received now').fill('1500');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(page.getByText('Membership saved. Receipt 2026-27/0001.')).toBeVisible();
  await expect(tile(page, 'Days left')).toContainText('0');
  await expect(tile(page, 'Days left')).toContainText('Last day is today');
  await expect(page.getByRole('main')).toContainText('Expiring');
  await addMember(page, { name: 'Bharat Singh', phone: '98290 22222' });
  await sell(page, { received: '1500' });

  await open(page, 'Today');
  await expect(tile(page, 'Active members')).toContainText('2');
  await expect(tile(page, 'Ending today')).toContainText('1');
  await expect(tile(page, 'Expired')).toContainText('0');
  await tile(page, 'Ending today').tap();
  await expect(page.getByRole('main').getByRole('link', { name: /Asha Verma/ })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /Bharat Singh/ })).toHaveCount(0);

  // The next morning, the panel left open.
  await clockTo(page, '2026-10-18T09:00:00+05:30');
  await open(page, 'Today');
  await expect(tile(page, 'Active members')).toContainText('1');
  await expect(tile(page, 'Ending today')).toContainText('0');
  await expect(tile(page, 'Expired')).toContainText('1');
  await tile(page, 'Expired').tap();
  await expect(page.getByRole('main').getByRole('link', { name: /Asha Verma/ })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /Bharat Singh/ })).toHaveCount(0);

  await openMember(page, 'Asha Verma');
  await expect(tile(page, 'Days left')).toContainText('Expired');
  await expect(page.getByRole('main')).toContainText('Expired');
  // The Members list's Expired filter agrees.
  await open(page, 'Members');
  await expect(page.getByRole('button', { name: /^Expired/ }).first()).toHaveText(/1/);
});

// J27c (owner inbox #20): the "Ending in 1-3 / 4-7 / 8-15 days" tiles, at their edges. Six monthly
// plans end 3, 4, 7, 8, 15 and 16 days from today (17 Oct). Each tile counts only its own days and
// opens a list of exactly those people; the next morning everyone moves one day closer.
test('J27c the Ending in 1-3 / 4-7 / 8-15 days tiles split at their edges and move the next day', async ({ page }) => {
  await freshGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '0', months: '1' });
  // A month starting on `start` ends the day before the same date next month.
  const people = [
    { name: 'Asha Verma', phone: '98290 11111', start: '2026-09-21', ends: '20 Oct 2026' }, // 3 days
    { name: 'Bharat Singh', phone: '98290 22222', start: '2026-09-22', ends: '21 Oct 2026' }, // 4
    { name: 'Chetan Joshi', phone: '98290 33333', start: '2026-09-25', ends: '24 Oct 2026' }, // 7
    { name: 'Deepa Rathore', phone: '98290 44444', start: '2026-09-26', ends: '25 Oct 2026' }, // 8
    { name: 'Esha Meena', phone: '98290 55555', start: '2026-10-02', ends: '1 Nov 2026' }, // 15
    { name: 'Farhan Khan', phone: '98290 66666', start: '2026-10-03', ends: '2 Nov 2026' }, // 16
  ];
  for (const p of people) {
    await addMember(page, { name: p.name, phone: p.phone });
    await page.getByRole('button', { name: 'Sell membership' }).first().tap();
    const s = sheet(page, 'Sell membership');
    await s.getByLabel('Starts on').fill(p.start);
    await expect(s).toContainText(p.ends);
    await s.getByLabel('Received now').fill('1500');
    await s.getByRole('button', { name: 'Confirm' }).tap();
    await expect(page.getByText(/^Membership saved\./)).toBeVisible();
  }

  // The tile's big number only (its label "8-15" holds digits too, so no toContainText).
  const count = (label) => tile(page, label).locator('xpath=./div[1]');
  const listShows = async (label, names) => {
    await open(page, 'Today');
    await tile(page, label).tap();
    const main = page.getByRole('main');
    for (const p of people) {
      await expect(main.getByRole('link', { name: new RegExp(p.name) })).toHaveCount(names.includes(p.name) ? 1 : 0);
    }
  };

  await open(page, 'Today');
  await expect(count('Active members')).toHaveText('6');
  await expect(count('Ending today')).toHaveText('0');
  await expect(count('Ending in 1-3 days')).toHaveText('1');
  await expect(count('Ending in 4-7 days')).toHaveText('2');
  await expect(count('Ending in 8-15 days')).toHaveText('2');
  await expectFitsPhone(page, 'on Today with the ending tiles');
  await listShows('Ending in 1-3 days', ['Asha Verma']);
  await listShows('Ending in 4-7 days', ['Bharat Singh', 'Chetan Joshi']);
  await listShows('Ending in 8-15 days', ['Deepa Rathore', 'Esha Meena']);

  // The next morning, the panel left open: 2, 3, 6, 7, 14 and 15 days left.
  await clockTo(page, '2026-10-18T09:00:00+05:30');
  await open(page, 'Today');
  await expect(count('Ending in 1-3 days')).toHaveText('2');
  await expect(count('Ending in 4-7 days')).toHaveText('2');
  await expect(count('Ending in 8-15 days')).toHaveText('2');
  await listShows('Ending in 1-3 days', ['Asha Verma', 'Bharat Singh']);
  await listShows('Ending in 8-15 days', ['Esha Meena', 'Farhan Khan']);
});
