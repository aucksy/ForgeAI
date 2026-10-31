// R-148 (28 Oct 2026): "What's new" in the admin app: the card on Today once after an update, and
// More / Settings -> What's new keeps every update.
import { expect, test } from '@playwright/test';

import { expectFitsPhone, freshGym, open } from './support.mjs';

const CARD = "What's new in the admin app";

test('J148 What is new: not on a first visit, once after an update, its button opens the page, the list stays in Settings', async ({ page }) => {
  await freshGym(page);
  await open(page, 'Today');
  // A browser meeting its first update only remembers it.
  await expect(page.getByRole('region', { name: CARD })).toHaveCount(0);

  // The same browser after an update: it last saw an older one.
  await page.evaluate(() => localStorage.setItem('forgeai.adminNews.seen.v1', '2026-10-01'));
  await page.reload();
  const card = page.getByRole('region', { name: CARD });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Update of 31 Oct 2026');
  await expect(card).toContainText('full amounts, like');
  await expectFitsPhone(page, 'with the What is new card');
  await card.getByRole('button', { name: 'Open Money ›' }).tap();
  await expect(page).toHaveURL(/#\/money$/);

  // Seen: gone from Today, even after a reload.
  await open(page, 'Today');
  await expect(page.getByRole('region', { name: CARD })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: CARD })).toHaveCount(0);

  // Every update, newest first, from More.
  await open(page, "What's new");
  await expect(page.getByRole('heading', { name: "What's new", level: 1 })).toBeVisible();
  await expect(page.getByText('28 Oct 2026', { exact: true })).toBeVisible();
  await expect(page.getByText('24 Oct 2026', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Gym timings ›' }).tap();
  await expect(page).toHaveURL(/#\/settings\/timings$/);

  // R-239: not under Settings any more.
  await open(page, 'Settings');
  await expect(page.getByRole('button', { name: 'See all updates ›' })).toHaveCount(0);
});

// R-239 (31 Oct 2026): the bell, top right: a count of new updates, the list and the version.
test('J149 Notifications bell: counts new updates, lists them with the version, opening it marks them seen', async ({ page }) => {
  await freshGym(page);
  await open(page, 'Today');
  // A first visit: nothing new.
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  await page.evaluate(() => localStorage.setItem('forgeai.adminNews.seen.v1', '2026-10-01'));
  await page.reload();
  const bell = page.getByRole('button', { name: 'Notifications, 3 new' });
  await expect(bell).toBeVisible();
  await expect(page.getByRole('region', { name: CARD })).toBeVisible();
  await bell.tap();
  const list = page.getByRole('dialog', { name: 'Notifications' });
  await expect(list).toContainText('Version 31 Oct 2026');
  await expect(list).toContainText('Update of 31 Oct 2026');
  await expect(list.getByText('New', { exact: true }).first()).toBeVisible();
  await expectFitsPhone(page, 'with the notifications list open');
  // Opening it marks them seen: the count and the Today card go.
  await expect(page.getByRole('region', { name: CARD })).toHaveCount(0);
  await list.getByRole('button', { name: 'See all updates ›' }).tap();
  await expect(page).toHaveURL(/#\/news$/);
  await expect(page.getByRole('heading', { name: "What's new", level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
});

// R-243 (31 Oct 2026): messages from MettleUp HQ come first in the bell and count in its number.
test('J150 HQ messages: a new one counts in the bell, shows under From MettleUp with its button, then is seen', async ({ page }) => {
  let messages = [{ id: 1, at: '2026-10-30T05:00:00Z', title: 'Welcome to MettleUp', body: 'Older message.', link: '', label: '' }];
  await page.route('**/api/hq-news', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages }) }));
  await freshGym(page);
  await open(page, 'Today');
  // A first look only remembers what is there.
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  messages = [
    { id: 2, at: '2026-10-31T05:00:00Z', title: 'New: gym timings', body: 'Set your opening hours. ' + String.fromCharCode(10) + 'Members see them in the app.', link: '/settings/timings', label: 'Open Gym timings' },
    ...messages,
  ];
  await page.reload();
  const bell = page.getByRole('button', { name: 'Notifications, 1 new' });
  await expect(bell).toBeVisible();
  await bell.tap();
  const hq = page.getByRole('dialog', { name: 'Notifications' }).getByRole('region', { name: 'From MettleUp' });
  await expect(hq).toContainText('New: gym timings');
  await expect(hq).toContainText('31 Oct 2026');
  await expect(hq).toContainText('Welcome to MettleUp');
  await expect(hq.getByText('New', { exact: true })).toHaveCount(1);
  await expectFitsPhone(page, 'with an HQ message in the bell');
  await hq.getByRole('button', { name: 'Open Gym timings ›' }).tap();
  await expect(page).toHaveURL(/#\/settings\/timings$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
});
