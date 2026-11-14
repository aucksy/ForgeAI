// Launch I5 (21 Oct 2026): a new gym's "Get started" list. R-526 (14 Nov 2026): on its own page, Set up your gym (More
// on a phone), with a ring on More while steps are left; Today no longer shows it.
import { expect, test } from '@playwright/test';

import { addPlan, bottomBar, freshGym, open } from './support.mjs';

const doneLine = (page, done) => page.getByRole('main').getByText(new RegExp(`^${done} of \\d+ done$`));

test('J32 Set up your gym: ticks itself, takes a hand tick, moves down the menu and back', async ({ page }) => {
  await freshGym(page);
  await open(page, 'Today');
  // Today keeps today's numbers and to-dos only.
  await expect(page.getByRole('main').getByText(/^\d+ of \d+ done$/)).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('button', { name: 'Add your plans. Open' })).toHaveCount(0);
  // The ring on More says steps are left.
  await expect(bottomBar(page).getByRole('link', { name: /^More/ }).locator('[data-setup-mark]')).toBeVisible();

  await open(page, 'Set up your gym');
  await expect(page.getByRole('heading', { name: 'Set up your gym', level: 1 })).toBeVisible();
  await expect(page.getByText('Finish these and your gym is ready for members.')).toBeVisible();
  await expect(doneLine(page, 0)).toBeVisible();
  await addPlan(page, { name: 'Monthly', price: '1500' });
  await open(page, 'Set up your gym');
  await expect(doneLine(page, 1)).toBeVisible();
  // R-523: the staff step is "Add your staff and trainers".
  await page.getByRole('button', { name: 'Mark “Add your staff and trainers” as done' }).tap();
  await expect(doneLine(page, 2)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add your plans (done). Open' })).toBeVisible();
  await page.getByRole('button', { name: 'Bring in your members. Open' }).tap();
  // UAT 1 Nov 2026: Members (Add member and Import side by side), not the import screen alone.
  await expect(page).toHaveURL(/#\/members$/);
  // "Back to the list" goes to Set up your gym, not Today.
  await page.getByRole('navigation', { name: 'Set up your gym' }).getByRole('button', { name: 'Back to the list' }).tap();
  await expect(page).toHaveURL(/#\/setup$/);

  // The old "Hide this list": the page stays, the ring goes and the row moves down to Your gym.
  await page.getByRole('button', { name: 'Move this page to the bottom of the menu' }).tap();
  await expect(bottomBar(page).locator('[data-setup-mark]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Set up your gym', level: 1 })).toBeVisible();
  await expect(bottomBar(page).locator('[data-setup-mark]')).toHaveCount(0);
  await open(page, 'More');
  const yourGym = page.getByRole('main').getByRole('region', { name: 'Your gym' });
  await expect(yourGym.getByRole('link', { name: /^Set up your gym/ })).toBeVisible();
  await yourGym.getByRole('link', { name: /^Set up your gym/ }).tap();
  await page.getByRole('button', { name: 'Show this page at the top of the menu again' }).tap();
  await expect(bottomBar(page).locator('[data-setup-mark]')).toHaveCount(1);

  // An old "get-started" address lands on the page.
  await page.goto('./#/get-started');
  await expect(page).toHaveURL(/#\/setup$/);
  await expect(page.getByRole('heading', { name: 'Set up your gym', level: 1 })).toBeVisible();
});
