// R-495 (owner, 14 Nov 2026) UAT: "when a gym owner adds their logo in the branding panel, we should also start showing
// that logo somewhere on the admin panel." The gym's own logo now sits top-left, before the gym's name: in the phone's
// top bar and at the top of the computer's side menu, for the owner and the desk (trainers sign in as desk staff, so
// they get the same top bar). Pictures go to e2e/.results/uat (CI uploads them as "dashboard-uat-pictures"), r495-*.png.
//
// UAT types: happy path (Save a logo in Branding: the top bar shows it at once, no reload); negative (no logo: no box,
// the name alone as before; a removed logo goes away); regression (the top bar keeps its height, the bell and Dark |
// Light are not covered, nothing wider than the phone); setting change (Dark and Light); edit (a second logo replaces
// the first); interruption (a reload keeps it); edge (a wide logo is never stretched; a 390 px phone and a 1366x768
// computer); another role (the desk on its own phone). The gym server is support.mjs FakeServer; only the storage
// bucket and the upload ticket are faked here. Fake names and numbers only.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { DESK, OWNER, addDeskPerson, expectFitsPhone, openApp, secondPhone, signIn, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

const TICKET = 'cd'.repeat(24);
const COMPUTER = { width: 1366, height: 768 };

async function shot(page, name, clip) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r495-${name}.png`, ...(clip ? { clip } : {}) });
}

/**
 * A logo drawn in this browser, as PNG bytes. `wide` (or true): 360x120, an orange "SHAKTI" word mark; 'blue': 300x150,
 * a blue "IRON" word mark (fresh eyes, 14 Nov 2026: the "changed" picture showed the same orange logo as test a, so the
 * change could not be seen); else (false) a 256 px square gold badge.
 */
async function logoPng(page, kind) {
  const k = kind === true ? 'wide' : kind === false ? 'badge' : kind;
  const b64 = await page.evaluate((w) => {
    const c = document.createElement('canvas');
    c.width = w === 'wide' ? 360 : w === 'blue' ? 300 : 256;
    c.height = w === 'wide' ? 120 : w === 'blue' ? 150 : 256;
    const g = c.getContext('2d');
    if (w === 'wide' || w === 'blue') {
      // A bar with a white word: a word mark wider than it is tall, on a clear background.
      g.fillStyle = w === 'wide' ? '#FF7A1A' : '#1E5BFF';
      g.fillRect(0, 10, c.width, c.height - 20);
      g.fillStyle = '#FFFFFF';
      g.font = `bold ${w === 'wide' ? 64 : 80}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(w === 'wide' ? 'SHAKTI' : 'IRON', c.width / 2, c.height / 2 + 2);
    } else {
      // A gold disc with a dark "S".
      g.fillStyle = '#F7D411';
      g.beginPath();
      g.arc(128, 128, 120, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#14141A';
      g.font = 'bold 150px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('S', 128, 138);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, k);
  return Buffer.from(b64, 'base64');
}

/**
 * The upload ticket and the public logo bucket (the save itself goes to the FakeServer, which keeps the brand).
 * Each new logo address gets the picture `logos.next` held when it was first asked for.
 */
async function fakeLogoBucket(context, logos) {
  const byUrl = new Map();
  await context.route(/\/rest\/v1\/rpc\/owner_photo_ticket$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TICKET) }),
  );
  await context.route(/\/storage\/v1\/object\//, async (route) => {
    if (route.request().method() === 'GET') {
      const url = route.request().url().split('?')[0];
      if (!byUrl.has(url)) byUrl.set(url, logos.next);
      await route.fulfill({ status: 200, contentType: 'image/png', body: byUrl.get(url), headers: { 'access-control-allow-origin': '*' } });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'gym-logos/x', Id: 'x' }) });
  });
}

/** Branding -> Upload logo -> Save. Stays on Branding. */
async function saveLogo(page, png, name) {
  await page.goto('./#/settings/branding');
  await expect(page.getByRole('heading', { name: 'Branding', exact: true })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /^(Upload logo|Change logo)$/ }).tap();
  await (await chooser).setFiles({ name, mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('img', { name: 'Your logo' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(page.getByText('Saved.', { exact: false }).first()).toBeVisible();
}

/** The top bar on a phone, the side menu on a computer. */
function head(page) {
  const phone = (page.viewportSize()?.width ?? 390) <= 860;
  return phone ? page.getByRole('banner') : page.getByRole('navigation', { name: 'Main' });
}

/** The logo is in the top bar, loaded (not a broken picture), small, never stretched, and covers nothing. */
async function expectNeatLogo(page, where) {
  const tile = head(page).getByTestId('header-logo');
  await expect(tile, where).toBeVisible();
  const img = tile.getByRole('img', { name: OWNER.gym, exact: true });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0), { message: `${where}: the logo loaded` }).toBe(true);
  expect(await img.evaluate((el) => getComputedStyle(el).objectFit), where).toBe('contain');
  const t = await tile.boundingBox();
  expect(t.height, `${where}: about the height of the name beside it`).toBeLessThanOrEqual(30);
  expect(t.width, `${where}: a wide logo stays small`).toBeLessThanOrEqual(66);
  // The gym's name is still there, to the right of the logo.
  const name = head(page).getByText(OWNER.gym, { exact: true }).first();
  await expect(name).toBeVisible();
  const n = await name.boundingBox();
  expect(n.x, `${where}: the name sits after the logo`).toBeGreaterThanOrEqual(t.x + t.width);
  // Nothing covered: on a phone the bell and Dark | Light sit to the right of the name.
  if (page.viewportSize().width <= 860) {
    const bell = await page.getByRole('banner').getByRole('button', { name: /^Notifications/ }).boundingBox();
    expect(bell.x, `${where}: the bell is not covered`).toBeGreaterThanOrEqual(t.x + t.width);
  }
}

/** The gym name's size in the header (fresh eyes, 14 Nov 2026: it must not jump between logo and no logo). */
async function nameSize(page) {
  const name = head(page).getByText(OWNER.gym, { exact: true }).first();
  await expect(name).toBeVisible();
  return name.evaluate((el) => ({ font: getComputedStyle(el).fontSize, weight: getComputedStyle(el).fontWeight, height: Math.round(el.getBoundingClientRect().height) }));
}

/** The header logo as drawn: its file's size and the colour at the left of its middle row (to tell two logos apart). */
async function drawnLogo(page) {
  return head(page)
    .getByTestId('header-logo')
    .locator('img')
    .evaluate(async (el) => {
      // The picture's size is read off the drawn <img>; its colour from the same address (the img itself is from
      // another origin, so a canvas could not read it).
      const bmp = await createImageBitmap(await (await fetch(el.currentSrc || el.src)).blob());
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      const [r, , b] = g.getImageData(4, Math.floor(bmp.height / 2), 1, 1).data;
      return { width: el.naturalWidth, height: el.naturalHeight, blue: b > 200 && r < 80 };
    });
}

/** The drawn picture keeps its shape: its painted area is as wide for its height as the file is. */
async function expectNotStretched(page, where) {
  const ratio = await head(page)
    .getByTestId('header-logo')
    .locator('img')
    .evaluate((el) => {
      const box = el.getBoundingClientRect();
      const k = Math.min(box.width / el.naturalWidth, box.height / el.naturalHeight); // object-fit: contain
      return { file: el.naturalWidth / el.naturalHeight, drawn: (el.naturalWidth * k) / (el.naturalHeight * k) };
    });
  expect(Math.abs(ratio.drawn - ratio.file), where).toBeLessThan(0.01);
}

test('R495-a the owner saves a logo: it shows top-left at once on a phone and a computer, light and dark, and survives a reload', async ({ page }) => {
  await openApp(page);
  await startOnlineGym(page);
  const logos = { next: await logoPng(page, true) };
  await fakeLogoBucket(page.context(), logos);

  // Negative: no logo yet: no box, the name alone, as before.
  const bar = page.getByRole('banner');
  await expect(bar).toContainText(OWNER.gym);
  await expect(bar.getByTestId('header-logo')).toHaveCount(0);
  const barHeight = (await bar.boundingBox()).height;
  const plainName = await nameSize(page);
  await shot(page, 'phone-no-logo', { x: 0, y: 0, width: 390, height: 140 });

  // Happy path: Save in Branding -> the top bar shows the logo straight away, no reload.
  await saveLogo(page, logos.next, 'shakti-wide.png');
  await expectNeatLogo(page, 'phone, right after Save');
  await expectNotStretched(page, 'phone, a wide logo');
  expect((await bar.boundingBox()).height, 'the top bar did not grow').toBeLessThanOrEqual(barHeight + 1);
  await expectFitsPhone(page, 'with the logo in the top bar');
  expect(await nameSize(page), 'phone: the gym name keeps its size beside the logo').toEqual(plainName);
  await shot(page, 'phone-header', { x: 0, y: 0, width: 390, height: 140 });

  // Every page: Today, Members.
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expectNeatLogo(page, 'phone, Today');
  // Fresh eyes (14 Nov 2026): the first card on a phone said "Install the admin app on this computer". R-526: Get started
  // has its own page now, so the install banner shows on Today at once.
  await expect(page.getByRole('heading', { name: 'Put the admin app on your phone', exact: true })).toBeVisible();
  await expect(page.getByText(/this computer/)).toHaveCount(0);
  await shot(page, 'phone-today');
  await page.goto('./#/members');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNeatLogo(page, 'phone, Members');

  // Interruption: a reload keeps the logo.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  await expectNeatLogo(page, 'phone, after a reload');

  // Light look (a setting change): still neat, still visible.
  await page.getByRole('banner').getByRole('radio', { name: 'Light' }).tap();
  await expectNeatLogo(page, 'phone, light');
  await shot(page, 'phone-header-light', { x: 0, y: 0, width: 390, height: 140 });

  // A computer: the top of the side menu, light then dark.
  await page.setViewportSize(COMPUTER);
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expectNeatLogo(page, 'computer, light');
  await expectNotStretched(page, 'computer, a wide logo');
  await shot(page, 'computer-header-light', { x: 0, y: 0, width: 520, height: 160 });
  await shot(page, 'computer-light');
  await page.getByRole('radio', { name: 'Dark' }).first().click();
  await expectNeatLogo(page, 'computer, dark');
  await shot(page, 'computer-header', { x: 0, y: 0, width: 520, height: 160 });
  await shot(page, 'computer');
  // The install card on a computer still says "this computer" (only the phone's word changed).
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Install the admin app on this computer', exact: true })).toBeVisible();

  // Fresh eyes (14 Nov 2026): "More below" sat over the menu's last row (Settings). Scrolled to the end, the last
  // row is whole, clear of the fade, and "More below" has gone.
  // A short window (a laptop with a bookmarks bar and the taskbar), so the menu is longer than the window.
  await page.setViewportSize({ width: 1366, height: 600 });
  const nav = page.getByRole('navigation', { name: 'Main' });
  const rows = nav.locator('[data-sidebar-rows]');
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'More below' })).toBeVisible();
  await shot(page, 'computer-menu-top', { x: 0, y: 0, width: 260, height: 600 });
  await rows.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(nav.getByRole('button', { name: 'More below' })).toHaveCount(0);
  const list = await rows.boundingBox();
  const last = await rows.locator('a').last().boundingBox();
  expect(last.y + last.height, 'the last menu row ends inside the menu box, above where the fade was').toBeLessThanOrEqual(list.y + list.height - 20);
  await shot(page, 'computer-menu-end', { x: 0, y: 0, width: 260, height: 600 });
});

test('R495-b a new logo replaces the old one at once; a removed logo leaves the name alone; the desk sees the logo too', async ({ page, browser }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  const logos = { next: await logoPng(page, false) };
  await fakeLogoBucket(page.context(), logos);

  await saveLogo(page, logos.next, 'badge.png');
  await expectNeatLogo(page, 'phone, the first logo');
  const first = await page.getByRole('banner').getByTestId('header-logo').locator('img').getAttribute('src');
  expect(await drawnLogo(page)).toMatchObject({ width: 256, height: 256, blue: false });
  await shot(page, 'phone-header-first', { x: 0, y: 0, width: 390, height: 140 });

  // Edit: a clearly different logo (blue "IRON"), saved -> the top bar shows the new picture, no reload.
  logos.next = await logoPng(page, 'blue');
  await saveLogo(page, logos.next, 'iron-blue.png');
  const img = page.getByRole('banner').getByTestId('header-logo').locator('img');
  await expect.poll(() => img.getAttribute('src')).not.toBe(first);
  await expectNeatLogo(page, 'phone, the changed logo');
  await expect.poll(() => drawnLogo(page), { message: 'the top bar draws the new blue logo, not the old badge' }).toMatchObject({ width: 300, height: 150, blue: true });
  await shot(page, 'phone-header-changed', { x: 0, y: 0, width: 390, height: 140 });

  // Another role: the desk, on its own phone, gets the same logo.
  await addDeskPerson(page);
  const desk = await secondPhone(browser, server);
  await fakeLogoBucket(desk.context(), logos);
  await signIn(desk, DESK.phone);
  await expectNeatLogo(desk, 'the desk phone');
  await shot(desk, 'desk-phone-header', { x: 0, y: 0, width: 390, height: 140 });
  await desk.context().close();

  // Negative: Remove logo + Save -> no box, the name alone.
  await page.goto('./#/settings/branding');
  await page.getByRole('button', { name: 'Remove logo' }).tap();
  await page.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(page.getByText('Saved.', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('banner').getByTestId('header-logo')).toHaveCount(0);
  await expect(page.getByRole('banner')).toContainText(OWNER.gym);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Branding', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('banner').getByTestId('header-logo')).toHaveCount(0);
  await shot(page, 'phone-header-removed', { x: 0, y: 0, width: 390, height: 140 });

  // Fresh eyes (14 Nov 2026): the name keeps one size on a computer too, logo or not (15 px, as on the phone).
  await page.setViewportSize(COMPUTER);
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  const noLogo = await nameSize(page);
  expect(noLogo.font).toBe('15px');
  await shot(page, 'computer-header-no-logo', { x: 0, y: 0, width: 520, height: 160 });
  logos.next = await logoPng(page, 'blue');
  await saveLogo(page, logos.next, 'iron-blue-2.png');
  await page.goto('./#/');
  await expectNeatLogo(page, 'computer, the logo back');
  expect(await nameSize(page), 'computer: the gym name keeps its size beside the logo').toEqual(noLogo);
  await shot(page, 'computer-header-logo-back', { x: 0, y: 0, width: 520, height: 160 });
});
