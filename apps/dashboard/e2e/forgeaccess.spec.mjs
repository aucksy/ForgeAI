// #51 MettleUp HQ, the gym owner's side: Settings → Your data → MettleUp access (migration 0028), and
// a gym MettleUp paused (0027: looking works, saving says why it cannot). Pretend server: support.mjs.
import { expect, test } from '@playwright/test';

import { expectFitsPhone, open, openApp, sheet, startOnlineGym } from './support.mjs';

const PAUSED = 'MettleUp has paused this gym, so nothing can be changed or saved.';

test('J51a the owner lets MettleUp support look for an hour, sees it listed, and closes it early', async ({ page }) => {
  await openApp(page);
  await startOnlineGym(page);
  await open(page, 'Settings');
  await expect(page.getByRole('heading', { name: 'MettleUp access' })).toBeVisible();
  await expect(page.getByText('never a member’s name or number', { exact: false })).toBeVisible();
  const card = page.getByRole('main');
  await expect(card.getByText('MettleUp has never opened your records.')).toBeVisible();

  await card.getByRole('button', { name: 'Let MettleUp support look (1 hour)' }).tap();
  const ask = sheet(page, 'Let MettleUp support look?');
  await expect(ask).toContainText('They cannot change anything.');
  await expectFitsPhone(page, 'in the support access sheet');
  await ask.getByRole('button', { name: 'Yes, for 1 hour' }).tap();
  await expect(ask).toBeHidden();
  await expect(card.getByText('Support access is open until 11:00 (you opened it). Nothing looked at yet.', { exact: false })).toBeVisible();

  await card.getByRole('button', { name: 'Close it now' }).tap();
  await expect(card.getByText('Support access was open 17 Oct, 10:00-10:00 (you opened it). Nothing was looked at.')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Let MettleUp support look (1 hour)' })).toBeVisible();
  await expectFitsPhone(page, 'on Settings with the MettleUp access list');
});

test('J51b a gym MettleUp paused: records still open, a save says why it cannot', async ({ page }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  server.hqStatus = 'suspended';
  server.hqActions = [{ at: new Date('2026-10-17T09:00:00+05:30').toISOString(), action: 'suspend_gym', reason: 'Unpaid for 3 months' }];

  await open(page, 'Settings');
  await expect(page.getByText(PAUSED).first()).toBeVisible();
  await expect(page.getByText('17 Oct, 09:00: MettleUp paused your gym. Reason: Unpaid for 3 months')).toBeVisible();

  await open(page, 'Members');
  await page.getByRole('button', { name: '+ Add member' }).first().tap();
  const s = sheet(page, 'Add member');
  await s.getByLabel('Full name').fill('Kiran Das');
  await s.getByLabel('Mobile number').fill('98290 60001');
  await s.getByRole('button', { name: 'Add member' }).tap();
  await expect(page.getByText(PAUSED).first()).toBeVisible();
  // Nothing of the gym's was saved (the device's receipt-series claim, made while the gym was on, is not a member).
  expect([...server.records.keys()].filter((k) => !k.startsWith('enquiry:deskseries-'))).toEqual([]);
});
