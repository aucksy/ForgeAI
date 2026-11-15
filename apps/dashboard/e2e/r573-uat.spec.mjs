// R-573 UAT (owner, 15 Nov 2026): the logo's plain background comes off on the owner's own computer. Branding, on a
// computer (1280 x 900) and a phone (390 x 844), in the admin app's Dark and Light looks. Pictures for a person to
// read: e2e/.results/uat/r573-*.png (CI keeps them as dashboard-uat-pictures).
//  1. A logo on a white box: the before/after choice shows both logos on a dark and a light screen, "Without the
//     background" picked to start with, and the free ChatGPT/Gemini tip hidden. "Keep my logo as it is" uploads the
//     logo with its box (the tip comes back); "Without the background" uploads it see-through (the tip goes).
//     "Cancel" uploads nothing. Save sends the uploaded logo.
//  2. A logo on a photo: no choice; it uploads as it is, and the tip says the photo is still there and how to
//     remove it for free.
// Only the server and the storage bucket are faked; the fixtures are e2e/fixtures/logo-*.png.
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { expectFitsPhone, openApp, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

const TICKET = 'cd'.repeat(24);
const WHITE_BOX = readFileSync(new URL('./fixtures/logo-white-box.png', import.meta.url));
const PHOTO_BACK = readFileSync(new URL('./fixtures/logo-photo-back.png', import.meta.url));
const COMPUTER = { viewport: { width: 1280, height: 900 }, isMobile: false };

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r573-${name}.png`, ...opts });
}

const setTheme = (page, mode) =>
  page.locator('[data-top-bar]').getByRole('radiogroup', { name: 'Screen colours' }).getByRole('radio', { name: mode === 'light' ? 'Light' : 'Dark' }).click();

/** The PNG inside a storage upload (supabase-js sends the file as a form). */
function pngOf(body) {
  const start = body.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const end = body.indexOf(Buffer.from('IEND'));
  if (start < 0 || end < 0) return body;
  return body.subarray(start, end + 8);
}

/** Upload ticket, brand save and the logo bucket, answered here; each uploaded logo is served back by its path. */
async function fakeBranding(page) {
  const uploads = [];
  const saved = [];
  const files = new Map();
  await page.context().route(/\/rest\/v1\/rpc\/(owner_photo_ticket|owner_set_brand)$/, async (route) => {
    const fn = /rpc\/([a-z_]+)/.exec(route.request().url())[1];
    if (fn === 'owner_photo_ticket') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TICKET) });
      return;
    }
    const a = route.request().postDataJSON();
    saved.push(a);
    const brand = { accent: a.p_accent, bg: a.p_bg, logoUrl: a.p_logo_url, heading: a.p_heading, updatedAt: '2026-11-15T08:00:00Z' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand }) });
  });
  await page.context().route(/\/storage\/v1\/object\//, async (route) => {
    const name = /logo-[^/?]+/.exec(route.request().url())?.[0] ?? 'x';
    if (route.request().method() === 'GET') {
      const body = files.get(name) ?? WHITE_BOX;
      await route.fulfill({ status: 200, contentType: 'image/png', body, headers: { 'access-control-allow-origin': '*' } });
      return;
    }
    const png = pngOf(route.request().postDataBuffer() ?? Buffer.alloc(0));
    files.set(name, png);
    uploads.push(png);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: `gym-logos/${name}`, Id: name }) });
  });
  return { uploads, saved };
}

/** The alpha (0..255) of an uploaded PNG at a corner and at its middle, read in the page. */
async function alphaOf(page, png) {
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    const at = (x, y) => g.getImageData(x, y, 1, 1).data[3];
    return { corner: at(1, 1), middle: at(Math.floor(bmp.width / 2), Math.floor(bmp.height / 2)), width: bmp.width, height: bmp.height };
  }, png.toString('base64'));
}

async function pick(page, buffer, name) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /^(Upload|Change) logo$/ }).click();
  await (await chooser).setFiles({ name, mimeType: 'image/png', buffer });
}

const logoCard = (page) => page.getByTestId('logo-card');

test.describe('R573 on a computer', () => {
  test.use(COMPUTER);

  test('R573-1 a logo on a white box: compare, keep it, take the box off, cancel, save', async ({ page }) => {
    await openApp(page);
    await startOnlineGym(page);
    const { uploads, saved } = await fakeBranding(page);
    await page.goto('./#/settings/branding');
    await expect(page.getByRole('heading', { name: 'Branding', exact: true })).toBeVisible({ timeout: 15_000 });
    await setTheme(page, 'dark');
    const tip = page.getByTestId('logo-tip');
    await expect(tip).toContainText('Is there a photo or a pattern behind your logo?');

    // The choice appears, the clean one picked, nothing uploaded yet, and the free tip out of the way.
    await pick(page, WHITE_BOX, 'iron-gym.png');
    const panel = page.getByTestId('logo-choice');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel).toContainText('We took the white background off your logo.');
    const clean = panel.getByRole('radio', { name: /Without the background/ });
    const keep = panel.getByRole('radio', { name: /Keep my logo as it is/ });
    await expect(clean).toHaveAttribute('aria-checked', 'true');
    await expect(keep).toHaveAttribute('aria-checked', 'false');
    await expect(panel.locator('img')).toHaveCount(4);
    await expect(tip).toHaveCount(0);
    expect(uploads).toHaveLength(0);
    await panel.scrollIntoViewIfNeeded();
    await shot(page, 'computer-choice-dark');
    await panel.screenshot({ path: `${DIR}/r573-computer-choice-panel-dark.png` });
    await setTheme(page, 'light');
    await panel.screenshot({ path: `${DIR}/r573-computer-choice-panel-light.png` });
    await setTheme(page, 'dark');

    // "Keep my logo as it is": the logo goes up with its white box, and the tip comes back.
    await keep.click();
    await expect(keep).toHaveAttribute('aria-checked', 'true');
    await expect(clean).toHaveAttribute('aria-checked', 'false');
    await panel.screenshot({ path: `${DIR}/r573-computer-choice-keep-picked.png` });
    await panel.getByRole('button', { name: 'Upload this logo' }).click();
    await expect(panel).toHaveCount(0, { timeout: 15_000 });
    expect(uploads).toHaveLength(1);
    const kept = await alphaOf(page, uploads[0]);
    expect(kept.corner, 'the kept logo still has its white box').toBe(255);
    await expect(tip).toBeVisible();
    await shot(page, 'computer-kept-as-is-dark');

    // "Cancel": nothing uploads, the logo in the form stays.
    await pick(page, WHITE_BOX, 'iron-gym.png');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel).toHaveCount(0);
    expect(uploads).toHaveLength(1);

    // "Without the background" (picked to start with): the logo goes up see-through, trimmed; the tip goes.
    await pick(page, WHITE_BOX, 'iron-gym.png');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(clean).toHaveAttribute('aria-checked', 'true');
    await panel.getByRole('button', { name: 'Upload this logo' }).click();
    await expect(panel).toHaveCount(0, { timeout: 15_000 });
    expect(uploads).toHaveLength(2);
    const cleaned = await alphaOf(page, uploads[1]);
    expect(cleaned.corner, 'the corner is see-through').toBe(0);
    expect(cleaned.middle, 'the logo itself is solid').toBe(255);
    expect(cleaned.width).toBeLessThan(kept.width); // the empty margin was trimmed
    await expect(tip).toHaveCount(0);
    await expect(page.getByTestId('shortcut-preview')).toBeVisible();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0].p_logo_url).toContain(`/gym-logos/${TICKET}/logo-`);

    // The Branding screen and the member-app preview, in Dark and Light.
    const phone = page.getByRole('figure', { name: /Phone preview/ });
    for (const mode of ['dark', 'light']) {
      await setTheme(page, mode);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `computer-branding-${mode}`, { fullPage: true });
      await phone.screenshot({ path: `${DIR}/r573-computer-member-preview-${mode}.png` });
      await logoCard(page).screenshot({ path: `${DIR}/r573-computer-logo-card-${mode}.png` });
    }
  });

  test('R573-2 a logo on a photo uploads as it is, and the tip shows how to remove the photo for free', async ({ page }) => {
    await openApp(page);
    await startOnlineGym(page);
    const { uploads } = await fakeBranding(page);
    await page.goto('./#/settings/branding');
    await expect(page.getByRole('heading', { name: 'Branding', exact: true })).toBeVisible({ timeout: 15_000 });
    await setTheme(page, 'dark');
    await pick(page, PHOTO_BACK, 'photo-logo.png');
    await expect.poll(() => uploads.length, { timeout: 15_000 }).toBe(1);
    await expect(page.getByTestId('logo-choice')).toHaveCount(0);
    const tip = page.getByTestId('logo-tip');
    await expect(tip).toContainText('Your logo has a photo or a pattern behind it.');
    await expect(tip).toContainText('ChatGPT or Google Gemini');
    expect((await alphaOf(page, uploads[0])).corner).toBe(255);
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const mode of ['dark', 'light']) {
      await setTheme(page, mode);
      await logoCard(page).screenshot({ path: `${DIR}/r573-computer-photo-logo-${mode}.png` });
    }
  });
});

test('R573-3 on a phone: the before/after choice fits the screen', async ({ page }) => {
  await openApp(page);
  await startOnlineGym(page);
  await fakeBranding(page);
  await page.goto('./#/settings/branding');
  await expect(page.getByRole('heading', { name: 'Branding', exact: true })).toBeVisible({ timeout: 15_000 });
  await pick(page, WHITE_BOX, 'iron-gym.png');
  const panel = page.getByTestId('logo-choice');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expectFitsPhone(page, 'with the logo choice open');
  // Both choices side by side or stacked, each fully on screen.
  for (const r of await panel.getByRole('radio').all()) {
    const box = await r.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
  }
  await panel.scrollIntoViewIfNeeded();
  await shot(page, 'phone-choice');
  await panel.screenshot({ path: `${DIR}/r573-phone-choice-panel.png` });
});
