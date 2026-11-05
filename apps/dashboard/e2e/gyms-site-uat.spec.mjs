// Launch audit 3 Nov 2026, ops #3 and #7 (owner rule R-314: UAT on every changed screen). The gym-owner
// page (gyms.mettleup.fit = public/home, under its real security policy from public/_headers) on a phone
// (390 x 844) and a computer (1280 x 900):
//   - the new footer: Privacy, Terms, Data agreement and contact@mettleup.fit, each one a working link;
//   - "Trainers see each member's weekly progress" is included now (shipped in 0.70.0), not "Coming";
//   - no sideways scroll.
// And the account-deletion page for Google Play (public/delete-account.html) on a phone.
// Pictures go to e2e/.results/uat (CI uploads them as "dashboard-uat-pictures" for a person to read).
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

const PUB = new URL('../public/', import.meta.url);
const CSP = /Content-Security-Policy: (.*)/.exec(readFileSync(new URL('_headers', PUB), 'utf8'))[1];
const TYPES = { js: 'text/javascript', html: 'text/html; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', css: 'text/css' };
const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

/** gyms.mettleup.fit and mettleup.fit from public/, the way the Worker serves them (/privacy -> privacy.html). */
async function serve(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(/^https:\/\/(gyms\.)?mettleup\.fit\//, async (route) => {
    const url = new URL(route.request().url());
    let path = url.pathname === '/' ? 'home/index.html' : url.pathname.slice(1);
    if (/^(privacy|terms|data-agreement|delete-account)$/.test(path)) path += '.html';
    let body;
    try {
      body = readFileSync(new URL(path, PUB));
    } catch {
      return route.fulfill({ status: 404, body: 'Not found' });
    }
    return route.fulfill({ status: 200, body, headers: { 'Content-Type': TYPES[path.split('.').pop()] || 'application/octet-stream', 'Content-Security-Policy': CSP } });
  });
  return errors;
}

async function noSideways(page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

for (const [name, size] of [['phone', { width: 390, height: 844 }], ['computer', { width: 1280, height: 900 }]]) {
  test(`G1 gym page footer and trainer line, ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    const errors = await serve(page);
    await page.goto('https://gyms.mettleup.fit/');

    const foot = page.locator('footer.foot-bar');
    await foot.scrollIntoViewIfNeeded();
    await expect(foot).toBeVisible();
    await expect(foot).toContainText('Questions? Write to us: contact@mettleup.fit');
    await expect(foot.getByRole('link', { name: 'contact@mettleup.fit' })).toHaveAttribute('href', 'mailto:contact@mettleup.fit');
    for (const [label, href] of [['Privacy', '/privacy'], ['Terms', '/terms'], ['Data agreement', '/data-agreement']]) {
      const link = foot.getByRole('link', { name: label, exact: true });
      await expect(link).toHaveAttribute('href', href);
      const box = await link.boundingBox();
      expect(box.height, `${label} is big enough to tap`).toBeGreaterThanOrEqual(18);
    }
    await page.waitForTimeout(300);
    await foot.screenshot({ path: `${DIR}/gyms-footer-${name}.png` });

    const line = page.locator('li', { hasText: "Trainers see each member's weekly progress" });
    await expect(line).toHaveCount(1);
    await expect(line.locator('[aria-label="included"]')).toHaveCount(1);
    await expect(line).not.toContainText('Coming');
    await expect(page.getByText('Gym sees who is progressing')).toHaveCount(0);
    // R-324 (4 Nov 2026): the member app's full list sits folded shut under "Everything in the member app".
    await page.locator('.panel summary').click();
    await line.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await line.locator('xpath=ancestor::div[contains(@class,"panel")][1]').screenshot({ path: `${DIR}/gyms-member-facts-${name}.png` });

    await noSideways(page);
    // UAT 5 Nov 2026: sections fade in as a visitor scrolls to them, so a whole-page picture showed them
    // as empty gaps. Reduced motion shows every section at once (the page's own rule), for an honest picture.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/gyms-page-${name}.png`, fullPage: true });

    // Each footer link opens its real page.
    await foot.getByRole('link', { name: 'Data agreement', exact: true }).click();
    await expect(page).toHaveURL('https://gyms.mettleup.fit/data-agreement');
    await expect(page).toHaveTitle(/Data agreement/);
    await page.goBack();
    await page.locator('footer.foot-bar').getByRole('link', { name: 'Privacy', exact: true }).click();
    await expect(page).toHaveTitle(/Privacy notice/);
    expect(errors).toEqual([]);
  });
}

test('G2 account-deletion page for Google Play, phone', async ({ page }) => {
  const errors = await serve(page);
  await page.goto('https://mettleup.fit/delete-account');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delete your MettleUp account');
  for (const h of ['Delete it in the app', 'No app any more? Email us', 'What we delete', 'What is kept, and for how long']) {
    await expect(page.getByRole('heading', { name: h })).toBeVisible();
  }
  await expect(page.getByText('Settings', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'contact@mettleup.fit' }).first()).toHaveAttribute('href', /^mailto:contact@mettleup\.fit/);
  await noSideways(page);
  await page.screenshot({ path: `${DIR}/delete-account-phone.png`, fullPage: true });
  expect(errors).toEqual([]);
});
