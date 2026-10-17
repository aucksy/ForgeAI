// UAT WP5b journey 14 (INVENTORY O-35): the owner's dues list. Three members owe for 10, 40 and 70
// days (plans started that long before the fixed clock, 17 Oct 2026). The list sorts them into age
// groups, the owner collects from the list itself, and the Money badge and the totals follow.
import { expect, test } from '@playwright/test';

import { addMember, bottomBar, expectFitsPhone, gymWithMonthlyPlan, open, sheet, tile } from './support.mjs';

const OWE = [
  { name: 'Komal Saini', phone: '98290 31010', startsOn: '2026-10-07', days: 10, group: 'Up to 30 days' },
  { name: 'Lalit Bansal', phone: '98290 31040', startsOn: '2026-09-07', days: 40, group: '31–60 days' },
  { name: 'Manju Yadav', phone: '98290 31070', startsOn: '2026-08-08', days: 70, group: 'Over 60 days' },
];

/** One person's row in Money -> Dues (phone layout). */
function duesRow(page, name) {
  return page
    .getByRole('main')
    .locator('div')
    .filter({ has: page.getByRole('link', { name }) })
    .filter({ has: page.getByRole('button', { name: 'Collect' }) })
    .last();
}

/** An age chip on Dues ("Over 60 days 1"). */
function chip(page, label) {
  return page.getByRole('group', { name: 'Filter by how long it is due' }).getByRole('button', { name: new RegExp(`^${label}`) });
}

const moneyTab = (page) => bottomBar(page).getByRole('link', { name: /^Money/ });

test('J14 dues list: 10, 40 and 70 days in their age groups; collect from the list; the badge drops', async ({ page }) => {
  await gymWithMonthlyPlan(page);

  // Each sold with nothing paid, starting that many days ago (the owner may back-date a plan).
  for (const m of OWE) {
    await addMember(page, m);
    await page.getByRole('button', { name: 'Sell membership' }).first().tap();
    const s = sheet(page, 'Sell membership');
    await s.getByLabel('Starts on').fill(m.startsOn);
    await expect(s).toContainText('Total to pay₹2,000');
    await s.getByRole('button', { name: 'Confirm' }).tap();
    await expect(s).toBeHidden();
    await expect(page.getByText('Membership saved. No money taken yet.')).toBeVisible();
  }

  // The Money tab on the bottom bar counts the three people who owe.
  await expect(moneyTab(page)).toHaveText(/^Money\s*3$/);

  await open(page, 'Money');
  await page.getByRole('button', { name: 'Dues' }).tap();
  await expectFitsPhone(page, 'on Dues');
  await expect(tile(page, 'Total due')).toContainText('₹6k');
  await expect(tile(page, 'Total due')).toContainText('3 members');
  for (const m of OWE) {
    await expect(tile(page, m.group)).toContainText('₹2k');
    await expect(tile(page, m.group)).toContainText('1 membership');
    const row = duesRow(page, m.name);
    await expect(row).toContainText(`${m.days} days`);
    await expect(row).toContainText(m.group);
    await expect(row).toContainText('₹2,000');
  }
  await expect(tile(page, 'Not started yet')).toContainText('₹0');
  // Oldest debt first: 70, then 40, then 10 days.
  const names = await page.getByRole('main').getByRole('link').filter({ hasText: /Komal|Lalit|Manju/ }).allTextContents();
  expect(names.map((n) => n.trim())).toEqual(['Manju Yadav', 'Lalit Bansal', 'Komal Saini']);

  // One age group at a time: the total follows what is shown.
  await chip(page, 'Over 60 days').tap();
  await expect(duesRow(page, 'Manju Yadav')).toBeVisible();
  await expect(duesRow(page, 'Komal Saini')).toHaveCount(0);
  await expect(tile(page, 'Total due')).toContainText('₹2k');
  await expect(tile(page, 'Total due')).toContainText('1 of 3 members shown');
  await chip(page, 'All').tap();

  // Collect Lalit's Rs 2,000 straight from the list.
  await duesRow(page, 'Lalit Bansal').getByRole('button', { name: 'Collect' }).tap();
  const c = sheet(page, 'Collect payment');
  await expect(c).toContainText('From Lalit Bansal · ₹2,000 due in total');
  await expect(c).toContainText('This clears all dues on this membership.');
  await c.getByLabel('Paid by').selectOption({ label: 'UPI' });
  await c.getByRole('button', { name: 'Save payment' }).tap();
  await expect(c).toBeHidden();
  await expect(page.getByText('Payment saved.', { exact: true })).toBeVisible();

  // He leaves the list; his age group empties; the badge and every total drop by one person.
  await expect(duesRow(page, 'Lalit Bansal')).toHaveCount(0);
  await expect(tile(page, '31–60 days')).toContainText('₹0');
  await expect(tile(page, '31–60 days')).toContainText('0 memberships');
  await expect(tile(page, 'Total due')).toContainText('₹4k');
  await expect(tile(page, 'Total due')).toContainText('2 members');
  await expect(chip(page, '31–60 days')).toHaveText(/0/);
  await expect(moneyTab(page)).toHaveText(/^Money\s*2$/);

  await open(page, 'Today');
  await expect(tile(page, 'Fees due')).toContainText('₹4k');
  await expect(tile(page, 'Fees due')).toContainText('2 members');
  await expect(tile(page, "Today's collection")).toContainText('₹2k');

  // The receipt is in Collections, taken today by UPI.
  await open(page, 'Money');
  await expect(page.getByRole('main')).toContainText('Lalit Bansal');
  await expect(page.getByRole('main').getByRole('link', { name: '2026-27/0001' })).toBeVisible();
});
