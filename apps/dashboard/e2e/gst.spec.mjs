// UAT WP5b journey 16 (INVENTORY O-37): GST on receipts. A gym starts without GST, sells, then
// registers (a GSTIN with a wrong check letter is refused first). The old receipt keeps "no GST";
// a new one shows the CGST/SGST split at 5%; a receipt dated before 22 Sep 2025 shows 18%.
import { expect, test } from '@playwright/test';

import { addMember, addPlan, expectFitsPhone, freshGym, open, openMember, sheet } from './support.mjs';

/** A real-shaped Rajasthan GSTIN whose 15th letter is its check letter (mod-36). */
const GSTIN = '08AABCU9603R1ZN';
/** The same GSTIN with the check letter wrong (one character off). */
const GSTIN_WRONG = '08AABCU9603R1ZM';

/** Sell the plan for Rs 1,500 received, starting and paid on `day`. Returns the toast's receipt number. */
async function sellPaidOn(page, day) {
  await page.getByRole('button', { name: 'Sell membership' }).first().tap();
  const s = sheet(page, 'Sell membership');
  if (day) await s.getByLabel('Starts on').fill(day);
  await s.getByLabel('Received now').fill('1500');
  if (day) await s.getByLabel('Received on').fill(day);
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(s).toBeHidden();
  const t = page.getByText(/^Membership saved\. Receipt /);
  await expect(t).toBeVisible();
  return /Receipt (\S+)\./.exec((await t.textContent()) ?? '')?.[1] ?? '';
}

async function openReceipt(page, member, receiptNo) {
  await openMember(page, member);
  await page.getByRole('link', { name: new RegExp(receiptNo.replace('/', '\\/')) }).tap();
  await expect(page.getByRole('heading', { name: `Receipt ${receiptNo}`, exact: true })).toBeVisible();
  await expectFitsPhone(page, `on receipt ${receiptNo}`);
  return page.getByRole('main');
}

test('J16 GST: set a GSTIN later; old receipts keep no GST; new ones split CGST/SGST at 5%, 18% before 22 Sep 2025', async ({ page }) => {
  await freshGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '0', months: '1' });

  // Before GST: Asha pays Rs 1,500.
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  expect(await sellPaidOn(page)).toBe('2026-27/0001');

  // A GSTIN with the wrong check letter is refused on its field, and nothing is saved.
  await open(page, 'Settings');
  const gstField = page.getByLabel('GSTIN (optional)');
  await gstField.fill(GSTIN_WRONG);
  await page.getByRole('button', { name: 'Save details' }).tap();
  await expect(page.getByRole('main')).toContainText(
    'This GSTIN looks wrong. It has 15 letters and numbers. Check your GST certificate, or leave it empty.',
  );
  await expect(page.getByText('Saved.', { exact: true })).toHaveCount(0);
  await page.reload();
  await open(page, 'Settings');
  await expect(gstField).toHaveValue('');

  // The right one, typed in small letters, is saved (in capitals).
  await gstField.fill(GSTIN.toLowerCase());
  await page.getByRole('button', { name: 'Save details' }).tap();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  await page.reload();
  await open(page, 'Settings');
  await expect(gstField).toHaveValue(GSTIN);

  // Asha's receipt was issued without GST, and stays that way.
  let main = await openReceipt(page, 'Asha Verma', '2026-27/0001');
  await expect(main).toContainText('₹1,500');
  await expect(main).not.toContainText('GSTIN');
  await expect(main).not.toContainText('Tax included');
  await expect(main).not.toContainText('CGST');

  // A new receipt: GSTIN on top; Rs 1,500 includes 5% GST, split half and half.
  await addMember(page, { name: 'Bharat Singh', phone: '98290 22222' });
  expect(await sellPaidOn(page)).toBe('2026-27/0002');
  main = await openReceipt(page, 'Bharat Singh', '2026-27/0002');
  for (const text of [
    `GSTIN: ${GSTIN}`,
    'Tax included in the above · SAC 999723',
    'Taxable value₹1,428.57',
    'CGST @ 2.5%₹35.71',
    'SGST @ 2.5%₹35.72',
    'Amount received includes GST at 5%.',
  ]) {
    await expect(main).toContainText(text);
  }

  // Money received on 21 Sep 2025, before the rate fell: 18%, split 9% + 9%. (The owner may date a
  // sale back; it is numbered in that year's series.)
  await addMember(page, { name: 'Chetan Rao', phone: '98290 33333' });
  expect(await sellPaidOn(page, '2025-09-21')).toBe('2025-26/0001');
  main = await openReceipt(page, 'Chetan Rao', '2025-26/0001');
  for (const text of ['Taxable value₹1,271.19', 'CGST @ 9%₹114.40', 'SGST @ 9%₹114.41', 'Amount received includes GST at 18%.']) {
    await expect(main).toContainText(text);
  }

  // From 22 Sep 2025 itself, 5%.
  await addMember(page, { name: 'Deepa Nair', phone: '98290 44444' });
  expect(await sellPaidOn(page, '2025-09-22')).toBe('2025-26/0002');
  main = await openReceipt(page, 'Deepa Nair', '2025-26/0002');
  await expect(main).toContainText('CGST @ 2.5%₹35.71');
  await expect(main).toContainText('Amount received includes GST at 5%.');
});
