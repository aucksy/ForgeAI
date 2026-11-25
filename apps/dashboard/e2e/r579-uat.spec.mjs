// R-579 UAT (owner, 15 Nov 2026): "a permanent share app link button on each member's profile" and ONE smart app link.
// Pictures for a person to read: e2e/.results/uat/r579-*.png (CI keeps them as dashboard-uat-pictures).
//  1. The member page: "Share app link" (WhatsApp icon) among the main buttons, for a member not on the app and one already
//     on it (words for a new phone), WhatsApp opening on that member's chat with the smart link and the gym code; the old
//     "Send app invite" link is gone; greyed out with "Needs internet" when the gym server cannot be reached. Phone and
//     computer, light and dark.
//  2. The gym link /j/<CODE> as each phone sees it: Android (the app button, unchanged), iPhone ("coming soon" + what works
//     today), an iPad asking for the computer site, a computer (a QR code of the link + both stores), and the iPhone going
//     straight to the App Store once APP_STORE_URL is set.
//  3. The app link /app (public/get-app.html) on an iPhone and a computer, and with the App Store set.
// The Worker's own device rules (User-Agent, redirects, link previews) are pinned in deploy/panel/appLink.test.mjs.
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { addMember, expectFitsPhone, openApp, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r579-${name}.png`, fullPage });
}

const PLAY = 'https://play.google.com/store/apps/details?id=com.mettleup.app';
const STORE = 'https://apps.apple.com/in/app/mettleup/id6700000000';
const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
const PHONE = { width: 390, height: 844 };
const COMPUTER = { width: 1280, height: 900 };

// ---------------------------------------------------------------- 1. the member page

/** WhatsApp's page, answered here; returns the text of the next wa.me page the panel opens. */
async function nextWhatsApp(page, click) {
  await page.context().route('https://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' }));
  const opened = page.context().waitForEvent('page');
  await click();
  const wa = await opened;
  await wa.waitForLoadState('domcontentloaded').catch(() => undefined);
  const url = new URL(wa.url());
  await wa.close();
  return { to: url.pathname.replace(/^\//, ''), text: url.searchParams.get('text') ?? '' };
}

const shareButton = (page) => page.getByRole('button', { name: 'Share app link', exact: true });

/** The member's record as the gym server has it, now linked to an app account (the member joined in the app). */
function linkToApp(server, fullName) {
  const r = [...server.records.values()].find((x) => x.k === 'member' && !x.x && x.d.fullName === fullName);
  server.version += 1;
  server.records.set(`member:${r.id}`, { ...r, d: { ...r.d, appUserId: '0b8c1c1e-5790-4222-8333-000000000579' }, ver: server.version });
}

async function setLook(page, mode) {
  await page.evaluate((m) => localStorage.setItem('forgeai.theme.v1', m), mode);
  await page.reload();
}

test('R579-1 the member page: "Share app link" for every member, the smart link and the gym code, phone and computer, light and dark', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const server = await openApp(page);
  await startOnlineGym(page);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  const code = server.gym.joinCode;
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // Not on the app yet: the button is there, the old small link is not.
  const button = shareButton(page);
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await expect(page.getByText('Send app invite')).toHaveCount(0);
  await expect(button.locator('svg')).toHaveCount(1);
  await expectFitsPhone(page, 'on the member page');
  const first = await nextWhatsApp(page, () => button.click());
  expect(first.to, 'WhatsApp opens on this member’s chat').toBe('919829011111');
  expect(first.text).toBe(
    ['Hi Asha!', 'Get the free MettleUp app from Shakti Gym to track your workouts.', '', 'Tap to get the app:', 'https://app.mettleup.fit/app', '', 'Then open the app, tap "Continue with your phone number" and use this same number. The app connects you to Shakti Gym by itself.', '', `Gym code, only if the app asks for it: ${code}`].join('\n'),
  );
  await button.scrollIntoViewIfNeeded();
  await shot(page, 'member-page-phone-dark');

  // Already on the app: the same button, words for a new phone or a reinstall.
  linkToApp(server, 'Asha Verma');
  await setLook(page, 'light');
  await expect(page.getByText('Using the app')).toBeVisible({ timeout: 15_000 });
  await expect(shareButton(page)).toBeVisible();
  const again = await nextWhatsApp(page, () => shareButton(page).click());
  expect(again.to).toBe('919829011111');
  expect(again.text).toBe(
    ['Hi Asha!', 'Here is the MettleUp app link from Shakti Gym, in case you need to install the app again or use a new phone.', '', 'Tap to get the app:', 'https://app.mettleup.fit/app', '', 'Then open the app, tap "Continue with your phone number" and use this same number. The app connects you to Shakti Gym by itself.', '', `Gym code, only if the app asks for it: ${code}`].join('\n'),
  );
  await shareButton(page).scrollIntoViewIfNeeded();
  await shot(page, 'member-page-on-app-phone-light');

  // A computer, light then dark: the button sits with Check in, Archive member and Member card.
  await page.setViewportSize(COMPUTER);
  await expect(shareButton(page)).toBeVisible();
  const box = await shareButton(page).boundingBox();
  const card = await page.getByRole('button', { name: 'Member card', exact: true }).boundingBox();
  expect(Math.abs(box.x - card.x), 'in the same column as Member card').toBeLessThanOrEqual(2);
  expect(box.y).toBeGreaterThan(card.y);
  await shot(page, 'member-page-computer-light');
  await setLook(page, 'dark');
  await expect(shareButton(page)).toBeVisible({ timeout: 15_000 });
  await shot(page, 'member-page-computer-dark');

  // Negative: no internet to the gym server: greyed out, "Needs internet" under it; back again when the server is.
  await page.setViewportSize(PHONE);
  server.disconnect();
  await page.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(shareButton(page)).toBeDisabled({ timeout: 20_000 });
  await expect(shareButton(page).locator('xpath=..')).toContainText('Needs internet');
  await shareButton(page).scrollIntoViewIfNeeded();
  await shot(page, 'member-page-offline-phone-dark');
  server.reconnect();
  await expect(shareButton(page)).toBeEnabled({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- 2 and 3. the links, as each phone sees them

const PUB = new URL('../public/', import.meta.url);
const GYM = { gymName: 'Shakti Gym', joinCode: 'QA0002', brand: { accent: '#0E7C66' } };
const OPEN_GYM = { ...GYM, closed: false, plans: [{ id: 'p1', name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 150000, joiningFeeP: 0, totalP: 150000 }] };

/** app.mettleup.fit as the Worker serves it: the page, with window.__APP__ (and the gym) written in before its script runs. */
async function serve(context, { device, appStore = '' }) {
  const stores = [];
  await context.route('https://hdxzqbdiokjklnypfisq.supabase.co/rest/v1/rpc/self_join_preview', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OPEN_GYM) }),
  );
  await context.route(/^https:\/\/(play\.google\.com|apps\.apple\.com)\//, (r) => {
    stores.push(r.request().url());
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Store</p>' });
  });
  await context.route(/^https:\/\/app\.mettleup\.fit\//, (route) => {
    const path = new URL(route.request().url()).pathname;
    const html = (f) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(new URL(f, PUB)) });
    if (/^\/j\/[A-Za-z0-9]{6}$/.test(path)) return html('join.html');
    if (path === '/app') return html('get-app.html');
    if (path === '/vendor/qrcode-generator-2.0.4.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(new URL('vendor/qrcode-generator-2.0.4.js', PUB)) });
    if (path === '/brand/mark.svg') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: readFileSync(new URL('brand/mark.svg', PUB)) });
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  await context.addInitScript(
    ([gym, app]) => {
      window.__GYM__ = gym;
      window.__APP__ = app;
    },
    [GYM, { device, play: PLAY, appStore }],
  );
  return stores;
}

async function phoneAs(browser, ua, { viewport = PHONE, touch = true, touchPoints } = {}) {
  const context = await browser.newContext({ userAgent: ua, viewport, isMobile: viewport.width < 800, hasTouch: touch, locale: 'en-IN', deviceScaleFactor: 2 });
  if (touchPoints) await context.addInitScript((n) => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => n }), touchPoints);
  return context;
}

test('R579-2 the gym link on Android, iPhone, an iPad and a computer', async ({ browser }) => {
  // Android: unchanged, the button that opens the app.
  const android = await phoneAs(browser, UA.android);
  await serve(android, { device: 'android' });
  const a = await android.newPage();
  await a.goto('https://app.mettleup.fit/j/QA0002');
  await expect(a.locator('#title')).toHaveText('Shakti Gym');
  await expect(a.locator('#open')).toBeVisible();
  await expect(a.locator('#open')).toHaveAttribute('href', /^intent:\/\/j\/QA0002#Intent;scheme=mettleup;package=com\.mettleup\.app;/);
  await expect(a.locator('#iphone')).toBeHidden();
  await expect(a.locator('#computer')).toBeHidden();
  await shot(a, 'gym-link-android');
  await android.close();

  // iPhone today: "coming soon", the gym's name, what works now ("Become a member" when the gym has it), the code.
  const iphone = await phoneAs(browser, UA.iphone);
  const iStores = await serve(iphone, { device: 'ios' });
  const i = await iphone.newPage();
  await i.goto('https://app.mettleup.fit/j/QA0002');
  await expect(i.locator('#iphone')).toBeVisible();
  await expect(i.locator('#iphone')).toContainText('The iPhone app is coming soon');
  await expect(i.locator('#iphone')).toContainText('Until then, the front desk at Shakti Gym can add you as a member.');
  await expect(i.locator('#open')).toBeHidden();
  await expect(i.locator('#computer')).toBeHidden();
  await expect(i.locator('#become-card')).toBeVisible();
  await expect(i.locator('#code-head')).toContainText('Your gym’s code');
  await expect(i.locator('#code')).toHaveText('QA0002');
  await expect(i.locator('#code-note')).toContainText('Keep this code. You type it in the MettleUp app to join your gym.');
  await expectFitsPhone(i, 'on the iPhone gym page');
  await shot(i, 'gym-link-iphone-coming-soon', true);
  expect(iStores).toEqual([]);
  await iphone.close();

  // An iPad asking for the computer site ("Macintosh", a touch screen) is an iPhone/iPad visitor too.
  const ipad = await phoneAs(browser, UA.ipadDesktop, { viewport: { width: 820, height: 1180 }, touchPoints: 5 });
  await serve(ipad, { device: 'other' });
  const p = await ipad.newPage();
  await p.goto('https://app.mettleup.fit/j/QA0002');
  await expect(p.locator('#iphone')).toBeVisible();
  await expect(p.locator('#computer')).toBeHidden();
  await ipad.close();

  // A computer: a QR code of this very link, Google Play, and the App Store "coming soon".
  const pc = await phoneAs(browser, UA.windows, { viewport: COMPUTER, touch: false });
  const pcStores = await serve(pc, { device: 'other' });
  const c = await pc.newPage();
  await c.goto('https://app.mettleup.fit/j/QA0002');
  await expect(c.locator('#computer')).toBeVisible();
  await expect(c.locator('#qr svg')).toBeVisible();
  await expect(c.locator('#qr')).toHaveAttribute('data-link', 'https://app.mettleup.fit/j/QA0002');
  await expect(c.locator('#play')).toHaveAttribute('href', PLAY);
  await expect(c.locator('#appstore-soon')).toContainText('Coming soon');
  await expect(c.locator('#appstore')).toBeHidden();
  await expect(c.locator('#open')).toBeHidden();
  await expect(c.locator('#iphone')).toBeHidden();
  await shot(c, 'gym-link-computer', true);
  expect(pcStores).toEqual([]);
  await pc.close();

  // The day the iPhone app is out (APP_STORE_URL set): an iPad that says "Macintosh" goes straight to the App Store,
  // and a computer shows the real App Store button.
  const ipad2 = await phoneAs(browser, UA.ipadDesktop, { viewport: { width: 820, height: 1180 }, touchPoints: 5 });
  const padStores = await serve(ipad2, { device: 'other', appStore: STORE });
  const p2 = await ipad2.newPage();
  await p2.goto('https://app.mettleup.fit/j/QA0002');
  await expect.poll(() => padStores).toEqual([STORE]);
  await ipad2.close();
  const pc2 = await phoneAs(browser, UA.windows, { viewport: COMPUTER, touch: false });
  await serve(pc2, { device: 'other', appStore: STORE });
  const c2 = await pc2.newPage();
  await c2.goto('https://app.mettleup.fit/j/QA0002');
  await expect(c2.locator('#appstore')).toBeVisible();
  await expect(c2.locator('#appstore')).toHaveAttribute('href', STORE);
  await expect(c2.locator('#appstore-soon')).toBeHidden();
  await shot(c2, 'gym-link-computer-app-store-set', true);
  await pc2.close();
});

test('R579-3 the app link /app on an iPhone and a computer, and once the App Store is set', async ({ browser }) => {
  const iphone = await phoneAs(browser, UA.iphone);
  const iStores = await serve(iphone, { device: 'ios' });
  const i = await iphone.newPage();
  await i.goto('https://app.mettleup.fit/app');
  await expect(i.locator('#ios')).toBeVisible();
  await expect(i.locator('#ios h1')).toHaveText('The iPhone app is coming soon');
  await expect(i.locator('#ios')).toContainText('If you train at a gym, ask the front desk to add you as a member.');
  await expect(i.locator('#play')).toBeHidden();
  await expect(i.locator('#appstore-soon')).toBeVisible();
  await expect(i.locator('#computer')).toBeHidden();
  await expectFitsPhone(i, 'on the iPhone app page');
  await shot(i, 'app-link-iphone-coming-soon', true);
  expect(iStores).toEqual([]);
  await iphone.close();

  const pc = await phoneAs(browser, UA.windows, { viewport: COMPUTER, touch: false });
  await serve(pc, { device: 'other' });
  const c = await pc.newPage();
  await c.goto('https://app.mettleup.fit/app');
  await expect(c.locator('#computer')).toBeVisible();
  await expect(c.locator('#qr svg')).toBeVisible();
  await expect(c.locator('#qr')).toHaveAttribute('data-link', 'https://app.mettleup.fit/app');
  await expect(c.locator('#addr')).toHaveText('app.mettleup.fit/app');
  await expect(c.locator('#play')).toBeVisible();
  await expect(c.locator('#appstore-soon')).toBeVisible();
  await shot(c, 'app-link-computer', true);
  await pc.close();

  // A computer at phone width still fits (a narrow browser window).
  const narrow = await phoneAs(browser, UA.windows, { viewport: PHONE, touch: false });
  await serve(narrow, { device: 'other' });
  const n = await narrow.newPage();
  await n.goto('https://app.mettleup.fit/app');
  await expect(n.locator('#qr svg')).toBeVisible();
  await expectFitsPhone(n, 'on the app page, narrow');
  await narrow.close();

  // An Android browser that reaches the page anyway (an in-app browser taken for a preview) still goes to Google Play.
  const android = await phoneAs(browser, UA.android);
  const aStores = await serve(android, { device: 'bot' });
  await (await android.newPage()).goto('https://app.mettleup.fit/app');
  await expect.poll(() => aStores).toEqual([PLAY]);
  await android.close();

  // The App Store set: an iPhone that reaches the page goes straight there.
  const out = await phoneAs(browser, UA.iphone);
  const outStores = await serve(out, { device: 'ios', appStore: STORE });
  await (await out.newPage()).goto('https://app.mettleup.fit/app');
  await expect.poll(() => outStores).toEqual([STORE]);
  await out.close();
});
