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

  // And from Settings.
  await open(page, 'Settings');
  await page.getByRole('button', { name: 'See all updates ›' }).tap();
  await expect(page.getByRole('heading', { name: "What's new", level: 1 })).toBeVisible();
});
