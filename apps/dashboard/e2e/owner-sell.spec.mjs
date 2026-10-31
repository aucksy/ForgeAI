// UAT WP5b journey 24 (INVENTORY O-22): the owner sells with a discount, free, and above the list
// price. The owner may give any discount (the front desk at most 10%, J11); a price ABOVE the plan's
// is asked about once before it is saved (admin audit C7-30), and any change asks again.
import { expect, test } from '@playwright/test';

import { addMember, expectFitsPhone, gymWithMonthlyPlan, open, sheet, tile } from './support.mjs';

/** One membership row on a member's page. */
function membershipRow(page) {
  return page.getByRole('main').locator('div').filter({ hasText: '17 Oct 2026 → 16 Nov 2026' }).filter({ hasText: '₹' }).last();
}

test('J24 owner sells at a discount, free, and above the list price (asked first)', async ({ page }) => {
  await gymWithMonthlyPlan(page); // Monthly Rs 1,500 + Rs 500 joining fee

  // A discount: Rs 1,200 instead of Rs 1,500, paid in full.
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await page.getByRole('button', { name: 'Sell membership' }).first().tap();
  const s = sheet(page, 'Sell membership');
  await expect(s).toContainText('Leave blank for the plan price. Type a lower number to give a discount.');
  await s.getByLabel('Plan price').fill('1200');
  await expect(s).toContainText('Total to pay₹1,700');
  await s.getByLabel('Received now').fill('1700');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(page.getByText('Membership saved. Receipt 2026-27/0001.')).toBeVisible();
  await expect(membershipRow(page)).toContainText('₹300 discount');
  await expect(tile(page, 'Dues')).toContainText('Fully paid');

  // Free: no price, no joining fee (the owner may drop it), nothing to pay.
  await addMember(page, { name: 'Bharat Singh', phone: '98290 22222' });
  await page.getByRole('button', { name: 'Sell membership' }).first().tap();
  await s.getByLabel('Plan price').fill('0');
  await s.getByLabel('Joining fee').fill('0');
  await expect(s).toContainText('Total to pay₹0');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(page.getByText('Membership saved. No money taken yet.')).toBeVisible();
  await expect(membershipRow(page)).toContainText('₹1,500 discount');
  await expect(tile(page, 'Dues')).toContainText('Fully paid');
  await expect(page.getByRole('main')).toContainText('No payments yet');

  // Above the list price: asked first. Cancel saves nothing.
  await addMember(page, { name: 'Chetan Rao', phone: '98290 33333' });
  await page.getByRole('button', { name: 'Sell membership' }).first().tap();
  await s.getByLabel('Plan price').fill('15000');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(s.getByRole('alert')).toHaveText('The price ₹15,000 is more than the plan price, ₹1,500. Tap again to save it anyway.');
  await expect(s.getByRole('button', { name: 'Yes, save' })).toBeVisible();
  await expectFitsPhone(page, 'with the above-list-price question');
  await s.getByRole('button', { name: 'Cancel' }).tap();
  await expect(s).toBeHidden();
  await expect(page.getByRole('main')).toContainText('No membership yet.');

  // Again, mistyped then fixed: any change asks again, for the new price.
  await page.getByRole('button', { name: 'Sell membership' }).first().tap();
  await s.getByLabel('Plan price').fill('15000');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(s.getByRole('alert')).toContainText('₹15,000');
  await s.getByLabel('Plan price').fill('1800');
  await expect(s.getByRole('button', { name: 'Confirm' })).toBeVisible();
  await expect(s.getByRole('alert')).toHaveCount(0);
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(s.getByRole('alert')).toHaveText('The price ₹1,800 is more than the plan price, ₹1,500. Tap again to save it anyway.');
  await s.getByRole('button', { name: 'Yes, save' }).tap();
  await expect(page.getByText('Membership saved. No money taken yet.')).toBeVisible();
  // Rs 1,800 + Rs 500 joining fee is owed; no discount line.
  await expect(tile(page, 'Dues')).toContainText('₹2,300');
  await expect(membershipRow(page)).toContainText('₹2,300');
  await expect(membershipRow(page)).not.toContainText('discount');

  // A joining fee above the plan's is asked about too.
  await addMember(page, { name: 'Deepa Nair', phone: '98290 44444' });
  await page.getByRole('button', { name: 'Sell membership' }).first().tap();
  await s.getByLabel('Joining fee').fill('800');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(s.getByRole('alert')).toHaveText('The joining fee ₹800 is more than the plan’s joining fee, ₹500. Tap again to save it anyway.');
  await s.getByRole('button', { name: 'Yes, save' }).tap();
  await expect(page.getByText('Membership saved. No money taken yet.')).toBeVisible();
  await expect(tile(page, 'Dues')).toContainText('₹2,300');

  // Money: Rs 2,300 + Rs 2,300 still due; Asha and Bharat owe nothing.
  await open(page, 'Money');
  await page.getByRole('button', { name: 'Dues' }).tap();
  await expect(tile(page, 'Total due')).toContainText('₹4,600');
  await expect(tile(page, 'Total due')).toContainText('2 members');
  await expect(page.getByRole('main').getByRole('link', { name: 'Bharat Singh' })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: 'Asha Verma' })).toHaveCount(0);
});
