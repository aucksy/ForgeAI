// R-540 (owner, 14 Nov 2026): "ensure that the demo gym has enough data so all the functionalities can be shown in all
// its glory. So if I do go to a gym to give them a demo, I can show them how everything works."
// UAT of app.mettleup.fit/demo, the sales demo: the sample gym (src/crm/demo/showcase.ts) and its pretend gym server
// in the page (src/crm/demo/demoServer.ts). Every main screen is opened like a visitor would, on a phone (375 x 812)
// and on a computer (1280 x 800), as the owner and (/demo?as=desk) as the front desk. Pictures go to
// e2e/.results/uat (CI uploads them as "dashboard-uat-pictures"). For each screen:
//   - it shows the sample gym's rows, never "This works in your own gym" (except the pages that still need a real gym);
//   - the page throws nothing, fits the phone, and NOTHING goes to the gym server or the Worker's API.
// The demo uses the browser's real date: everything in it is made relative to the day it opens.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { expectFitsPhone } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);

/** Every request that would leave the page for the gym server or the Worker's API. */
function watch(page) {
  const calls = [];
  const errors = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (/^\/(sb|api)\//.test(u.pathname) || /supabase\.co$/.test(u.hostname)) calls.push(`${r.method()} ${r.url()}`);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { calls, errors };
}

/** The screens a gym visit walks through, in the order of docs/demo/DEMO-SCRIPT.md, and a word each must show. */
const SCREENS = [
  ['01-today', '/', /Today/],
  ['02-members', '/members', /Members/],
  ['03-members-ending-this-week', '/members/f/exp-4-7', /Members/],
  ['04-members-expired', '/members/f/expired', /Members/],
  ['05-enquiries', '/enquiries', /Enquiries/],
  ['06-money', '/money', /Money|Payments/],
  ['07-plans', '/plans', /Plans/],
  ['08-messages', '/messages', /Messages/],
  ['09-shop', '/shop', /Shop/],
  ['10-training-progress', '/trainer', /Training progress/],
  ['11-questions', '/questions', /questions/i],
  ['12-member-messages', '/member-messages', /Message/],
  ['13-diet-plans', '/diet', /Diet/],
  ['14-workout-plans', '/workouts', /Workout plans/],
  ['15-trainers', '/trainers', /Trainers/],
  ['16-challenges', '/challenges', /Challenges/],
  ['17-staff', '/settings/people', /Staff/],
  ['18-timings', '/settings/timings', /timings/i],
  ['19-visits', '/attendance', /Visits|Attendance/],
  ['20-expenses', '/expenses', /Expenses/],
  ['21-growth', '/growth', /growth/i],
  ['22-members-in-the-app', '/members/app', /app/i],
];

async function walk(page, prefix, { phone }) {
  const main = page.getByRole('main');
  for (const [name, path, word] of SCREENS) {
    await go(page, path);
    await expect(main.getByRole('heading').first(), `${path} opens`).toBeVisible({ timeout: 15_000 });
    await expect(main, `${path} shows its own page`).toContainText(word);
    await expect(main.getByText('This works in your own gym'), `${path} is not switched off`).toHaveCount(0);
    if (phone) await expectFitsPhone(page, `on the demo ${path}`);
    await shot(page, `r540-${prefix}-${name}`);
  }
}

test.describe('the sales demo, as the owner', () => {
  test('phone: every main screen has the sample gym in it, and nothing leaves the page', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 375, height: 812 });
    const seen = watch(page);
    await page.goto('./demo');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('region', { name: 'Demo gym' })).toContainText('Demo gym: made-up data. Nothing you do here is saved.');
    await walk(page, 'phone', { phone: true });

    // One member's training: the strongest story's chart and the member's own page (plans, payments, progress).
    await go(page, '/trainer');
    const main = page.getByRole('main');
    // Each card loads its trend tag only once it comes near the screen, so bring every card into view first.
    const rows = main.getByTestId('progress-row');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    for (let i = 0, n = await rows.count(); i < n; i++) await rows.nth(i).scrollIntoViewIfNeeded();
    await expect(rows.getByText('Getting stronger', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(rows.getByText('Dropping', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await main.locator('a[href^="#/trainer/"]').first().click();
    await expect(main.getByRole('heading').first()).toBeVisible();
    await shot(page, 'r540-phone-23-one-members-progress');
    await go(page, '/members');
    await main.locator('a[href^="#/members/"]').first().click();
    await expect(main.getByRole('heading').first()).toBeVisible();
    await shot(page, 'r540-phone-24-member-detail');

    // A tap that works in memory: the shop's new order is marked ready.
    await go(page, '/shop');
    await shot(page, 'r540-phone-25-shop-orders');

    // A page that still needs a real gym says so.
    await go(page, '/settings/branding');
    await expect(main.getByText('This works in your own gym')).toBeVisible();

    expect(seen.errors, 'no screen may throw').toEqual([]);
    expect(seen.calls, 'the demo must never call the gym server').toEqual([]);
  });

  test('computer: the same screens at 1280 x 800', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const seen = watch(page);
    await page.goto('./demo');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
    // One number per thing on every screen (coordinator, 14 Nov 2026): Today's active members are Your growth's
    // "so far", and the Set up your gym mark is the same before and after the pages that used to tick it.
    const main = page.getByRole('main');
    const mark = async () => (await page.locator('nav [data-setup-mark] > span[aria-hidden]').first().textContent())?.trim();
    const markOnToday = await mark();
    // Each tile on its own: the whole page's text runs one tile's last figure into the next one's number.
    const tileText = async (label) => ((await main.getByRole('button').filter({ hasText: label }).first().textContent()) ?? '').trim();
    const active = (await tileText('Active members')).match(/^([\d,]+)Active members/)?.[1];
    const monthMoney = (await tileText('collection')).match(/This month (₹[\d,]+)$/)?.[1];
    expect(monthMoney, "Today shows this month's money").toBeTruthy();
    expect(active, 'Today shows its active members').toBeTruthy();
    await walk(page, 'computer', { phone: false });
    expect(await mark(), 'Set up your gym says the same after every screen').toBe(markOnToday);
    expect(markOnToday).toBe('5/7');
    await go(page, '/growth');
    await expect(main.getByText(/so far:/).first()).toBeVisible({ timeout: 15_000 });
    const growthText = (await main.textContent()) ?? '';
    expect(growthText.match(/Members with a running plan on the last day of the month[\s\S]*?so far: ([\d,]+)/)?.[1], 'Your growth counts the same active members as Today').toBe(active);
    expect(growthText, "Your growth has this month's money as Today does").toContain(`so far: ${monthMoney}`);

    // A filter with nobody in it says so, and one tap shows everyone again (R-540; it said "No members yet").
    await go(page, '/members');
    await main.getByRole('searchbox').or(main.getByLabel('Search name or mobile number')).first().fill('Nobody Byname');
    await expect(main.getByText('Nobody matches that', { exact: true })).toBeVisible();
    await main.getByRole('button', { name: 'Show all members' }).click();
    await expect(main.getByText('Nobody matches that', { exact: true })).toHaveCount(0);
    // The sample gym has nobody without a plan: that chip is empty, and must not say "No members yet".
    await main.getByRole('button', { name: /^No membership/ }).click();
    await expect(main.getByText('Nobody on the list fits this filter right now.')).toBeVisible();
    await expect(main.getByText('No members yet', { exact: true })).toHaveCount(0);
    await shot(page, 'r540-computer-23-members-empty-filter', false);
    await main.getByRole('button', { name: 'Show all members' }).click();
    await expect(main.getByText('Nobody on the list fits this filter right now.')).toHaveCount(0);
    expect(seen.errors, 'no screen may throw').toEqual([]);
    expect(seen.calls, 'the demo must never call the gym server').toEqual([]);
  });
});

test('the sales demo, as the front desk (/demo?as=desk): the desk’s own menu, no staff list', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  const seen = watch(page);
  await page.goto('./demo?as=desk');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await shot(page, 'r540-desk-01-today');
  const main = page.getByRole('main');
  for (const [name, path] of [['02-members', '/members'], ['03-enquiries', '/enquiries'], ['04-shop', '/shop'], ['05-member-messages', '/member-messages'], ['06-more', '/more']]) {
    await go(page, path);
    await expect(main.getByRole('heading').first()).toBeVisible({ timeout: 15_000 });
    await expect(main.getByText('This works in your own gym')).toHaveCount(0);
    await expectFitsPhone(page, `on the desk's ${path}`);
    await shot(page, `r540-desk-${name}`);
  }
  expect(seen.errors, 'no screen may throw').toEqual([]);
  expect(seen.calls, 'the demo must never call the gym server').toEqual([]);
});
