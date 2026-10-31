// UAT WP5 journeys 1-5: the money moment, driven on a phone by the owner.
// Every journey starts from its own fresh gym (Start demo -> Erase and start fresh), so each one
// can fail, or be marked fixme, on its own.
import { expect, test } from '@playwright/test';

import {
  MEMBERS,
  addMember,
  addPlan,
  expectFitsPhone,
  freshGym,
  gymWithMonthlyPlan,
  open,
  openMember,
  sell,
  sheet,
  threeSales,
  tile,
} from './support.mjs';

/** One person's row in Money -> Dues (phone layout): name, amount, Collect. */
function duesRow(page, name) {
  return page
    .getByRole('main')
    .locator('div')
    .filter({ has: page.getByRole('link', { name }) })
    .filter({ has: page.getByRole('button', { name: 'Collect' }) })
    .last();
}

/** One receipt row on a member's page: receipt number, date, amount, Cancel receipt. */
function paymentRow(page, receiptNo) {
  return page
    .getByRole('main')
    .locator('div')
    .filter({ has: page.getByRole('link', { name: new RegExp(receiptNo) }) })
    .filter({ hasText: '₹' })
    .last();
}

/** One membership row on a member's page, found by its dates line. */
function membershipRow(page, dates) {
  return page.getByRole('main').locator('div').filter({ hasText: dates }).filter({ hasText: '₹' }).last();
}

test('J1 a fresh gym, then a plan: Monthly Rs 1,500 + Rs 500 joining fee', async ({ page }) => {
  await freshGym(page);
  // The fresh gym is really empty, and keeps the name it was set up with.
  await open(page, 'Plans');
  await expect(page.getByText('No plans yet')).toBeVisible();
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
  const main = page.getByRole('main');
  await expect(main.getByText('Monthly', { exact: true })).toBeVisible();
  await expect(main.getByText('₹1,500', { exact: true })).toBeVisible();
  await expect(main).toContainText('1 month');
  await expect(main).toContainText('+ ₹500 joining fee');
  // Sold today (17 Oct 2026), a month runs until 16 Nov 2026.
  await expect(main).toContainText('Sold today, runs until16 Nov 2026');
});

test('J2 sell the plan three ways: full, part Rs 1,000, Rs 0 now', async ({ page }) => {
  await gymWithMonthlyPlan(page);

  // Full: Rs 1,500 + Rs 500 joining fee = Rs 2,000, all taken now.
  await addMember(page, MEMBERS.full);
  await page.getByRole('button', { name: 'Sell membership' }).first().tap();
  const s = sheet(page, 'Sell membership');
  await expect(s).toContainText('Total to pay₹2,000');
  await expect(s).toContainText('16 Nov 2026');
  // More than the total is refused, and nothing is saved.
  await s.getByLabel('Received now').fill('2500');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(s).toContainText('Amount received is more than the total.');
  await s.getByLabel('Received now').fill('2000');
  await expect(s).not.toContainText('Still due after this');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(page.getByText('Membership saved. Receipt 2026-27/0001.')).toBeVisible();
  await expect(tile(page, 'Dues')).toContainText('Fully paid');

  // Part: Rs 1,000 now, Rs 1,000 still due.
  await addMember(page, MEMBERS.part);
  await page.getByRole('button', { name: 'Sell membership' }).first().tap();
  await s.getByLabel('Received now').fill('1000');
  await expect(s).toContainText('Still due after this: ₹1,000');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(page.getByText('Membership saved. Receipt 2026-27/0002.')).toBeVisible();
  await expect(tile(page, 'Dues')).toContainText('₹1,000');
  await expect(tile(page, 'Dues')).toContainText('Still to pay');

  // Nothing now: no receipt, the whole Rs 2,000 is due.
  await addMember(page, MEMBERS.none);
  expect(await sell(page, {})).toBe('Membership saved. No money taken yet.');
  await expect(tile(page, 'Dues')).toContainText('₹2,000');
  await expect(page.getByRole('main')).toContainText('No payments yet');

  // Money -> Dues: the two who owe, with their amounts; Rs 3,000 in all.
  await open(page, 'Money');
  await page.getByRole('button', { name: 'Dues' }).tap();
  await expect(tile(page, 'Total due')).toContainText('₹3,000');
  await expect(tile(page, 'Total due')).toContainText('2 members');
  await expect(duesRow(page, MEMBERS.part.name)).toContainText('₹1,000');
  await expect(duesRow(page, MEMBERS.none.name)).toContainText('₹2,000');
  await expect(duesRow(page, MEMBERS.full.name)).toHaveCount(0);

  // Today: Rs 3,000 came in today (Rs 2,000 + Rs 1,000), and Rs 3,000 is still due from 2 members.
  await open(page, 'Today');
  await expect(tile(page, "Today's collection")).toContainText('₹3,000');
  await expect(tile(page, "Today's collection")).toContainText('This month ₹3,000');
  await expect(tile(page, 'Fees due')).toContainText('₹3,000');
  await expect(tile(page, 'Fees due')).toContainText('2 members');
  await expect(tile(page, 'Active members')).toContainText('3');

  // Today's collection opens the receipts of today: two of them, exact amounts.
  await tile(page, "Today's collection").tap();
  await expect(page.getByRole('heading', { name: 'Money', exact: true })).toBeVisible();
  const main = page.getByRole('main');
  await expect(tile(page, 'Collected')).toContainText('₹3,000');
  await expect(main.getByRole('link', { name: '2026-27/0001' })).toBeVisible();
  await expect(main.getByRole('link', { name: '2026-27/0002' })).toBeVisible();
  await expect(main.getByRole('link', { name: '2026-27/0003' })).toHaveCount(0);
});

test('J3 collect the rest of a due; more than the due is refused', async ({ page }) => {
  await gymWithMonthlyPlan(page);
  await threeSales(page);

  // Bharat owes Rs 1,000. Collect, leaving the amount blank = the full due.
  await openMember(page, MEMBERS.part.name);
  await page.getByRole('button', { name: 'Collect payment' }).tap();
  const s = sheet(page, 'Collect payment');
  await expect(s).toBeVisible();
  await expectFitsPhone(page, 'in Collect payment');
  await expect(s).toContainText('₹1,000 due in total');
  await expect(s).toContainText('This clears all dues on this membership.');
  // Money received tomorrow is refused.
  await s.getByLabel('Received on').fill('2026-10-18');
  await s.getByRole('button', { name: 'Save payment' }).tap();
  await expect(s.getByRole('alert')).toHaveText('The payment date can’t be in the future.');
  await s.getByLabel('Received on').fill('2026-10-17');
  await s.getByRole('button', { name: 'Save payment' }).tap();
  await expect(page.getByText('Payment saved. Receipt 2026-27/0003.')).toBeVisible();
  await expect(tile(page, 'Dues')).toContainText('Fully paid');
  await expect(page.getByRole('button', { name: 'Collect payment' })).toHaveCount(0);
  await expect(paymentRow(page, '2026-27/0003')).toContainText('₹1,000');

  // Money -> Dues: Bharat is gone; only Chetan's Rs 2,000 is left.
  await open(page, 'Money');
  await page.getByRole('button', { name: 'Dues' }).tap();
  await expect(duesRow(page, MEMBERS.part.name)).toHaveCount(0);
  await expect(tile(page, 'Total due')).toContainText('₹2,000');
  await expect(tile(page, 'Total due')).toContainText('1 member');
  // Rs 4,000 has come in today: Rs 2,000 + Rs 1,000 + the Rs 1,000 just collected.
  await open(page, 'Today');
  await expect(tile(page, "Today's collection")).toContainText('₹4,000');
  await expect(tile(page, 'Fees due')).toContainText('₹2,000');
  // One person owes now: "1 member", not "1 members" (U-A8).
  await expect(tile(page, 'Fees due')).toHaveText(/Fees due1 member$/);
  await open(page, 'Money');
  await page.getByRole('button', { name: 'Dues' }).tap();

  // Chetan owes Rs 2,000. Rs 2,500 is refused, and nothing is saved (U-A5).
  await duesRow(page, MEMBERS.none.name).getByRole('button', { name: 'Collect' }).tap();
  await s.getByLabel('Amount received').fill('2500');
  await s.getByRole('button', { name: 'Save payment' }).tap();
  await expect(s.getByRole('alert')).toHaveText('That is more than the ₹2,000 due on this membership.');
  await s.getByRole('button', { name: 'Cancel' }).tap();
  await expect(s).toBeHidden();
  await expect(duesRow(page, MEMBERS.none.name)).toContainText('₹2,000');
  await openMember(page, MEMBERS.none.name);
  await expect(tile(page, 'Dues')).toContainText('₹2,000');
  await expect(page.getByRole('main')).toContainText('No payments yet');
});

test('J4 cancel a receipt with a reason: the due comes back, CANCELLED, number never reused', async ({ page }) => {
  await gymWithMonthlyPlan(page);
  await threeSales(page);

  await openMember(page, MEMBERS.part.name);
  await expect(tile(page, 'Dues')).toContainText('₹1,000');
  await paymentRow(page, '2026-27/0002').getByRole('button', { name: 'Cancel receipt' }).tap();
  const s = sheet(page, 'Cancel this receipt?');
  await expect(s).toBeVisible();
  await expectFitsPhone(page, 'in Cancel this receipt?');
  await expect(s).toContainText('Receipt 2026-27/0002 for ₹1,000');
  await expect(s).toContainText('The amount is added back to this member’s dues.');
  // No reason, no cancel.
  await expect(s.getByRole('button', { name: 'Cancel receipt' })).toBeDisabled();
  await s.getByLabel('Reason').fill('Entered twice');
  await s.getByRole('button', { name: 'Cancel receipt' }).tap();
  await expect(page.getByText('Receipt cancelled. The amount is back in their dues.')).toBeVisible();

  // The due is back to the full Rs 2,000, and the receipt says why it does not count.
  await expect(tile(page, 'Dues')).toContainText('₹2,000');
  await expect(paymentRow(page, '2026-27/0002')).toContainText('Cancelled: Entered twice');
  await expect(paymentRow(page, '2026-27/0002').getByRole('button', { name: 'Cancel receipt' })).toHaveCount(0);

  // The printable receipt says CANCELLED.
  await page.getByRole('link', { name: /2026-27\/0002/ }).tap();
  await expect(page.getByRole('heading', { name: 'Receipt 2026-27/0002' })).toBeVisible();
  await expect(page.getByText('CANCELLED — THIS RECEIPT DOES NOT COUNT')).toBeVisible();
  await page.goBack();

  // Money: the cancelled receipt is not counted. Rs 2,000 came in today, not Rs 3,000.
  await open(page, 'Today');
  await expect(tile(page, "Today's collection")).toContainText('₹2,000');
  await expect(tile(page, 'Fees due')).toContainText('₹4,000');
  await tile(page, "Today's collection").tap();
  await expect(tile(page, 'Cancelled')).toContainText('₹1,000');
  await expect(tile(page, 'Cancelled')).toContainText('1 not counted');

  // The next receipt takes the next number, 0003. 0002 is never given again.
  await openMember(page, MEMBERS.part.name);
  await page.getByRole('button', { name: 'Collect payment' }).tap();
  await sheet(page, 'Collect payment').getByRole('button', { name: 'Save payment' }).tap();
  await expect(page.getByText('Payment saved. Receipt 2026-27/0003.')).toBeVisible();
  await expect(paymentRow(page, '2026-27/0003')).toContainText('₹2,000');
  await expect(page.getByRole('link', { name: /2026-27\/0002/ })).toHaveCount(1);
  await expect(tile(page, 'Dues')).toContainText('Fully paid');
});

test('J5 renew early (queued), freeze 7 days, cancel the plan and undo the cancel', async ({ page }) => {
  await gymWithMonthlyPlan(page);
  await addMember(page, MEMBERS.full);
  expect(await sell(page, { received: '2000' })).toBe('Membership saved. Receipt 2026-27/0001.');

  // Renew today, a month early: the new term starts the day after the current one ends.
  await page.getByRole('button', { name: 'Renew', exact: true }).tap();
  const s = sheet(page, 'Renew membership');
  await expect(s).toBeVisible();
  await expectFitsPhone(page, 'in Renew membership');
  await expect(s).toContainText('valid till 16 Nov 2026');
  await expect(s.getByLabel('Starts on')).toHaveValue('2026-11-17');
  await expect(s).toContainText('16 Dec 2026');
  // The joining fee was paid once already: not charged again. Rs 1,500 only.
  await expect(s).toContainText('Already paid a joining fee before, so it is not charged again.');
  await expect(s).toContainText('Total to pay₹1,500');
  await s.getByLabel('Received now').fill('1500');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(page.getByText('Membership saved. Receipt 2026-27/0002.')).toBeVisible();

  const main = page.getByRole('main');
  await expect(main).toContainText('renewed till 16 Dec 2026');
  const renewal = membershipRow(page, '17 Nov 2026 → 16 Dec 2026');
  await expect(renewal).toContainText('Upcoming');
  await expect(membershipRow(page, '17 Oct 2026 → 16 Nov 2026')).toContainText('Active');

  // Freeze 7 days: the plan that ends last moves its end 7 days later.
  await renewal.getByRole('button', { name: 'Freeze / extra days' }).tap();
  const f = sheet(page, 'Freeze / extra days');
  await expect(f).toBeVisible();
  await expectFitsPhone(page, 'in Freeze / extra days');
  await expect(f).toContainText('last day: 16 Dec 2026');
  await expect(f.getByRole('status')).toContainText('New last day: 23 Dec 2026');
  await f.getByRole('button', { name: 'Add 7 days' }).tap();
  await expect(page.getByText('Plan moved 7 days later.')).toBeVisible();
  const frozen = membershipRow(page, '17 Nov 2026 → 23 Dec 2026');
  await expect(frozen).toContainText('+7 days (Freeze - medical): 16 Dec 2026 → 23 Dec 2026');
  await expect(main).toContainText('renewed till 23 Dec 2026');

  // Cancel the renewal, with a reason.
  await frozen.getByRole('button', { name: 'Cancel', exact: true }).tap();
  const c = sheet(page, 'Cancel this membership?');
  await expect(c).toBeVisible();
  await expectFitsPhone(page, 'in Cancel this membership?');
  await expect(c.getByRole('button', { name: 'Cancel membership' })).toBeDisabled();
  await c.getByLabel('Reason').fill('Moved city');
  await c.getByRole('button', { name: 'Cancel membership' }).tap();
  await expect(page.getByText('Membership cancelled.')).toBeVisible();
  await expect(frozen).toContainText('Cancelled');
  await expect(frozen).toContainText('Cancelled: Moved city');
  await expect(main).not.toContainText('renewed till');

  // Undo the cancel: the renewal counts again, with its frozen end date.
  await frozen.getByRole('button', { name: 'Undo cancel' }).tap();
  await expect(page.getByText('Cancel undone.').first()).toBeVisible();
  await expect(frozen).toContainText('Upcoming');
  await expect(main).toContainText('renewed till 23 Dec 2026');
});
