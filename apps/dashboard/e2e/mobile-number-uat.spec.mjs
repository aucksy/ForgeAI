// R-580 (owner, 15 Nov 2026): "when a phone's keyboard suggests the user's own number, it fills in the country code
// and spaces (+91 98765 43210); the field must strip anything extra and keep only the last 10 digits."
// UAT on a phone (390 x 844, touch): the keyboard suggestion arrives as ONE change (fill), a paste with brackets and
// dashes too, and typing one key at a time still feels normal (an 11th key is ignored, deleting works). Pictures go to
// e2e/.results/uat (CI uploads them as "dashboard-uat-pictures").
//   1. Admin app, Set up a new gym: "Your mobile number" (the owner's own number) shows 9876543210.
//   2. Admin app, Add member: "Mobile number" shows 9876543210; the member saves as +91 98765 43210.
//   3. The friend invite page (friend.html at /f/<code>) and the gym-owner landing page (home): the same.
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { freshGym, open, openApp, sheet } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });
const PUB = new URL('../public/', import.meta.url);
const TYPES = { js: 'text/javascript', html: 'text/html; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', css: 'text/css' };

async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
}

/** The keyboard's own-number suggestion, a paste with brackets, and typing by hand: always the same 10 digits. */
async function everyWayIn(box) {
  await box.fill('+91 98765 43210');
  await expect(box).toHaveValue('9876543210');
  await box.fill('(+91) 98765-43210');
  await expect(box).toHaveValue('9876543210');
  await box.fill('0091 98765 43210');
  await expect(box).toHaveValue('9876543210');
  // Typing one key at a time: spaces go, an 11th digit is ignored, deleting works.
  await box.fill('');
  await box.pressSequentially('98765 432101');
  await expect(box).toHaveValue('9876543210');
  await box.press('Backspace');
  await expect(box).toHaveValue('987654321');
  await box.pressSequentially('0');
  await expect(box).toHaveValue('9876543210');
  // The suggestion once more, so the picture shows what it gives.
  await box.fill('');
  await box.fill('+91 98765 43210');
  await expect(box).toHaveValue('9876543210');
}

test('R-580 admin app: Set up a new gym, "Your mobile number" keeps the 10 digits', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Set up a new gym', exact: true }).click();
  const start = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create my gym' }) });
  const box = start.getByLabel('Your mobile number');
  await expect(box).toHaveAttribute('autocomplete', 'tel-national');
  await everyWayIn(box);
  await box.scrollIntoViewIfNeeded();
  await shot(page, 'r580-1-new-gym-mobile');
});

test('R-580 admin app: Add member, the keyboard suggestion becomes 9876543210 and saves as +91 98765 43210', async ({ page }) => {
  await freshGym(page);
  await open(page, 'Members');
  await page.getByRole('button', { name: '+ Add member' }).first().tap();
  const s = sheet(page, 'Add member');
  await expect(s).toBeVisible();
  await s.getByLabel('Full name').fill('Riya Sharma');
  const box = s.getByLabel('Mobile number');
  await everyWayIn(box);
  await shot(page, 'r580-2-add-member-mobile');
  await s.getByRole('button', { name: 'Add member' }).tap();
  await expect(s).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Riya Sharma', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('+91 98765 43210');
  await shot(page, 'r580-3-member-saved');
});

test('R-580 friend invite page and landing page: the keyboard suggestion keeps the 10 digits', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(/^https:\/\/app\.mettleup\.fit\//, (route) => {
    const url = new URL(route.request().url());
    if (/^\/f\/[A-Za-z0-9]{8}$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(new URL('friend.html', PUB)) });
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  await page.route('https://mettleup.fit/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname === '/' ? 'home/index.html' : url.pathname.slice(1);
    let body;
    try {
      body = readFileSync(new URL(path, PUB));
    } catch {
      return route.fulfill({ status: 404, body: 'Not found' });
    }
    return route.fulfill({ status: 200, body, headers: { 'Content-Type': TYPES[path.split('.').pop()] || 'application/octet-stream' } });
  });
  await page.addInitScript((g) => {
    window.__GYM__ = g;
  }, { gymName: 'Shakti Gym', code: 'ABCD2345', inviter: 'Asha', brand: { accent: '#0E7C66' } });

  await page.goto('https://app.mettleup.fit/f/ABCD2345');
  await expect(page.locator('#title')).toHaveText('Shakti Gym');
  const friendBox = page.locator('#phone');
  await expect(friendBox).not.toHaveAttribute('maxlength', /.*/);
  await everyWayIn(friendBox);
  await shot(page, 'r580-4-friend-page-mobile');

  await page.goto('https://mettleup.fit/');
  const hero = page.locator('form.callme').getByPlaceholder('Your WhatsApp number');
  await expect(hero).toHaveAttribute('autocomplete', 'tel-national');
  await everyWayIn(hero);
  await hero.scrollIntoViewIfNeeded();
  await shot(page, 'r580-5-landing-mobile');
  expect(errors).toEqual([]);
});
