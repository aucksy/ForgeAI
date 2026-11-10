// R-447 (10 Nov 2026) UAT: three findings of the R-446 fresh-eyes review.
//  1. Sign-in page: "Sign in" is the one form and the one bright button. "Set up a new gym" is a quiet link under a
//     line "New to MettleUp?"; the set-up form has "Already use MettleUp?" -> "Sign in" under it.
//  2. Computer menu: an owner's whole menu fits at 1366x768 and 1280x720 (shorter rows, Dark | Light beside the
//     bell); a real laptop window (1366x609: a 768-px screen minus the browser bar and the taskbar) shows "More
//     below". Every row can be seen whole and clicked; "What's new" sits under the rows, never over them. Phone: More shows "Help and feedback" above the bottom bar.
//  3. Settings -> Sign-in & data: "Download a backup" and "Your gym’s records" (were "Keep a copy of your data" and
//     "Your data").
// Pictures go to e2e/.results/uat (CI uploads them as "dashboard-uat-pictures"), named r447-*.png.
//
// UAT types: happy path (each door, each card), negative (no tabs, "Start demo" not bright, the old names gone, no
// shadow once the menu is scrolled to its end), regression (/start still opens the set-up form: trial.spec J97b;
// every journey that signs up goes through the new link: support.mjs startOnlineGym), setting change (Hinglish),
// edge (375 px phone, large text, short laptop window, a tall 1920x1080 screen where every row fits).
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { bottomBar, expectFitsPhone, openApp, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r447-${name}.png`, fullPage });
}

const PHONE = { width: 375, height: 812 };
const DESKTOPS = [
  { name: '1366x768', size: { width: 1366, height: 768 } },
  { name: '1280x720', size: { width: 1280, height: 720 } },
  { name: '1366x609', size: { width: 1366, height: 609 } },
];

const signInForm = (page) => page.locator('form').filter({ has: page.getByRole('button', { name: 'Sign in', exact: true }) });
const setUpLink = (page) => page.getByRole('button', { name: 'Set up a new gym', exact: true });
const signInLink = (page) => page.getByRole('button', { name: 'Sign in', exact: true });

/** The button's own paint: true when it is the bright (filled) kind. */
async function isBright(locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return s.backgroundImage !== 'none' || (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent');
  });
}

async function signInPage(page, where) {
  // Exact words, and the order: the sign-in form first, the quiet way to set up under it.
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByText('Sign in with your mobile number and your 6-digit PIN.')).toBeVisible();
  await expect(page.getByText('New to MettleUp?', { exact: true })).toBeVisible();
  await expect(setUpLink(page)).toBeVisible();
  // Negative: no tabs any more, and no set-up form until asked for.
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create my gym' })).toHaveCount(0);
  const form = await signInForm(page).boundingBox();
  const link = await setUpLink(page).boundingBox();
  expect(link.y, `"Set up a new gym" sits under the sign-in form ${where}`).toBeGreaterThan(form.y + form.height);
  expect(link.height, 'the link is big enough to tap').toBeGreaterThanOrEqual(44);
  // One bright button: "Sign in". "Set up a new gym" and "Start demo" are quiet.
  expect(await isBright(signInForm(page).getByRole('button', { name: 'Sign in', exact: true }))).toBe(true);
  expect(await isBright(setUpLink(page))).toBe(false);
  expect(await isBright(page.getByRole('button', { name: 'Start demo' }))).toBe(false);
}

async function setUpPage(page) {
  await expect(page.getByRole('heading', { name: 'New here? Set up your gym', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create my gym' })).toBeVisible();
  await expect(page.getByText('Already use MettleUp?', { exact: true })).toBeVisible();
  await expect(signInLink(page)).toBeVisible();
  await expect(setUpLink(page)).toHaveCount(0);
  await expect(page.getByLabel('PIN (6 digits)')).toHaveCount(0);
  expect(await isBright(page.getByRole('button', { name: 'Create my gym' }))).toBe(true);
  expect(await isBright(signInLink(page))).toBe(false);
}

test.describe('R447-1 sign-in page on a phone (375 px)', () => {
  test.use({ viewport: PHONE });

  test('Sign in is the main door; Set up a new gym is a quiet link under it; Hinglish; large text', async ({ page }) => {
    await openApp(page);
    await signInPage(page, 'on a 375 px phone');
    await expectFitsPhone(page, 'on the sign-in page at 375 px');
    await shot(page, 'phone-signin');
    await shot(page, 'phone-signin-full', true);

    await setUpLink(page).tap();
    await setUpPage(page);
    // The set-up form opens at the top of the page, not where the finger was.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expectFitsPhone(page, 'on the set-up form at 375 px');
    await shot(page, 'phone-setup');
    await shot(page, 'phone-setup-full', true);

    await signInLink(page).tap();
    await signInPage(page, 'after going back');

    // Hinglish: the same two lines in Hindi words.
    await page.getByRole('radio', { name: 'Hinglish' }).tap();
    await expect(page.getByText('MettleUp pe naye ho?', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Naya gym banao', exact: true })).toBeVisible();
    await shot(page, 'phone-signin-hinglish');
    await page.getByRole('button', { name: 'Naya gym banao', exact: true }).tap();
    await expect(page.getByText('Pehle se MettleUp use karte ho?', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in karo', exact: true })).toBeVisible();
    await shot(page, 'phone-setup-hinglish', true);
    await page.getByRole('button', { name: 'Sign in karo', exact: true }).tap();
    await page.getByRole('radio', { name: 'English' }).tap();

    // Large text (the whole page drawn 1.3x): still one column, nothing off the side.
    await page.evaluate(() => {
      document.documentElement.style.zoom = '1.3';
    });
    await expect(setUpLink(page)).toBeVisible();
    await expectFitsPhone(page, 'on the sign-in page with large text');
    await shot(page, 'phone-signin-large-text', true);
  });
});

test.describe('R447-1 sign-in page on a computer (1366x768)', () => {
  test.use({ viewport: DESKTOPS[0].size, isMobile: false });

  test('the same two doors on a computer', async ({ page }) => {
    await openApp(page);
    await signInPage(page, 'on a computer');
    await shot(page, 'computer-signin');
    await setUpLink(page).click();
    await setUpPage(page);
    await shot(page, 'computer-setup', true);
  });
});

/** Every menu row, seen whole inside the rows' box and above "What's new", and the top thing at its middle. */
async function expectEveryRowClickable(page, where) {
  const menu = page.getByRole('navigation', { name: 'Main' });
  const rows = menu.locator('[data-sidebar-rows]');
  const foot = menu.locator('[data-sidebar-foot]');
  const links = rows.getByRole('link');
  const n = await links.count();
  expect(n, 'an owner has at least 15 menu rows').toBeGreaterThanOrEqual(15);
  const names = [];
  for (let i = 0; i < n; i++) {
    const link = links.nth(i);
    await link.scrollIntoViewIfNeeded();
    const name = (await link.innerText()).split('\n')[0].trim();
    names.push(name);
    const r = await link.boundingBox();
    const box = await rows.boundingBox();
    const f = await foot.boundingBox();
    expect(r.y, `"${name}" starts inside the menu ${where}`).toBeGreaterThanOrEqual(box.y - 1);
    expect(r.y + r.height, `"${name}" ends inside the menu ${where}`).toBeLessThanOrEqual(box.y + box.height + 1);
    expect(r.y + r.height, `"${name}" ends above What's new ${where}`).toBeLessThanOrEqual(f.y + 1);
    const hit = await link.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return el.contains(top);
    });
    expect(hit, `"${name}" is the thing under the pointer ${where}`).toBe(true);
  }
  expect(names).toContain('Help and feedback');
  // Fresh eyes (R-447): the link and QR poster are in a computer's menu too, as under More on a phone.
  expect(names).toContain('Invite members');
  return names;
}

for (const { name, size } of [...DESKTOPS, { name: '1920x1080', size: { width: 1920, height: 1080 } }]) {
  test.describe(`R447-2 computer menu at ${name}`, () => {
    test.use({ viewport: size, isMobile: false });

    test(`every menu row is whole and clickable at ${name}; What's new never covers one`, async ({ page }) => {
      await openApp(page);
      await startOnlineGym(page);
      const menu = page.getByRole('navigation', { name: 'Main' });
      const rows = menu.locator('[data-sidebar-rows]');
      const foot = menu.locator('[data-sidebar-foot]');
      await expect(foot.getByRole('link', { name: /What's new/ })).toBeVisible();
      const scrolls = await rows.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
      const more = foot.getByRole('button', { name: 'More below' });
      await shot(page, `computer-${name}-menu-top`);
      if (name === '1366x609') {
        // A real laptop window (768-px screen minus the browser bar and the taskbar): too short for 18 rows even
        // with the shorter rows, so "More below" says so; each tap scrolls the menu on, and it goes at the end.
        expect(scrolls, `the menu scrolls at ${name}`).toBe(true);
        await expect(more).toBeVisible();
        for (let i = 0; i < 6 && (await more.count()); i++) {
          await more.click();
          await page.waitForTimeout(500);
        }
        await expect(more).toHaveCount(0);
        await expect(menu.getByRole('link', { name: 'Help and feedback' })).toBeInViewport({ ratio: 1 });
        await shot(page, `computer-${name}-menu-after-more-below`);
      } else {
        // 1366x768, 1280x720 and 1920x1080: the whole menu fits; nothing to scroll and no "More below".
        expect(scrolls, `every row fits at ${name}`).toBe(false);
        await expect(more).toHaveCount(0);
      }
      // Dark | Light now sits beside the bell, not in the menu.
      await expect(menu.getByRole('radiogroup', { name: 'Screen colours' })).toHaveCount(0);
      await expect(page.getByRole('main').getByRole('radiogroup', { name: 'Screen colours' })).toBeVisible();

      const names = await expectEveryRowClickable(page, `at ${name}`);
      // Scrolled to the end: no "More below", and "Help and feedback" sits whole above What's new.
      await expect(more).toHaveCount(0);
      await shot(page, `computer-${name}-menu-end`);
      console.log(`[r447] ${name}: ${names.length} rows: ${names.join(', ')}`);

      // A real click on the last row opens its page, and that row stays in view, lit.
      await menu.getByRole('link', { name: 'Help and feedback' }).click();
      await expect(page.getByRole('heading', { name: 'Help and feedback', level: 1 })).toBeVisible();
      const lit = menu.locator('[aria-current="page"]');
      await expect(lit).toHaveText('Help and feedback');
      await expect(lit).toBeInViewport({ ratio: 1 });
      await shot(page, `computer-${name}-help-open`);

      // Back to the top row by a click: Today opens and its row scrolls back into view.
      await rows.evaluate((el) => el.scrollTo({ top: 0 }));
      await menu.getByRole('link', { name: /^Today/ }).click();
      await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

      // 3. Settings -> Sign-in & data on a computer: the two renamed cards.
      if (name === '1366x768') {
        await menu.getByRole('link', { name: 'Settings', exact: true }).click();
        await page.getByRole('group', { name: 'Settings view' }).getByRole('button', { name: 'Sign-in & data' }).click();
        await expectDataCards(page);
        await page.getByRole('heading', { name: 'Download a backup', exact: true }).scrollIntoViewIfNeeded();
        await shot(page, 'computer-settings-data');
        await shot(page, 'computer-settings-data-full', true);
      }
    });
  });
}

async function expectDataCards(page) {
  const backup = page.getByRole('heading', { name: 'Download a backup', exact: true });
  const records = page.getByRole('heading', { name: 'Your gym’s records', exact: true });
  await expect(backup).toBeVisible();
  await expect(records).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download all your gym’s data' })).toBeVisible();
  // Negative: the two old, too-alike names are gone.
  await expect(page.getByRole('heading', { name: 'Keep a copy of your data' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your data', exact: true })).toHaveCount(0);
  const a = await backup.boundingBox();
  const b = await records.boundingBox();
  expect(a.y, 'the backup card is above the records card').toBeLessThan(b.y);
}

test.describe('R447-2/3 phone (375 px): More reaches Help and feedback; the data cards', () => {
  test.use({ viewport: PHONE });

  test('More shows Help and feedback above the bottom bar; Sign-in & data shows the renamed cards', async ({ page }) => {
    await openApp(page);
    await startOnlineGym(page);
    await bottomBar(page).getByRole('link', { name: /^More/ }).tap();
    await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible();
    const help = page.getByRole('main').getByRole('link', { name: /^Help and feedback/ });
    await help.scrollIntoViewIfNeeded();
    const r = await help.boundingBox();
    const bar = await bottomBar(page).boundingBox();
    expect(r.y + r.height, 'Help and feedback ends above the bottom bar').toBeLessThanOrEqual(bar.y + 1);
    await shot(page, 'phone-more-end');
    await shot(page, 'phone-more-full', true);
    await help.tap();
    await expect(page.getByRole('heading', { name: 'Help and feedback', level: 1 })).toBeVisible();

    await bottomBar(page).getByRole('link', { name: /^More/ }).tap();
    await page.getByRole('main').getByRole('link', { name: /^Settings/ }).first().tap();
    await page.getByRole('group', { name: 'Settings view' }).getByRole('button', { name: 'Sign-in & data' }).tap();
    await expectDataCards(page);
    await expectFitsPhone(page, 'on Settings -> Sign-in & data at 375 px');
    await page.getByRole('heading', { name: 'Download a backup', exact: true }).scrollIntoViewIfNeeded();
    await shot(page, 'phone-settings-data');
    await shot(page, 'phone-settings-data-full', true);
  });
});
