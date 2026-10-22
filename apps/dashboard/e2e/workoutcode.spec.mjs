// Messages & offers step 1, item 6 (22 Oct 2026; OWNER-INBOX #49): the workout offer's claim code.
// The member shows "Show my workouts to the desk" in the app; the desk types the code on the
// member's page and sees which workout days match a check-in. The owner gives the reward from there
// (Freeze / extra days, opened on Gift with 3 days). On a 360px phone.
import { expect, test } from '@playwright/test';

import { addMember, expectFitsPhone, gymWithMonthlyPlan, open, openMember, sell, sheet } from './support.mjs';

test.use({ viewport: { width: 360, height: 780 } });

// Made by the member app's own code maker (apps/mobile/src/shop/claimCode.ts) on 17 Oct 2026 (this
// journey's clock) for workouts on 17 and 15 Oct.
const CODE = '3G000-02K54';

test('J36 workout code: the desk checks the days against check-ins; the owner gives the days', async ({ page }) => {
  await gymWithMonthlyPlan(page);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await sell(page, { received: '2000' });

  // She checks in today (17 Oct) at the desk; on 15 Oct she did not come.
  await open(page, 'Visits');
  await page.getByRole('searchbox', { name: 'Type a name or the last 4 digits of a mobile' }).or(page.getByLabel('Type a name or the last 4 digits of a mobile')).fill('Asha');
  await page.getByRole('main').getByRole('button', { name: 'Check in', exact: true }).tap();
  await expect(page.getByText('Asha Verma checked in.')).toBeVisible();

  await openMember(page, 'Asha Verma');
  await page.getByRole('button', { name: 'Check workout code' }).tap();
  const s = sheet(page, 'Check workout code');
  await expect(s).toBeVisible();
  await expectFitsPhone(page, 'in Check workout code');

  // A typing slip gets plain words.
  await s.getByLabel('Workout code').fill('3G000-02K55');
  await s.getByRole('button', { name: 'Check' }).tap();
  await expect(s).toContainText('That code has a typing mistake.');

  // The real code: 2 workouts, 1 matches a desk check-in.
  await s.getByLabel('Workout code').fill(CODE.toLowerCase());
  await s.getByRole('button', { name: 'Check' }).tap();
  await expect(s.getByRole('status')).toHaveText('1 of 2 workouts match a check-in (1 at the desk).');
  await expect(s).toContainText('Code made on 17 Oct 2026.');
  await expect(s).toContainText('✓ Checked in at the desk');
  await expect(s).toContainText('No check-in: does not count');
  await expectFitsPhone(page, 'with the days listed');

  // The owner gives the reward: Freeze / extra days opens on Gift, 3 days.
  await s.getByRole('button', { name: 'Give extra days' }).tap();
  const f = sheet(page, 'Freeze / extra days');
  await expect(f).toBeVisible();
  await expect(f.getByRole('button', { name: 'Add 3 days' })).toBeVisible();
  await f.getByRole('button', { name: 'Add 3 days' }).tap();
  await expect(page.getByText('Plan moved 3 days later.')).toBeVisible();
  await expect(page.getByRole('main')).toContainText('(Gift - extra days)');
});
