// UAT WP5 journey 11: the front desk. Staff exists only for an online gym, so this journey runs
// against the pretend server (support.mjs): the owner starts the gym online, sets it up, adds a
// staff person and makes their sign-in code, then signs out; the staff person signs in with their
// mobile and code on the same phone, the way the app does it.
import { expect, test } from '@playwright/test';

import { SIGN_IN_CODE, addMember, addPlan, expectFitsPhone, open, openApp, openMember, sell, sheet, tile } from './support.mjs';

test('J11 front desk: what staff cannot see or do', async ({ page }) => {
  const server = await openApp(page);

  // The owner starts the gym online.
  const start = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create my gym' }) });
  await start.getByLabel('Gym name').fill('Shakti Gym');
  await start.getByLabel('Your name').fill('Ramesh Sharma');
  await start.getByLabel('Your mobile number').fill('98290 12345');
  await start.getByRole('checkbox', { name: /I agree to the MettleUp terms and the data agreement/ }).check();
  await start.getByRole('button', { name: 'Create my gym' }).tap();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('banner')).toContainText('Shakti Gym');

  // Owner sets up: a plan, a member who paid, an expense.
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
  await addMember(page, { name: 'Kiran Das', phone: '98290 60001' });
  expect(await sell(page, { received: '2000' })).toBe('Membership saved. Receipt 2026-27/0001.');
  await open(page, 'Expenses');
  await page.getByRole('button', { name: '+ Add expense' }).first().tap();
  const ex = sheet(page, 'Add expense');
  await ex.getByLabel('Amount').fill('5000');
  await ex.getByRole('button', { name: 'Save expense' }).tap();
  await expect(page.getByText('Expense added.')).toBeVisible();
  expect(server.records.size).toBeGreaterThan(3);

  // Owner adds the front-desk person and makes their code.
  await open(page, 'Staff & sign-in');
  await page.getByRole('button', { name: 'Add a person' }).tap();
  const add = sheet(page, 'Add a person');
  await add.getByLabel('Name').fill('Sunita Verma');
  await add.getByLabel('Mobile number').fill('98290 54321');
  await expect(add.getByLabel('What can they do?')).toHaveValue('staff');
  await add.getByRole('button', { name: 'Add', exact: true }).tap();
  const sunita = page.getByRole('main').locator('div').filter({ hasText: 'Sunita Verma' }).filter({ has: page.getByRole('button', { name: 'Make sign-in code' }) }).last();
  await sunita.getByRole('button', { name: 'Make sign-in code' }).tap();
  await expect(sheet(page, 'Sign-in code for Sunita Verma')).toBeVisible();
  await expectFitsPhone(page, 'in the sign-in code sheet');
  await expect(page.getByLabel(`Code ${SIGN_IN_CODE.split('').join(' ')}`)).toBeVisible();
  await sheet(page, 'Sign-in code for Sunita Verma').getByRole('button', { name: /Close|Done/ }).first().tap();

  // Owner signs out of this phone.
  await page.getByRole('button', { name: 'Sign out of this device' }).tap();
  await sheet(page, 'Sign out of this device?').getByRole('button', { name: 'Sign out' }).tap();
  await expect(page.getByText('You are signed out of this device.')).toBeVisible();

  // Sunita signs in with her mobile and the code.
  const signIn = page.locator('form').filter({ has: page.getByRole('button', { name: 'Sign in' }) });
  await signIn.getByLabel('Your mobile number').fill('98290 54321');
  await signIn.getByLabel('Sign-in code (6 digits)').fill(SIGN_IN_CODE);
  await signIn.getByRole('button', { name: 'Sign in' }).tap();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });

  // Today: counts of people, never money totals.
  await expect(tile(page, 'Active members')).toContainText('1');
  await expect(page.getByText("Today's collection", { exact: true })).toHaveCount(0);
  await expect(page.getByText('Fees due', { exact: true })).toHaveCount(0);

  // Money: only who owes (no Collections, no totals).
  await open(page, 'Money');
  await expect(page.getByRole('main')).toContainText('Who still has fees to pay');
  await expect(page.getByRole('button', { name: 'Collections' })).toHaveCount(0);
  await expect(page.getByText('Total due', { exact: true })).toHaveCount(0);
  // The Today's-collection link, typed in: still only Dues.
  await page.goto('./#/money/today');
  await expect(page.getByRole('main')).toContainText('Who still has fees to pay');
  await expect(page.getByText('Collected', { exact: true })).toHaveCount(0);
  await page.goto('./#/settings/branding');
  await expect(page.getByText('Only an owner can see this')).toBeVisible();

  // No Expenses anywhere; a typed link to it says owner only.
  await open(page, 'More');
  await expect(page.getByRole('main').getByRole('link', { name: /^Expenses/ })).toHaveCount(0);
  await page.goto('./#/expenses');
  await expect(page.getByText('Only an owner can see this')).toBeVisible();
  await expect(page.getByText('₹5,000')).toHaveCount(0);

  // Plans: read-only.
  await open(page, 'Plans');
  await expect(page.getByRole('main').getByText('Monthly', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add plan' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Monthly' })).toHaveCount(0);

  // A paid member: no Cancel receipt, no Cancel plan, no Freeze.
  await openMember(page, 'Kiran Das');
  await expect(page.getByRole('link', { name: /2026-27\/0001/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel receipt' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Freeze / extra days' })).toHaveCount(0);

  // Settings: no Load demo / Erase.
  await open(page, 'Settings');
  await expect(page.getByRole('button', { name: 'Load demo gym' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Erase and start fresh' })).toHaveCount(0);

  // Selling: more than 10% off is refused; 10% is allowed.
  await addMember(page, { name: 'Lata Rao', phone: '98290 60002' });
  await page.getByRole('button', { name: 'Sell membership' }).first().tap();
  const s = sheet(page, 'Sell membership');
  await expect(s).toContainText('The front desk can give at most 10% off.');
  await s.getByLabel('Plan price').fill('1300');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(s).toContainText('The front desk can give at most 10% off. The lowest price is ₹1,350. Ask the owner for a bigger discount.');
  await expect(s).toBeVisible();
  // Nor may the desk drop the joining fee.
  await s.getByLabel('Plan price').fill('1350');
  await s.getByLabel('Joining fee').fill('0');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(s).toContainText('The joining fee for a new member is ₹500. Only the owner can remove it.');
  await s.getByLabel('Joining fee').fill('');
  await expect(s).toContainText('Total to pay₹1,850');
  await s.getByLabel('Received now').fill('1850');
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(page.getByText('Membership saved. Receipt 2026-27/0002.')).toBeVisible();
  await expect(page.getByRole('main')).toContainText('₹150 discount');
  // The sale went to the server as Sunita's.
  const sold = server.pushes.flat().find((r) => r.k === 'payment' && r.d?.receiptNo === '2026-27/0002');
  expect(sold?.d?.collectedByName ?? sold?.d?.soldByName ?? null).toBe('Sunita Verma');
});
