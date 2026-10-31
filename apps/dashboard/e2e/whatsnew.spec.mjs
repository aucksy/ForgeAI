// R-148 (28 Oct 2026): "What's new" in the admin app. R-245 (31 Oct 2026): not on Today any more ("I do
// not want what's new ... right on the landing page"); it is the first part of the bell, and More /
// the sidebar -> What's new keeps every update.
import { expect, test } from '@playwright/test';

import { expectFitsPhone, freshGym, open } from './support.mjs';

const CARD = "What's new in the admin app";

test('J148 What is new: never a card on Today, every update on the What is new page', async ({ page }) => {
  await freshGym(page);
  await page.evaluate(() => localStorage.setItem('forgeai.adminNews.seen.v1', '2026-10-01'));
  await page.reload();
  await open(page, 'Today');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  // R-245: an update brings the bell's number, not a card on Today.
  await expect(page.getByRole('button', { name: 'Notifications, 3 new' })).toBeVisible();
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

// R-239 (31 Oct 2026): the bell, top right: a count of new updates. R-245: its first part is a short
// summary of the newest update, tinted and tagged New, with "See what's new" to the full page.
test('J149 Notifications bell: counts new updates, opens with a short What is new summary, marks them seen', async ({ page }) => {
  await freshGym(page);
  await open(page, 'Today');
  // A first visit: nothing new.
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  await page.evaluate(() => localStorage.setItem('forgeai.adminNews.seen.v1', '2026-10-01'));
  await page.reload();
  const bell = page.getByRole('button', { name: 'Notifications, 3 new' });
  await expect(bell).toBeVisible();
  await bell.tap();
  const list = page.getByRole('dialog', { name: 'Notifications' });
  await expect(list).toContainText('Version 31 Oct 2026');
  const news = list.getByRole('region', { name: CARD });
  await expect(news).toContainText('Update of 31 Oct 2026');
  await expect(news).toContainText('full amounts, like');
  await expect(news).toContainText('2 more changes');
  await expect(news).toContainText('3 updates since you last looked');
  await expect(news.getByText('New', { exact: true })).toBeVisible();
  await expectFitsPhone(page, 'with the notifications list open');
  await news.getByRole('button', { name: "See what's new ›" }).tap();
  await expect(page).toHaveURL(/#\/news$/);
  await expect(page.getByRole('heading', { name: "What's new", level: 1 })).toBeVisible();
  // Opening it marked them seen.
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: 'Notifications' }).getByText('New', { exact: true })).toHaveCount(0);
});

// R-243 (31 Oct 2026): messages from MettleUp HQ are in the bell and count in its number.
test('J150 HQ messages: a new one counts in the bell, shows under From MettleUp with its button, then is seen', async ({ page }) => {
  let messages = [{ id: 1, at: '2026-10-16T05:00:00Z', title: 'Welcome to MettleUp', body: 'Older message.', link: '', label: '' }];
  await page.route('**/api/hq-news', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages }) }));
  await freshGym(page);
  await open(page, 'Today');
  // R-245: a desk that never opened the bell counts the last 14 days (the owner's first message had no number).
  const first = page.getByRole('button', { name: 'Notifications, 1 new' });
  await expect(first).toBeVisible();
  await first.tap();
  // Open, it counts nothing; a second tap closes it.
  await page.getByRole('button', { name: 'Notifications', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toHaveCount(0);

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
