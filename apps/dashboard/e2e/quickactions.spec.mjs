// Backlog (21 Oct 2026): quick action buttons on Today; the owner changes and reorders them.
import { expect, test } from '@playwright/test';

import { open, openApp, startDemo } from './support.mjs';

test('J33 quick buttons: the default four work, the owner swaps one in and reorders, it stays', async ({ page }) => {
  await openApp(page);
  await startDemo(page);
  const quick = page.getByRole('navigation', { name: 'Quick actions' });
  await expect(quick.getByRole('link')).toHaveText(['New member', 'Collect dues', 'Check in', 'Shop orders']);
  await quick.getByRole('link', { name: 'New member' }).tap();
  await expect(page.getByRole('dialog')).toBeVisible(); // the add-member form, open at once
  await page.keyboard.press('Escape');
  await open(page, 'Today');
  await page.getByRole('button', { name: 'Change buttons' }).tap();
  await page.getByLabel('Add expense').check();
  await page.getByRole('button', { name: 'Move Add expense earlier' }).tap();
  await page.getByRole('dialog', { name: 'Quick buttons' }).getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(quick.getByRole('link')).toHaveText(['New member', 'Collect dues', 'Check in', 'Add expense', 'Shop orders']);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Quick actions' }).getByRole('link')).toHaveCount(5);
});
