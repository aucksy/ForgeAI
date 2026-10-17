// UAT WP5b journey 26 (INVENTORY F-03, F-17, F-06; MONEY-ACCESS F-02): more of the front desk, on
// her own phone against the pretend server. She can archive a member; a typed link to Expenses
// still says owner only; in Collect, a date more than 31 days back and a date in the future are
// refused before anything is sent, and 31 days back is fine. On Staff & sign-in she sees only
// herself (F-31), and she signs out of her own phone (F-15).
import { expect, test } from '@playwright/test';

import {
  DESK,
  addDeskPerson,
  addMember,
  addPlan,
  expectFitsPhone,
  open,
  openApp,
  secondPhone,
  sell,
  sheet,
  signIn,
  startOnlineGym,
} from './support.mjs';

test('J26 front desk: archives a member; cannot open Expenses by link; Collect refuses 40 days back and the future; no people or codes; signs herself out', async ({ page, browser }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
  await addMember(page, { name: 'Bharat Singh', phone: '98290 22222' });
  expect(await sell(page, { received: '1000' })).toBe('Membership saved. Receipt 2026-27/0001.');
  await addDeskPerson(page);

  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);

  // She adds a walk-in by mistake and archives them.
  await addMember(desk, { name: 'Walk In', phone: '98290 99001' });
  await desk.getByRole('button', { name: 'Archive member' }).tap();
  await expect(desk.getByText('Member archived.')).toBeVisible();
  await expect(desk.getByRole('button', { name: 'Restore member' })).toBeVisible();
  await open(desk, 'Members');
  await expect(desk.getByRole('main').getByRole('link', { name: /Walk In/ })).toHaveCount(0);
  await expect(desk.getByText('1 member', { exact: true })).toBeVisible();
  // It went to the server as archived, not deleted.
  expect(server.rows('member').find((m) => m.fullName === 'Walk In')?.archived).toBe(true);

  // Expenses by a typed link: owner only, and no money on the page.
  await desk.goto('./#/expenses');
  await expect(desk.getByText('Only an owner can see this')).toBeVisible();
  await expect(desk.getByRole('main')).not.toContainText('₹');

  // Collect Bharat's Rs 1,000 from Dues.
  await open(desk, 'Money');
  const row = desk.getByRole('main').locator('div').filter({ has: desk.getByRole('link', { name: 'Bharat Singh' }) }).filter({ has: desk.getByRole('button', { name: 'Collect' }) }).last();
  await row.getByRole('button', { name: 'Collect' }).tap();
  const c = sheet(desk, 'Collect payment');
  await expect(c).toContainText('Today, or up to 31 days back.');
  await expectFitsPhone(desk, 'in the desk Collect sheet');
  const pushesBefore = server.pushes.length;

  // 40 days back (7 Sep): refused, in plain words.
  await c.getByLabel('Received on').fill('2026-09-07');
  await c.getByRole('button', { name: 'Save payment' }).tap();
  await expect(c.getByRole('alert')).toHaveText('The front desk can date a payment at most 31 days back. Ask the owner to enter older payments.');
  // Tomorrow: refused (F-02).
  await c.getByLabel('Received on').fill('2026-10-18');
  await c.getByRole('button', { name: 'Save payment' }).tap();
  await expect(c.getByRole('alert')).toHaveText('The payment date can’t be in the future.');
  expect(server.pushes.length).toBe(pushesBefore);

  // 31 days back (16 Sep) is allowed.
  await c.getByLabel('Received on').fill('2026-09-16');
  await c.getByRole('button', { name: 'Save payment' }).tap();
  await expect(c).toBeHidden();
  await expect(desk.getByText('Payment saved.', { exact: true })).toBeVisible();
  const paid = server.rows('payment').find((p) => p.paidOn === '2026-09-16');
  expect(paid?.amountP).toBe(100000);
  expect(paid?.collectedByName).toBe(DESK.name);

  // Staff & sign-in: she sees only herself; adding people and making codes is the owner's (F-31).
  await open(desk, 'Settings');
  await desk.getByRole('button', { name: 'Your sign-in, or sign out' }).tap();
  await expect(desk.getByRole('heading', { name: 'Staff & sign-in', exact: true })).toBeVisible();
  await expect(desk.getByRole('main')).toContainText('Only an owner can add people or make sign-in codes. Ask your gym owner.');
  await expect(desk.getByRole('button', { name: 'Add a person' })).toHaveCount(0);
  await expect(desk.getByRole('button', { name: 'Make sign-in code' })).toHaveCount(0);
  await expect(desk.getByRole('main')).not.toContainText('Ramesh Sharma');

  // She signs out of her own phone (F-15): back at the sign-in door, and her key is gone.
  await desk.getByRole('button', { name: 'Sign out of this device' }).tap();
  await sheet(desk, 'Sign out of this device?').getByRole('button', { name: 'Sign out' }).tap();
  await expect(desk.getByText('You are signed out of this device.')).toBeVisible();
  await expect(desk.getByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(server.devices(server.people.get('9829054321').staffId)).toBe(0);
  await desk.context().close();
});
