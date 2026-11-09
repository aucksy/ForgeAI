// F198 "new-feature dots" (R-389/R-390, owner 7 Nov 2026), UAT on a phone (390 x 844, the config's phone) and a
// computer (1280 x 900). A NEW feature (an ADMIN_NEWS line with `feature: true`, never a fix) puts a small dot on
// every entry point on the way to it; the owner follows the dots. Pictures go to e2e/.results/uat (CI uploads them
// as "dashboard-uat-pictures"), named dots-*.png.
//
// UAT types: happy path (the Pay MettleUp trail on a phone and a computer), clears (opening the page clears the
// menu and row at once, the heading dot stays for that visit, gone after leaving or a reload), regression (another
// feature's dot under the same parent stays; Branding keeps its own; What's new bell untouched), negative (a fix
// line lights nothing; the desk, the demo gym get no dots), time (5 Nov features gone on 5 Dec, every dot gone on
// day 31 = 6 Dec, before the day nothing), edge (broken saved value), interruption (reload mid-trail), phone width.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { DESK, PHONE, addDeskPerson, bottomBar, expectFitsPhone, open, openApp, secondPhone, signIn, startDemo, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

// The Pay MettleUp / Branding / pass-members trail runs on the evening of 6 Nov: from 7 Nov 00:00 the F105 Trainers
// feature is the newest, and MAX_DOTS (3) pushes pass members out (its own test is at the end).
const NOV7 = new Date('2026-11-06T22:00:00+05:30');
const TRAINERS_DAY = new Date('2026-11-07T10:00:00+05:30');
const DOTS_KEY = 'forgeai.adminNews.dotsSeen.v1';

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/dots-${name}.png`, fullPage });
}

const dot = (locator) => locator.locator('[data-new-dot]');
const barItem = (page, label) => bottomBar(page).getByRole('link', { name: new RegExp(`^${label}`) });
const moreRow = (page, label) => page.getByRole('main').getByRole('link', { name: new RegExp(`^${label}`) });
const tab = (page, label) => page.getByRole('group', { name: 'Settings view' }).getByRole('button', { name: new RegExp(`^${label}`) });
/** The innermost box holding the "Pay MettleUp" button: the button and its dot. */
const payRow = (page) => page.getByRole('main').locator('div').filter({ has: page.getByRole('button', { name: 'Pay MettleUp' }) }).last();
const headingDot = (page) => dot(page.getByRole('main').locator('header').filter({ has: page.getByRole('heading', { level: 1 }) }));
const go = (page, path) => page.evaluate((p) => { window.location.hash = p; }, path);

test('F198 phone: follow the dots to Pay MettleUp; they clear on the way back; the heading dot goes after a reload', async ({ page }) => {
  await openApp(page, { time: NOV7 });
  await startOnlineGym(page);
  const main = page.getByRole('main');

  // On Today: a dot on More (Pay MettleUp and Branding are behind it) and on Members (pass members, 5 Nov).
  await expect(dot(barItem(page, 'More'))).toHaveCount(1);
  await expect(dot(barItem(page, 'Members'))).toHaveCount(1);
  await expect(dot(barItem(page, 'Today'))).toHaveCount(0);
  await expect(dot(barItem(page, 'Money'))).toHaveCount(0);
  // Never a number: the dot only says "New" to a screen reader; the bell keeps its own count.
  await expect(barItem(page, 'More')).toHaveAccessibleName(/More.*New/);
  await expect(dot(page.getByRole('banner'))).toHaveCount(0);
  await expect(dot(main)).toHaveCount(0);
  await expectFitsPhone(page, 'on Today with dots');
  await shot(page, 'phone-1-today');

  // More: the Settings row and the Branding row; nothing else.
  await barItem(page, 'More').tap();
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible();
  await expect(dot(moreRow(page, 'Settings'))).toHaveCount(1);
  await expect(dot(moreRow(page, 'Branding'))).toHaveCount(1);
  await expect(dot(moreRow(page, 'Plans'))).toHaveCount(0);
  await expect(dot(moreRow(page, 'Staff & sign-in'))).toHaveCount(0);
  await expect(dot(main)).toHaveCount(2);
  await expect(headingDot(page)).toHaveCount(0);
  await expectFitsPhone(page, 'on More with dots');
  await shot(page, 'phone-2-more', true);

  // Settings: the Gym tab and the Pay MettleUp row; no heading dot (Settings itself is not the new page).
  await moreRow(page, 'Settings').tap();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(dot(tab(page, 'Gym'))).toHaveCount(1);
  await expect(dot(tab(page, 'Member app'))).toHaveCount(0);
  await expect(dot(payRow(page))).toHaveCount(1);
  await expect(headingDot(page)).toHaveCount(0);
  await payRow(page).scrollIntoViewIfNeeded();
  await expectFitsPhone(page, 'on Settings with dots');
  await shot(page, 'phone-3-settings-row');

  // Pay MettleUp: a dot beside the heading, outside it (the heading's name stays "Pay MettleUp").
  await payRow(page).getByRole('button', { name: 'Pay MettleUp' }).tap();
  await expect(page.getByRole('heading', { name: 'Pay MettleUp', exact: true })).toBeVisible();
  await expect(headingDot(page)).toHaveCount(1);
  // Seen at once: More on the bar keeps its dot only for Branding.
  await expect(dot(barItem(page, 'More'))).toHaveCount(1);
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), DOTS_KEY)).toContain('2026-11-06|/settings/mettleup');
  await expectFitsPhone(page, 'on Pay MettleUp with the heading dot');
  await shot(page, 'phone-4-pay-heading');

  // Back on More: the Settings row's dot is gone; Branding's stays (another unseen feature).
  await barItem(page, 'More').tap();
  await expect(dot(moreRow(page, 'Settings'))).toHaveCount(0);
  await expect(dot(moreRow(page, 'Branding'))).toHaveCount(1);
  await moreRow(page, 'Settings').tap();
  await expect(dot(tab(page, 'Gym'))).toHaveCount(0);
  await expect(dot(payRow(page))).toHaveCount(0);
  await shot(page, 'phone-5-settings-cleared');

  // The next visit: no heading dot, also after a reload (an interruption mid-trail keeps what was seen).
  await go(page, '/settings/mettleup');
  await expect(page.getByRole('heading', { name: 'Pay MettleUp', exact: true })).toBeVisible();
  await expect(headingDot(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pay MettleUp', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(headingDot(page)).toHaveCount(0);
  await shot(page, 'phone-6-pay-next-visit');

  // Branding: its own row on More; opening it clears it, and More on the bar goes dark (nothing else behind it).
  await barItem(page, 'More').tap();
  await moreRow(page, 'Branding').tap();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(headingDot(page)).toHaveCount(1);
  await expect(dot(barItem(page, 'More'))).toHaveCount(0);
  await expect(dot(barItem(page, 'Members'))).toHaveCount(1);
  await expectFitsPhone(page, 'on Branding with the heading dot');
  await shot(page, 'phone-7-branding-heading');

  // Members (pass members, 5 Nov): opening it clears the last dot.
  await barItem(page, 'Members').tap();
  await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
  await expect(headingDot(page)).toHaveCount(1);
  await expect(dot(bottomBar(page))).toHaveCount(0);
  await barItem(page, 'Today').tap();
  await expect(dot(page.locator('body'))).toHaveCount(0);
  await shot(page, 'phone-8-all-seen');

  // Regression: the What's new bell is untouched by the dots (a first visit: no number).
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
});

test('F198 computer: dots in the left menu, on the Settings row and beside the heading', async ({ page }) => {
  await openApp(page, { time: NOV7 });
  await startOnlineGym(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const menu = page.getByRole('navigation', { name: 'Main' });
  const item = (label) => menu.getByRole('link', { name: new RegExp(`^${label}`) });

  await expect(dot(item('Settings'))).toHaveCount(1);
  await expect(dot(item('Branding'))).toHaveCount(1);
  await expect(dot(item('Members'))).toHaveCount(1);
  await expect(dot(item('Today'))).toHaveCount(0);
  await expect(dot(item('Gym timings'))).toHaveCount(0);
  await expect(dot(menu)).toHaveCount(3);
  await expectFitsPhone(page, 'on Today, computer');
  await shot(page, 'computer-1-menu');

  await item('Settings').click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(dot(tab(page, 'Gym'))).toHaveCount(1);
  await expect(dot(payRow(page))).toHaveCount(1);
  await shot(page, 'computer-2-settings-row');

  await payRow(page).getByRole('button', { name: 'Pay MettleUp' }).click();
  await expect(page.getByRole('heading', { name: 'Pay MettleUp', exact: true })).toBeVisible();
  await expect(headingDot(page)).toHaveCount(1);
  // The menu's Settings dot goes at once; Branding and Members keep theirs.
  await expect(dot(item('Settings'))).toHaveCount(0);
  await expect(dot(item('Branding'))).toHaveCount(1);
  await expect(dot(item('Members'))).toHaveCount(1);
  await shot(page, 'computer-3-pay-heading');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pay MettleUp', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(headingDot(page)).toHaveCount(0);
  await expect(dot(item('Settings'))).toHaveCount(0);
  await shot(page, 'computer-4-after-reload');
});

test('F198 time: 5 Nov features end on 5 Dec, the 6 Nov ones on 6 Dec, Trainers (7 Nov) on 7 Dec', async ({ page }) => {
  // 5 Dec: the 6 Nov features are on day 30 (still lit); pass members (5 Nov) is on day 31 (gone).
  await openApp(page, { time: new Date('2026-12-05T10:00:00+05:30') });
  await startOnlineGym(page);
  await expect(dot(barItem(page, 'More'))).toHaveCount(1);
  await expect(dot(barItem(page, 'Members'))).toHaveCount(0);
  await shot(page, 'time-1-day30');

  // Day 31 of the 6 Nov features, 00:00 India time. The 7 Nov Branding fix is still under 30 days: a fix lights nothing.
  // Only Trainers (a 7 Nov feature, day 30) is still lit. (The dots read the clock on each page change.)
  await page.clock.setSystemTime(new Date('2026-12-06T00:00:30+05:30'));
  await barItem(page, 'More').tap();
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible();
  await expect(dot(moreRow(page, 'Trainers'))).toHaveCount(1);
  await expect(dot(page.getByRole('main'))).toHaveCount(1);
  await moreRow(page, 'Settings').tap();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(dot(page.getByRole('main'))).toHaveCount(0);
  await go(page, '/settings/branding');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(headingDot(page)).toHaveCount(0);
  await shot(page, 'time-2-day31-only-trainers');

  // 7 Dec 00:00 India time: day 31 of Trainers too, so nothing is lit anywhere. Negative (9 Nov): the Questions
  // feature is still live, but this gym has no Questions page, so it must light nothing (not even More).
  await page.clock.setSystemTime(new Date('2026-12-07T00:00:30+05:30'));
  await barItem(page, 'Today').tap();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(dot(page.locator('body'))).toHaveCount(0);
  await shot(page, 'time-3-day31-none');
});

test('F198 before the day, the desk and the demo gym: no dots', async ({ page, browser }) => {
  // 5 Nov 23:58 India time: the 6 Nov features (Branding icon preview, Pay MettleUp) are not live yet; the 5 Nov
  // ones are (pass members on Members; Bring a friend and Payments behind Settings).
  const server = await openApp(page, { time: new Date('2026-11-05T23:58:00+05:30') });
  await startOnlineGym(page);
  await expect(dot(barItem(page, 'Members'))).toHaveCount(1);
  await barItem(page, 'More').tap();
  await expect(dot(moreRow(page, 'Branding'))).toHaveCount(0);
  await expect(dot(moreRow(page, 'Settings'))).toHaveCount(1);
  await moreRow(page, 'Settings').tap();
  await expect(dot(tab(page, 'Member app'))).toHaveCount(1);
  await expect(dot(payRow(page))).toHaveCount(0);
  await shot(page, 'time-0-before-6-nov');

  // The front desk on its own phone, 7 Nov: the dots are for the owner's pages.
  await page.clock.setSystemTime(NOV7);
  await addDeskPerson(page);
  const desk = await secondPhone(browser, server, NOV7);
  await signIn(desk, DESK.phone);
  await expect(dot(desk.locator('body'))).toHaveCount(0);
  await open(desk, 'Settings');
  await expect(dot(desk.locator('body'))).toHaveCount(0);
  await shot(desk, 'negative-1-desk-none');
  await desk.context().close();

  // The demo gym (a sample, not the owner's gym), 7 Nov.
  const demo = await browser.newContext({ ...PHONE, baseURL: test.info().project.use.baseURL });
  const d = await demo.newPage();
  await openApp(d, { time: NOV7 });
  await startDemo(d);
  await expect(dot(d.locator('body'))).toHaveCount(0);
  await shot(d, 'negative-2-demo-none');
  await demo.close();
});

test('F198 edge: a broken saved value shows the dots again and is mended on the next visit', async ({ page }) => {
  await openApp(page, { time: NOV7 });
  await startOnlineGym(page);
  await page.evaluate((k) => localStorage.setItem(k, '{oops'), DOTS_KEY);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(dot(barItem(page, 'More'))).toHaveCount(1);
  await go(page, '/settings/mettleup');
  await expect(page.getByRole('heading', { name: 'Pay MettleUp', exact: true })).toBeVisible();
  await expect(headingDot(page)).toHaveCount(1);
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), DOTS_KEY)).toBe('["2026-11-06|/settings/mettleup"]');
  await shot(page, 'edge-1-mended');
});

test('F198 + F105, 7 Nov: the dots lead to Trainers; pass members is pushed out (three at most)', async ({ page }) => {
  await openApp(page, { time: TRAINERS_DAY });
  await startOnlineGym(page);
  await expect(dot(barItem(page, 'More'))).toHaveCount(1);
  await expect(dot(barItem(page, 'Members'))).toHaveCount(0);
  await barItem(page, 'More').tap();
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible();
  await expect(dot(moreRow(page, 'Trainers'))).toHaveCount(1);
  await expect(dot(moreRow(page, 'Settings'))).toHaveCount(1);
  await expect(dot(moreRow(page, 'Branding'))).toHaveCount(1);
  await expect(dot(page.getByRole('main'))).toHaveCount(3);
  await expectFitsPhone(page, 'on More with the Trainers dot');
  await shot(page, 'phone-9-more-trainers', true);

  await moreRow(page, 'Trainers').tap();
  await expect(page.getByRole('heading', { name: 'Trainers', exact: true })).toBeVisible();
  await expect(headingDot(page)).toHaveCount(1);
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), DOTS_KEY)).toContain('2026-11-07|/trainers');
  await shot(page, 'phone-10-trainers-heading');

  // Back on More: Trainers is dark, the other two keep theirs.
  await barItem(page, 'More').tap();
  await expect(dot(moreRow(page, 'Trainers'))).toHaveCount(0);
  await expect(dot(moreRow(page, 'Settings'))).toHaveCount(1);
  await expect(dot(moreRow(page, 'Branding'))).toHaveCount(1);
});
