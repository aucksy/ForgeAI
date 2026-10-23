// R-85 (owner, 23 Oct 2026): "Joined in the app" members open their own page (matched by mobile), or the
// add form when they are not on the list; and the light theme's card borders are photographed.
import { expect, test } from '@playwright/test';

import { addMember, openApp, startDemo } from './support.mjs';

test('J37 a member who joined in the app opens their page; one not on the list opens Add member', async ({ page }, testInfo) => {
  const server = await openApp(page);
  server.appMembers = [
    { member_id: 'app-1', name: 'Kiran Tap', phone: '+919000000101', joined_at: '2026-10-01T10:00:00Z', last_seen: '2026-10-16T10:00:00Z', orders: 0, spent_p: 0 },
    { member_id: 'app-2', name: 'Not Listed', phone: '+919000000102', joined_at: '2026-10-02T10:00:00Z', last_seen: '2026-10-16T10:00:00Z', orders: 0, spent_p: 0 },
  ];
  await startDemo(page);
  await addMember(page, { name: 'Kiran Tap', phone: '9000000101' });

  await page.goto('./#/members/app');
  await page.getByRole('button', { name: 'Open Kiran Tap' }).tap();
  await expect(page).toHaveURL(/#\/members\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Kiran Tap', exact: true })).toBeVisible();

  await page.goto('./#/members/app');
  await expect(page.getByText('Not in your member list yet. Tap to add them.')).toBeVisible();
  await page.getByRole('button', { name: 'Not Listed is not in your member list. Add them' }).tap();
  await expect(page.getByRole('heading', { name: 'Add member', exact: true })).toBeVisible();

  // The light theme: Today and the app list, photographed for a look at the card borders.
  await page.keyboard.press('Escape');
  await page.evaluate(() => localStorage.setItem('forgeai.theme.v1', 'light'));
  await page.goto('./#/');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('today-light.png'), fullPage: false });
  await page.goto('./#/members/app');
  await page.screenshot({ path: testInfo.outputPath('app-members-light.png'), fullPage: false });
});
