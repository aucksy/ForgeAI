// UAT WP5b journey 28 (FINDINGS U-A15): the admin app before its web font arrives. The panel's
// fonts come from Google Fonts with display=swap, so on a slow line (or an installed app with no
// internet) every screen is first drawn in the phone's own, often wider, font. The CI runner caught
// it: the member page's buttons pushed the page 5px wider than the phone until the font loaded.
// Here the web font never arrives and a wide font stands in, and no screen may be wider than the
// phone.
import { expect, test } from '@playwright/test';

import { expectFitsPhone, openApp, sheet, startDemo } from './support.mjs';

const WIDE = '"Verdana", "DejaVu Sans", sans-serif';

test('J28 no web font (slow line or offline): every main screen still fits the phone', async ({ page }) => {
  await page.context().route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.addInitScript((family) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `*{font-family:${family} !important}`;
      document.head.appendChild(style);
    });
  }, WIDE);
  await openApp(page);
  await startDemo(page);

  for (const path of ['', 'members', 'money', 'money/dues', 'attendance', 'more', 'plans', 'settings', 'enquiries', 'expenses', 'shop']) {
    await page.goto(`./#/${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectFitsPhone(page, `on #/${path} in a wide font`);
  }

  // A member who owes and whose plan has ended: Edit, Collect payment and Sell membership at once.
  await page.goto('./#/money/dues');
  await page.getByRole('main').getByRole('link').filter({ hasText: /\S/ }).first().tap();
  await expect(page.getByRole('button', { name: 'Collect payment' })).toBeVisible();
  await expectFitsPhone(page, 'on a member page in a wide font');
  await page.getByRole('button', { name: 'Collect payment' }).tap();
  await expect(sheet(page, 'Collect payment')).toBeVisible();
  await expectFitsPhone(page, 'in Collect payment in a wide font');
  await sheet(page, 'Collect payment').getByRole('button', { name: 'Cancel' }).tap();
  await page.getByRole('button', { name: /^(Renew|Sell membership)$/ }).first().tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectFitsPhone(page, 'in the sell sheet in a wide font');
});
