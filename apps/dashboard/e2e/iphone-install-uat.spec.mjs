// R-446 (owner, 10 Nov 2026, on his iPhone) UAT: the admin app's install steps, the iPhone sign-in note, and
// "new" dots only for news after the gym joined. Chromium with an iPhone user agent (390 px, touch: CI installs
// only Chromium; the app decides "iPhone" from the user agent and touch points, which is what is faked here).
// Pictures go to e2e/.results/uat (CI uploads them as "dashboard-uat-pictures"), named r446-*.png.
//
// UAT types: happy path (iPhone Settings shows the numbered steps at once, no button; the Today banner opens them
// with "Show me how"), negative (Android keeps its "Install the admin app" button and no steps until tapped; the
// sign-in note is NOT shown in Safari, on Android in app mode, or on a computer; a brand-new gym gets no dots),
// regression (an older gym still gets its dots; iPhone Chrome gets its own first step), edge (375 px phone, large
// text), setting change (opened as the home-screen app: Settings says it is installed, sign-in says why once more).
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { bottomBar, expectFitsPhone, openApp, openSettings, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

const SAFARI_STEPS = [
  'Tap the 3 dots ••• in the address bar at the bottom of Safari. (If you see a square with an arrow up, tap that instead.)',
  'Tap “Share”.',
  'Scroll down the list. Tap “Add to Home Screen”.',
  'Keep “Open as Web App” on. Tap “Add”.',
  'Open MettleUp Admin from your home screen. Sign in once more there. (iPhone keeps it apart from Safari.)',
];
const ANDROID_STEPS = ['In Chrome, tap ⋮ at the top right.', 'Tap “Add to Home screen” or “Install app”.', 'Tap “Install”.'];
const NOTE =
  'Welcome to the admin app. Please sign in once more here. iPhone keeps this app apart from Safari. After this, you stay signed in.';

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r446-${name}.png`, fullPage });
}

/** The install card (the innermost box holding its title and its first line). */
const installCard = (page) =>
  page
    .getByRole('main')
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: 'Put the admin app on your phone', exact: true }) })
    .filter({ hasText: 'Put the admin app on your home screen.' })
    .last();
// The list carries role="status" (so a screen reader reads it out when it opens), so it is found as an <ol>.
const stepsList = (card) => card.locator('ol');

/** Every step, word for word, in order. */
async function expectSteps(card, steps) {
  const items = stepsList(card).locator('li');
  await expect(items).toHaveText(steps);
}

/** Nothing in the card reaches past the right edge of the screen, and no text box is clipped. */
async function expectCardFits(page, card, where) {
  const bad = await card.evaluate((el) => {
    const out = [];
    const right = window.innerWidth;
    for (const n of [el, ...el.querySelectorAll('*')]) {
      const r = n.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > right + 1 || r.left < -1) out.push(`${n.tagName} ${Math.round(r.left)}..${Math.round(r.right)} > ${right}`);
      if (n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflowX !== 'visible') out.push(`${n.tagName} clipped`);
    }
    return out;
  });
  expect(bad, `install card fits ${where}`).toEqual([]);
}

/** Large text: the whole page drawn 1.3x (iPhone "Larger Text" / Android font 1.3), then measured. */
async function largeText(page) {
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.3';
  });
}

/** Opened as the home-screen app (iPhone Safari sets navigator.standalone). */
async function asHomeScreenApp(page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
  });
}

test.describe('iPhone Safari', () => {
  test.use({ userAgent: IPHONE_SAFARI });

  test('R446-a Settings shows the numbered steps at once, with no button; fits at 375 px and with large text', async ({ page }) => {
    await openApp(page);
    // Negative: plain Safari (not the home-screen app) never shows the "sign in once more" note.
    await expect(page.getByRole('note')).toHaveCount(0);
    await startOnlineGym(page);
    await openSettings(page, 'Sign-in & data');
    const card = installCard(page);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toContainText('Put the admin app on your home screen. It opens full screen, in one tap.');
    await expectSteps(card, SAFARI_STEPS);
    // No dead button: nothing to tap in the card (the steps ARE the way on an iPhone).
    await expect(card.getByRole('button')).toHaveCount(0);
    await expectFitsPhone(page, 'on Settings with the iPhone steps');
    await expectCardFits(page, card, 'at 390 px');
    await card.screenshot({ path: `${DIR}/r446-iphone-settings-card.png` });
    await shot(page, 'iphone-settings-page');

    await page.setViewportSize({ width: 375, height: 812 });
    await card.scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'on Settings at 375 px');
    await expectCardFits(page, card, 'at 375 px');
    await card.screenshot({ path: `${DIR}/r446-iphone-settings-card-375.png` });

    await largeText(page);
    await card.scrollIntoViewIfNeeded();
    await expectCardFits(page, card, 'at 375 px with large text');
    await card.screenshot({ path: `${DIR}/r446-iphone-settings-card-375-large-text.png` });
  });

  test('R446-b the Today banner: "Show me how" opens the steps; "Not now" stays; then it closes for good', async ({ page }) => {
    await openApp(page);
    await startOnlineGym(page);
    const card = installCard(page);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toContainText('Put the admin app on your home screen. It opens full screen, in one tap.');
    await expect(stepsList(card)).toHaveCount(0);
    await expect(card.getByRole('button')).toHaveText(['Show me how', 'Not now']);
    await expectCardFits(page, card, 'Today banner before');
    await card.screenshot({ path: `${DIR}/r446-iphone-today-banner-before.png` });
    await shot(page, 'iphone-today-before');

    await card.getByRole('button', { name: 'Show me how' }).tap();
    await expectSteps(card, SAFARI_STEPS);
    // The button that opened them goes (it would do nothing more); "Not now" stays to close the banner.
    await expect(card.getByRole('button')).toHaveText(['Not now']);
    await expectFitsPhone(page, 'on Today with the steps open');
    await expectCardFits(page, card, 'Today banner after');
    await card.screenshot({ path: `${DIR}/r446-iphone-today-banner-after.png` });
    await shot(page, 'iphone-today-after');

    await page.setViewportSize({ width: 375, height: 812 });
    await largeText(page);
    await card.scrollIntoViewIfNeeded();
    await expectCardFits(page, card, 'Today banner at 375 px with large text');
    await card.screenshot({ path: `${DIR}/r446-iphone-today-banner-375-large-text.png` });

    // "Not now": gone, also after a reload (interruption).
    await card.getByRole('button', { name: 'Not now' }).tap();
    await expect(page.getByRole('heading', { name: 'Put the admin app on your phone', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Put the admin app on your phone', exact: true })).toHaveCount(0);
  });

  test('R446-c the home-screen app: sign-in says why once more; Settings says the app is installed', async ({ page }) => {
    await asHomeScreenApp(page);
    await openApp(page);
    const note = page.getByRole('note');
    await expect(note).toHaveText(NOTE);
    await expect(note).toBeVisible();
    await expectFitsPhone(page, 'on sign-in in the home-screen app');
    await shot(page, 'iphone-app-signin-note');
    await page.setViewportSize({ width: 375, height: 812 });
    await largeText(page);
    await expectFitsPhone(page, 'on sign-in at 375 px with large text');
    const right = await note.evaluate((el) => el.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(375 + 1);
    await shot(page, 'iphone-app-signin-note-375-large-text');
    await page.evaluate(() => {
      document.documentElement.style.zoom = '';
    });
    await page.setViewportSize({ width: 390, height: 844 });

    // Signed in inside the app: no install card on Today, and Settings says it is on the home screen.
    await startOnlineGym(page);
    await expect(page.getByRole('heading', { name: 'Put the admin app on your phone', exact: true })).toHaveCount(0);
    await openSettings(page, 'Sign-in & data');
    await expect(page.getByText('The admin app is on your home screen. Open it from the MettleUp Admin icon.')).toBeVisible();
    await shot(page, 'iphone-app-settings-installed');
  });
});

test.describe('iPhone Chrome', () => {
  test.use({ userAgent: IPHONE_CHROME });

  test('R446-d Chrome on iPhone: the Share icon is in the address bar (no ••• step)', async ({ page }) => {
    await openApp(page);
    await startOnlineGym(page);
    await openSettings(page, 'Sign-in & data');
    const card = installCard(page);
    await card.scrollIntoViewIfNeeded();
    await expectSteps(card, [
      'Tap the Share icon (a square with an arrow up) at the top, in the address bar.',
      'Scroll down the list. Tap “Add to Home Screen”.',
      'Keep “Open as Web App” on. Tap “Add”.',
      'Open MettleUp Admin from your home screen. Sign in once more there. (iPhone keeps it apart from Safari.)',
    ]);
    await expect(card.getByRole('button')).toHaveCount(0);
    await card.screenshot({ path: `${DIR}/r446-iphone-chrome-settings-card.png` });
  });
});

test.describe('Android Chrome', () => {
  test.use({ userAgent: ANDROID_CHROME });

  test('R446-e Android opened as an installed app: no iPhone sign-in note', async ({ page }) => {
    await asHomeScreenApp(page); // even with the app flag set, an Android phone gets no iPhone note
    await openApp(page);
    await expect(page.getByRole('note')).toHaveCount(0);
    await shot(page, 'android-app-signin-no-note');
  });

  test('R446-f Android Settings card: button first, the 3 steps after a tap (button stays: Chrome may open its sheet)', async ({ page }) => {
    await openApp(page);
    await startOnlineGym(page);
    await openSettings(page, 'Sign-in & data');
    const card = installCard(page);
    await card.scrollIntoViewIfNeeded();
    await expect(stepsList(card)).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Install the admin app' })).toBeVisible();
    await expectCardFits(page, card, 'Android before');
    await card.screenshot({ path: `${DIR}/r446-android-settings-card-before.png` });
    await card.getByRole('button', { name: 'Install the admin app' }).tap();
    await expectSteps(card, ANDROID_STEPS);
    await expect(card.getByRole('button', { name: 'Install the admin app' })).toBeVisible();
    await expectFitsPhone(page, 'on Settings, Android, steps open');
    await expectCardFits(page, card, 'Android after');
    await card.screenshot({ path: `${DIR}/r446-android-settings-card-after.png` });

    // The Today banner on Android: the same button, and "Not now".
    await bottomBar(page).getByRole('link', { name: /^Today/ }).tap();
    const banner = installCard(page);
    await banner.scrollIntoViewIfNeeded();
    await expect(banner.getByRole('button')).toHaveText(['Install the admin app', 'Not now']);
    await banner.screenshot({ path: `${DIR}/r446-android-today-banner.png` });
  });
});

test.describe('computer', () => {
  test('R446-g a computer: no iPhone note at sign-in; Settings keeps its install button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openApp(page);
    await expect(page.getByRole('note')).toHaveCount(0);
    await shot(page, 'computer-signin-no-note');
    // Create my gym on the phone-size page (support.mjs reads the phone's top bar), then the computer width.
    await page.setViewportSize({ width: 390, height: 844 });
    await startOnlineGym(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      window.location.hash = '/settings/data';
    });
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    const card = installCard(page);
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole('button', { name: 'Install the admin app' })).toBeVisible();
    await expect(stepsList(card)).toHaveCount(0);
    await shot(page, 'computer-settings');
  });
});

// The "new" dots (R-446): only news dated AFTER the day the gym was set up. The pretend server's gym is set up on
// 17 Oct (support.mjs); here it is moved to the day being tested.
const DOT = '[data-new-dot]';
const NOV7 = new Date('2026-11-06T22:00:00+05:30');

test('R446-h a brand-new gym (set up today) sees no "new" dots anywhere; an older gym still does', async ({ page, browser }) => {
  const server = await openApp(page, { time: NOV7 });
  server.gym.createdAt = NOV7.toISOString();
  await startOnlineGym(page);
  await expect(page.locator(DOT)).toHaveCount(0);
  await shot(page, 'new-gym-today-no-dots');
  await bottomBar(page).getByRole('link', { name: /^More/ }).tap();
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible();
  await expect(page.locator(DOT)).toHaveCount(0);
  await shot(page, 'new-gym-more-no-dots', true);
  await page.getByRole('main').getByRole('link', { name: /^Settings/ }).tap();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator(DOT)).toHaveCount(0);
  await shot(page, 'new-gym-settings-no-dots');

  // A gym set up on 5 Nov (noon): the 6 Nov features are new to it (More lit), the 5 Nov one is not (Members dark).
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'en-IN', timezoneId: 'Asia/Kolkata', baseURL: test.info().project.use.baseURL });
  const p2 = await ctx.newPage();
  const s2 = await openApp(p2, { time: NOV7 });
  s2.gym.createdAt = new Date('2026-11-05T12:00:00+05:30').toISOString();
  await startOnlineGym(p2);
  const bar = bottomBar(p2);
  await expect(bar.getByRole('link', { name: /^More/ }).locator(DOT)).toHaveCount(1);
  await expect(bar.getByRole('link', { name: /^Members/ }).locator(DOT)).toHaveCount(0);
  await shot(p2, 'gym-from-5-nov-today');
  await ctx.close();

  // Regression: an older gym (set up 17 Oct) keeps both dots.
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'en-IN', timezoneId: 'Asia/Kolkata', baseURL: test.info().project.use.baseURL });
  const p3 = await ctx3.newPage();
  await openApp(p3, { time: NOV7 });
  await startOnlineGym(p3);
  await expect(bottomBar(p3).getByRole('link', { name: /^More/ }).locator(DOT)).toHaveCount(1);
  await expect(bottomBar(p3).getByRole('link', { name: /^Members/ }).locator(DOT)).toHaveCount(1);
  await shot(p3, 'older-gym-today-dots');
  await ctx3.close();
});

test('R446-i the real day: a gym set up on 10 Nov 2026 sees no dots on Today, More or Settings', async ({ page }) => {
  const now = new Date('2026-11-10T19:00:00+05:30');
  const server = await openApp(page, { time: now });
  server.gym.createdAt = new Date('2026-11-10T18:55:00+05:30').toISOString();
  await startOnlineGym(page);
  await expect(page.locator(DOT)).toHaveCount(0);
  await bottomBar(page).getByRole('link', { name: /^More/ }).tap();
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible();
  await expect(page.locator(DOT)).toHaveCount(0);
  await shot(page, 'new-gym-10-nov-more-no-dots', true);
});
