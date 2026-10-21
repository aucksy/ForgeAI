// Launch A6 (21 Oct 2026): the admin app under its security policy (public/_headers; vite preview
// sends the same rule, vite.config.ts). The panel may run only its own scripts and talk only to the
// gym server. Every other journey also runs under the policy; this one walks every main screen, a
// sale and a receipt, and fails on ANY blocked script, style, picture, font or server call.
import { expect, test } from '@playwright/test';

import { addMember, gymWithMonthlyPlan, open, openMember, sell } from './support.mjs';

test('J29 security policy: sent with the page, and nothing on the main screens is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    window.__blocked = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__blocked.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  const first = await page.request.get('./');
  expect(first.headers()['content-security-policy']).toContain("script-src 'self'");

  await gymWithMonthlyPlan(page);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await sell(page, { received: '2000' });
  await openMember(page, 'Asha Verma');
  for (const label of ['Today', 'Members', 'Money', 'Visits', 'Plans', 'Settings', 'Shop']) {
    await open(page, label);
  }
  for (const path of ['money/dues', 'enquiries', 'expenses', 'attendance']) {
    await page.goto(`./#/${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(await page.evaluate(() => window.__blocked)).toEqual([]);
});
