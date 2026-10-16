// UAT WP5 journey 12: the printable receipt carries the right fields, and the Welcome screen passes
// the accessibility check (axe) that the crawl never runs there (U-A2).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { addMember, addPlan, expectFitsPhone, freshGym, open, openApp, sell } from './support.mjs';

test('J12a receipt page: gym, number, date, member, plan and dates, amount in figures and words, method', async ({ page }) => {
  await freshGym(page);
  // Gym details that a receipt prints.
  await open(page, 'Settings');
  await page.getByLabel('Phone', { exact: true }).fill('98290 99999');
  await page.getByLabel('Address').fill('MI Road, Jaipur');
  await page.getByRole('button', { name: 'Save details' }).tap();
  await expect(page.getByText('Saved.')).toBeVisible();

  // A plan above a lakh: Rs 1,20,000 a year + Rs 5,000 joining.
  await addPlan(page, { name: 'Annual Premium', price: '120000', joining: '5000', months: '12' });
  await addMember(page, { name: 'Mohit Gupta', phone: '98290 70001' });
  await page.getByRole('button', { name: 'Sell membership' }).first().tap();
  const s = page.getByRole('dialog', { name: 'Sell membership' });
  await expect(s).toContainText('Total to pay₹1,25,000');
  await s.getByLabel('Received now').fill('100000');
  await s.getByLabel('Paid by').selectOption({ label: 'UPI' });
  await s.getByLabel('Reference (optional)').fill('UPI-55501');
  await expect(s).toContainText('Still due after this: ₹25,000');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(page.getByText('Membership saved. Receipt 2026-27/0001.')).toBeVisible();

  await page.getByRole('link', { name: /2026-27\/0001/ }).tap();
  await expect(page.getByRole('heading', { name: 'Receipt 2026-27/0001', exact: true })).toBeVisible();
  await expectFitsPhone(page, 'on the receipt');
  const main = page.getByRole('main');
  for (const text of [
    'Mohit Gupta · 17 Oct 2026',
    'Iron Temple Fitness',
    'MI Road, Jaipur',
    'Payment receipt',
    'Annual Premium membership',
    '17 Oct 2026 to 16 Oct 2027',
    'Includes a one-time joining fee of ₹5,000',
    '₹1,00,000',
    'One Lakh',
    'UPI',
    'UPI-55501',
  ]) {
    await expect(main).toContainText(text);
  }
  await expect(main.getByRole('button', { name: 'Print' })).toBeVisible();
  await expect(main).not.toContainText('CANCELLED');

  // Money: the receipt in full figures (lakh grouping), and the Rs 25,000 still due.
  await open(page, 'Money');
  const row = main.locator('div').filter({ has: page.getByRole('link', { name: '2026-27/0001' }) }).filter({ hasText: '₹' }).last();
  await expect(row).toContainText('₹1,00,000');
  await page.getByRole('button', { name: 'Dues' }).tap();
  await expect(main).toContainText('₹25,000');
});

test('J12b accessibility (axe) on the Welcome screen: no critical finding', async ({ page }) => {
  await openApp(page);
  const res = await new AxeBuilder({ page }).analyze();
  const critical = res.violations.filter((v) => v.impact === 'critical');
  const serious = res.violations.filter((v) => v.impact === 'serious');
  for (const v of serious) {
    console.log(`axe serious on Welcome: ${v.id} (${v.help}) x${v.nodes.length}`);
    test.info().annotations.push({ type: 'axe serious (not failing yet)', description: `${v.id}: ${v.help} (${v.nodes.length})` });
  }
  expect(critical.map((v) => `${v.id}: ${v.help} at ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});
