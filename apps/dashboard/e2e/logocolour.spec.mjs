// R-160 (29 Oct 2026): the gym's colour from its logo, read on this computer (no AI). The owner
// uploads a logo on Settings -> Branding, sees the colour we suggest, takes it with one press,
// and Save sends that colour. Only the server and the storage bucket are faked.
import { expect, test } from '@playwright/test';

import { expectFitsPhone, openApp, startOnlineGym } from './support.mjs';

const TICKET = 'ab'.repeat(24);

/** A logo drawn in this browser: a navy disc and a small red mark on white, as PNG bytes. */
async function logoPng(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#14286E';
    g.beginPath();
    g.arc(128, 128, 100, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#E0301E';
    g.fillRect(100, 100, 56, 56);
    return c.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(b64, 'base64');
}

/** Upload ticket, brand save and the logo bucket, answered here (the shared fake has no branding). */
async function fakeBranding(page, png) {
  const saved = [];
  await page.context().route(/\/rest\/v1\/rpc\/(owner_photo_ticket|owner_set_brand)$/, async (route) => {
    const fn = /rpc\/([a-z_]+)/.exec(route.request().url())[1];
    if (fn === 'owner_photo_ticket') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TICKET) });
      return;
    }
    const a = route.request().postDataJSON();
    saved.push(a);
    const brand = { accent: a.p_accent, bg: a.p_bg, logoUrl: a.p_logo_url, heading: a.p_heading, updatedAt: '2026-10-29T08:00:00Z' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand }) });
  });
  await page.context().route(/\/storage\/v1\/object\//, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'image/png', body: png, headers: { 'access-control-allow-origin': '*' } });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'gym-logos/x', Id: 'x' }) });
  });
  return saved;
}

test('J-LOGO-a a new logo suggests its colour; one press uses it and Save sends it', async ({ page }) => {
  await openApp(page);
  await startOnlineGym(page);
  const png = await logoPng(page);
  const saved = await fakeBranding(page, png);
  await page.goto('./#/settings/branding');
  await expect(page.getByRole('heading', { name: 'Branding', exact: true })).toBeVisible();

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload logo' }).tap();
  await (await chooser).setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });

  const box = page.getByTestId('logo-colour');
  await expect(box).toBeVisible({ timeout: 15_000 });
  await expect(box).toContainText('Colour from your logo');
  // The navy is the biggest colour; too dark to read on the app's dark screens, so lighter.
  await expect(box).toContainText('Your logo’s colour is');
  await expect(box).toContainText('Easy to read on the member app’s dark screens.');
  // The red mark is offered as another choice.
  await expect(box.getByText('Other colours in your logo')).toBeVisible();
  const suggested = (await box.locator('span').filter({ hasText: /^#[0-9A-F]{6}$/ }).first().textContent())?.trim();
  expect(suggested).toMatch(/^#[0-9A-F]{6}$/);
  await expectFitsPhone(page, 'with the logo colour suggestion');
  await page.screenshot({ path: test.info().outputPath('logo-colour.png'), fullPage: true });

  await box.getByRole('button', { name: 'Use this colour', exact: true }).tap();
  await expect(box.getByRole('button', { name: 'Using this colour' })).toBeDisabled();
  await expect(page.getByLabel('Your brand colour', { exact: true })).toHaveValue(suggested);

  await page.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0].p_accent).toBe(suggested);
  expect(saved[0].p_logo_url).toContain(`/gym-logos/${TICKET}/logo-`);
});

test('J-LOGO-b a black-and-white logo says there is no colour to suggest', async ({ page }) => {
  await openApp(page);
  await startOnlineGym(page);
  const png = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#FFFFFF';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#000000';
      g.fillRect(32, 32, 64, 64);
      return c.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );
  await fakeBranding(page, png);
  await page.goto('./#/settings/branding');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload logo' }).tap();
  await (await chooser).setFiles({ name: 'mono.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('Your logo is only black, white or grey, so there is no colour to suggest.', { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Use this colour' })).toHaveCount(0);
});

// 7 Nov 2026 (owner, client demo, installed app): Branding wiped the chosen logo and colour every
// few seconds. Each data refresh (every 15 s, and each time the window got focus back, e.g. after
// the colour or file picker closed) made the page load the saved look again. The owner's unsaved
// choice must survive focus and refreshes, and the saved look is loaded only once.
test('J-LOGO-d an unsaved colour survives the window getting focus back and the 15 s refresh', async ({ page }) => {
  await openApp(page);
  await startOnlineGym(page);
  await fakeBranding(page, await logoPng(page));
  let loads = 0;
  page.on('request', (r) => {
    if (/\/rest\/v1\/rpc\/owner_gym$/.test(r.url())) loads += 1;
  });
  await page.goto('./#/settings/branding');
  const field = page.getByLabel('Your brand colour', { exact: true });
  await expect(field).toBeVisible();
  await expect.poll(() => loads).toBeGreaterThan(0);
  await page.waitForTimeout(1_000);
  const before = loads;

  await field.fill('#12AB34');
  // What closing the colour picker or file picker does to the installed app's window.
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(700);
  }
  // And one full background refresh.
  await page.waitForTimeout(16_000);

  await expect(page.getByText('Loading your gym’s look…')).toHaveCount(0);
  await expect(field).toHaveValue('#12AB34');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  expect(loads - before).toBeLessThanOrEqual(1); // at most the page's own one-time name check
});
