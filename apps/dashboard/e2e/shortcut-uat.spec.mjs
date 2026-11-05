// T74 (R-356, 5 Nov 2026) UAT: Settings -> Branding shows, under the logo, "How it looks on a
// member's home screen": the logo as the round icon a member can add to their phone. The owner's
// case is a round black badge on a white square: the circle must be filled with white (no square
// poking out). Pictures at phone and computer width go to e2e/.results/uat (CI uploads them as
// "dashboard-uat-pictures"). Only the server and the storage bucket are faked.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { expectFitsPhone, openApp, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
const TICKET = 'cd'.repeat(24);

/** A logo drawn in this browser, as PNG bytes. */
async function drawLogo(page, kind) {
  const b64 = await page.evaluate((k) => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const g = c.getContext('2d');
    if (k === 'badge') {
      // The owner's screenshot: a round black badge with a white ring and mark, on a white square.
      g.fillStyle = '#FFFFFF';
      g.fillRect(0, 0, 512, 512);
      g.fillStyle = '#000000';
      g.beginPath();
      g.arc(256, 256, 230, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#FFFFFF';
      g.lineWidth = 14;
      g.beginPath();
      g.arc(256, 256, 180, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#FFFFFF';
      g.fillRect(196, 196, 120, 120);
    } else {
      // A logo with its background removed: an orange triangle.
      g.fillStyle = '#F07020';
      g.beginPath();
      g.moveTo(256, 40);
      g.lineTo(470, 420);
      g.lineTo(42, 420);
      g.closePath();
      g.fill();
    }
    return c.toDataURL('image/png').split(',')[1];
  }, kind);
  return Buffer.from(b64, 'base64');
}

async function fakeBranding(page, png) {
  await page.context().route(/\/rest\/v1\/rpc\/(owner_photo_ticket|owner_set_brand)$/, async (route) => {
    const fn = /rpc\/([a-z_]+)/.exec(route.request().url())[1];
    if (fn === 'owner_photo_ticket') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TICKET) });
      return;
    }
    const a = route.request().postDataJSON();
    const brand = { accent: a.p_accent, bg: a.p_bg, logoUrl: a.p_logo_url, heading: a.p_heading, updatedAt: '2026-11-05T08:00:00Z' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand }) });
  });
  await page.context().route(/\/storage\/v1\/object\//, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'image/png', body: png, headers: { 'access-control-allow-origin': '*' } });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'gym-logos/x', Id: 'x' }) });
  });
}

async function upload(page, png, name) {
  await page.goto('./#/settings/branding');
  await expect(page.getByRole('heading', { name: 'Branding', exact: true })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload logo' }).tap();
  await (await chooser).setFiles({ name, mimeType: 'image/png', buffer: png });
}

/** The colours the round icon shows in a thin ring just inside its edge (what a mask leaves). */
async function ringColours(page) {
  return page.getByTestId('shortcut-icon').evaluate(async (el) => {
    const img = el.querySelector('img');
    if (!img) return [];
    // The logo comes from the (faked) storage bucket: read it as a blob so the canvas stays readable.
    const pic = await createImageBitmap(await (await fetch(img.src)).blob());
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    const box = el.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    g.fillStyle = getComputedStyle(el).backgroundColor;
    g.fillRect(0, 0, size, size);
    const k = size / box.width;
    g.drawImage(pic, (r.left - box.left) * k, (r.top - box.top) * k, r.width * k, r.height * k);
    const data = g.getImageData(0, 0, size, size).data;
    const seen = new Set();
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
        if (d < size * 0.47 || d > size * 0.5) continue;
        const i = (y * size + x) * 4;
        seen.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
      }
    }
    return [...seen];
  });
}

test('T74-a the owner case: a badge on a white square shows as a clean white circle (phone, then computer)', async ({ page }) => {
  mkdirSync(DIR, { recursive: true });
  await openApp(page);
  await startOnlineGym(page);
  const png = await drawLogo(page, 'badge');
  await fakeBranding(page, png);
  await upload(page, png, 'badge.png');

  const preview = page.getByTestId('shortcut-preview');
  await expect(preview).toBeVisible({ timeout: 15_000 });
  await expect(preview).toContainText('How it looks on a member’s home screen');
  await expect(preview).toContainText('Members can add your logo to their phone’s home screen. Most phones show it in a circle, like this. The app fills the space around your logo with a matching colour.');
  await expect(page.getByTestId('shortcut-icon')).toHaveAttribute('data-bg', '#FFFFFF');
  // Only white just inside the circle's edge: no dark corners, no square showing.
  expect(await ringColours(page)).toEqual(['31,31,31']);
  await expectFitsPhone(page, 'with the home-screen icon preview');
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DIR}/t74-badge-phone.png` });
  await preview.screenshot({ path: `${DIR}/t74-badge-preview-phone.png` });

  await page.setViewportSize({ width: 1280, height: 900 });
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DIR}/t74-badge-computer.png` });
});

test('T74-b a see-through logo sits on a colour it stands out on', async ({ page }) => {
  mkdirSync(DIR, { recursive: true });
  await openApp(page);
  await startOnlineGym(page);
  const png = await drawLogo(page, 'clear');
  await fakeBranding(page, png);
  await upload(page, png, 'clear.png');
  const icon = page.getByTestId('shortcut-icon');
  await expect(icon).toHaveAttribute('data-bg', /^#[0-9A-F]{6}$/, { timeout: 15_000 });
  // MettleUp's orange (the default brand colour) is too close to the orange logo: not that.
  expect(await icon.getAttribute('data-bg')).not.toBe('#FF7A3B');
  await page.getByTestId('shortcut-preview').scrollIntoViewIfNeeded();
  await page.getByTestId('shortcut-preview').screenshot({ path: `${DIR}/t74-see-through-preview-phone.png` });
});
