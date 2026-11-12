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

// F201 (12 Nov 2026, R-469): the AI Assistant section (coming soon) with its three self-looping demos, and the price
// card that replaced the old third pack. Pictures: gyms-ai-assistant-*.png, gyms-pricing-yearly-*.png.
for (const [name, size] of [['phone', { width: 390, height: 844 }], ['computer', { width: 1280, height: 900 }]]) {
  test(`G3 AI Assistant section and price card (coming soon), ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    const errors = await serve(page);
    await page.goto('https://gyms.mettleup.fit/');

    const sec = page.locator('#assistant');
    await sec.scrollIntoViewIfNeeded();
    await expect(sec.locator('.as-head')).toContainText('Coming soon');
    await expect(sec).toContainText('it is not in the app yet');
    await expect(sec.locator('.as-cell')).toHaveCount(3);
    await expect(sec).toContainText('Speak in Hindi or English. Asking is free.');
    await expect(sec).not.toContainText(/diwali/i);

    // Each demo plays by itself: the card goes away, the owner's words type in, the card comes back and is done.
    const cell = page.locator('#as-renew');
    await cell.scrollIntoViewIfNeeded();
    const card = cell.locator('.as-card');
    await expect(card).not.toHaveClass(/\bin\b/, { timeout: 5000 });
    await expect(card).toHaveClass(/\bdone\b/, { timeout: 15000 });
    await expect(cell.locator('.as-t')).toHaveText('Rahul ka plan 3 mahine renew karo, 4500 cash');
    await expect(cell.locator('.as-made')).toHaveText('Receipt 1042 is made.');
    // ...and again, with no button to press.
    await expect(card).not.toHaveClass(/\bin\b/, { timeout: 8000 });
    await expect(card).toHaveClass(/\bdone\b/, { timeout: 15000 });
    await expect(page.locator('#as-ask .as-card')).toContainText('14 members owe ₹38,500');
    await expect(page.locator('#as-ask .as-card')).toContainText('Remind them politely');
    // A tap pauses a demo on its finished state (the page's own rule): pause all three for the picture.
    for (const id of ['#as-ask', '#as-msg', '#as-renew']) await page.locator(id).click();
    await expect(card).toHaveClass(/\bdone\b/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(300);
    await sec.screenshot({ path: `${DIR}/gyms-ai-assistant-${name}.png` });
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // The price cards: Starter, Pro and the AI Assistant (credits on every plan); the old third pack is gone.
    const cards = page.locator('#cards');
    await cards.scrollIntoViewIfNeeded();
    await expect(cards.locator('.card')).toHaveCount(3);
    const ai = cards.locator('.card.ai');
    await expect(ai.locator('h3')).toContainText('AI Assistant');
    await expect(ai.locator('h3')).toContainText('Coming soon');
    await expect(ai.locator('.pk')).toHaveText([/50 credits\s*₹149/, /150 credits\s*Most popular\s*₹399/, /500 credits\s*₹999/]);
    await expect(cards).not.toContainText('Pro + AI');
    await expect(cards).not.toContainText('₹24,990');
    const yearlyLine = cards.locator('.aiy');
    await expect(yearlyLine.first()).toBeHidden();
    await page.locator('#bill-y').click();
    await expect(yearlyLine).toHaveCount(2);
    for (const i of [0, 1]) await expect(yearlyLine.nth(i)).toContainText('+ 100 AI credits every month, free');
    await expect(yearlyLine.first()).toBeVisible();
    await expect(page.locator('.found')).toContainText('100 free AI credits every month');
    // "See what it does" goes to the section.
    await expect(ai.getByRole('link', { name: 'See what it does' })).toHaveAttribute('href', '#assistant');
    await noSideways(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(300);
    await page.locator('#pricing').screenshot({ path: `${DIR}/gyms-pricing-yearly-${name}.png` });

    // Hindi: the words change; the owner's spoken lines stay as he says them.
    await page.locator('#lang').click();
    await expect(page.locator('#as-h')).toContainText('AI असिस्टेंट');
    await expect(ai.locator('h3')).toContainText('जल्द आ रहा है');
    await expect(page.locator('#as-msg .as-t')).toHaveText('Kal gym band rahega, sabko batao');
    await sec.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await sec.screenshot({ path: `${DIR}/gyms-ai-assistant-hindi-${name}.png` });
    await noSideways(page);
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
