// Launch I5 (21 Oct 2026): a new gym's "Get started" list on Today.
import { expect, test } from '@playwright/test';

import { addPlan, freshGym, open } from './support.mjs';

test('J32 Get started: ticks itself, takes a hand tick, hides for good', async ({ page }) => {
  await freshGym(page);
  await open(page, 'Today');
  await expect(page.getByText('0 of 7 done')).toBeVisible();
  await addPlan(page, { name: 'Monthly', price: '1500' });
  await open(page, 'Today');
  await expect(page.getByText('1 of 7 done')).toBeVisible();
  await page.getByRole('button', { name: 'Mark “Add your staff and trainers” as done' }).tap();
  await expect(page.getByText('2 of 7 done')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add your plans (done). Open' })).toBeVisible();
  await page.getByRole('button', { name: 'Bring in your members. Open' }).tap();
  // UAT 1 Nov 2026: Members (Add member and Import side by side), not the import screen alone.
  await expect(page).toHaveURL(/#\/members$/);
  await open(page, 'Today');
  await page.getByRole('button', { name: 'Hide this list' }).tap();
  await expect(page.getByText('Get started', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText('Get started', { exact: true })).toHaveCount(0);
});
