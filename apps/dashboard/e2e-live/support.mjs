// Shared steps for the admin app's half of the cross-role journeys (UAT WP6). Copied and trimmed
// from e2e/support.mjs (WP5), with two differences: the server is the REAL live one (no fake), and
// the clock is the real one.
//
// The ONE shortcut (allowed by the WP6 brief): the owner's sign-in is put into the browser's storage
// the way the app keeps it ("forgeai.cloudGym.v1", src/crm/shop/cloudGym.ts), for the fresh gym this
// run made. Everything after it is a real tap or real typing.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

const CLOUD_GYM_KEY = 'forgeai.cloudGym.v1';

/** The fresh gym of this run (apps/mobile/qa/xj_server.py new-gym). Never logged: it holds the key. */
export function gymState(slot) {
  const dir = process.env.XJ_STATE_DIR;
  if (!dir) throw new Error('XJ_STATE_DIR is not set: run this from apps/mobile/qa/run-journeys.sh');
  return JSON.parse(readFileSync(join(dir, `${slot}.json`), 'utf8'));
}

/** Open the admin app signed in as the owner of the run's gym `slot`; ends on Today. */
export async function openAsOwner(page, slot) {
  const st = gymState(slot);
  const session = {
    gymId: st.gymId,
    ownerKey: st.key,
    joinCode: st.joinCode,
    name: st.name,
    demo: false,
    online: true,
    person: st.person,
  };
  await page.addInitScript(
    ([k, v]) => {
      try {
        if (!window.localStorage.getItem(k)) window.localStorage.setItem(k, v);
      } catch {
        // Storage blocked: the app shows its welcome screen and the step fails on the next line.
      }
    },
    [CLOUD_GYM_KEY, JSON.stringify(session)],
  );
  await page.goto('./');
  const today = page.getByRole('heading', { name: 'Today', exact: true });
  // Since 0033 (24 Oct 2026) a gym that has not accepted the terms sees "Before you go on" first;
  // the seeded QA gyms accept it once, as a real owner does.
  const terms = page.getByRole('heading', { name: 'Before you go on' });
  await expect(today.or(terms)).toBeVisible({ timeout: 45_000 });
  if (await terms.isVisible()) {
    await page.getByRole('checkbox', { name: /I agree to the MettleUp terms/ }).check();
    await page.getByRole('button', { name: 'Agree and continue' }).click();
  }
  await expect(today).toBeVisible({ timeout: 45_000 });
  await expectFitsPhone(page, 'on Today');
  return st;
}

/** Nothing is wider than the phone (no sideways scroll), measured against the phone's 390px (U-A9). */
export async function expectFitsPhone(page, where = '') {
  const width = page.viewportSize()?.width ?? 390;
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(wide, `page is ${wide}px wide on a ${width}px phone ${where}`.trim()).toBeLessThanOrEqual(width + 1);
}

/** The fixed "Main" bar at the bottom of the phone screen. */
export function bottomBar(page) {
  return page.getByRole('navigation', { name: 'Main' });
}

const ON_BAR = ['Today', 'Members', 'Money', 'Visits', 'More'];

/** Open a page the way a person does: its tab at the bottom, or More, then its row. */
export async function open(page, label) {
  if (ON_BAR.includes(label)) {
    await bottomBar(page).getByRole('link', { name: new RegExp(`^${label}`) }).tap();
  } else {
    await bottomBar(page).getByRole('link', { name: /^More/ }).tap();
    await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: new RegExp(`^${label}`) }).tap();
  }
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectFitsPhone(page, `on ${label}`);
}

/** A sheet (dialog) by its title. */
export function sheet(page, title) {
  return page.getByRole('dialog', { name: title });
}

/** Shop -> one of its section tabs (Orders, Products, Messages). */
export async function openShop(page, section) {
  await open(page, 'Shop');
  await expect(page.getByRole('heading', { name: 'Shop', exact: true })).toBeVisible();
  if (section) {
    await page.getByRole('group', { name: 'Shop section' }).getByRole('button', { name: new RegExp(`^${section}`) }).tap();
  }
  await expectFitsPhone(page, `on Shop${section ? ` / ${section}` : ''}`);
}

/** Shop -> Orders -> one of the filter chips (New, Ready, Collected, Cancelled, All). */
export async function orderFilter(page, label) {
  await page.getByRole('group', { name: 'Show orders' }).getByRole('button', { name: new RegExp(`^${label}`) }).tap();
}

/** Plans -> + Add plan -> fill -> Save plan. */
export async function addPlan(page, { name, price, joining = '0', months = '1' }) {
  await open(page, 'Plans');
  await expect(page.getByRole('heading', { name: 'Plans', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Add plan' }).first().tap();
  const s = sheet(page, 'Add plan');
  await expect(s).toBeVisible();
  await expectFitsPhone(page, 'in Add plan');
  await s.getByLabel('Plan name').fill(name);
  await s.getByLabel('Duration').fill(months);
  await s.getByLabel('Price (₹)').fill(price);
  await s.getByLabel('Joining fee (₹)').fill(joining);
  await s.getByRole('button', { name: 'Save plan' }).tap();
  await expect(s).toBeHidden({ timeout: 30_000 });
}

/** Members -> + Add member -> name + mobile -> Add member. Ends on the member's own page. */
export async function addMember(page, { name, phone }) {
  await open(page, 'Members');
  await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Add member' }).first().tap();
  const s = sheet(page, 'Add member');
  await expect(s).toBeVisible();
  await expectFitsPhone(page, 'in Add member');
  await s.getByLabel('Full name').fill(name);
  await s.getByLabel('Mobile number').fill(phone);
  await s.getByRole('button', { name: 'Add member' }).tap();
  await expect(s).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

/** On a member's page: Sell membership -> the first plan -> "Received now" -> Confirm. Returns the toast. */
export async function sell(page, { received }) {
  await page.getByRole('button', { name: /^(Sell membership|Renew)$/ }).first().tap();
  const s = sheet(page, 'Sell membership');
  await expect(s).toBeVisible();
  await expectFitsPhone(page, 'in Sell membership');
  if (received !== undefined) await s.getByLabel('Received now').fill(received);
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(s).toBeHidden({ timeout: 30_000 });
  const t = page.getByText(/^Membership saved\./);
  await expect(t).toBeVisible();
  return (await t.textContent()) ?? '';
}

/**
 * A stat tile (value, label, small line under it), found by its label, e.g. "Check-ins today".
 * Assert on it with toContainText.
 */
export function tile(page, label) {
  return page.getByRole('main').getByText(label, { exact: true }).locator('xpath=self::div/..');
}

/** The innermost block holding `inner` and the text `text` (an order card, a register row). */
export function blockWith(page, inner, text) {
  return page.getByRole('main').locator('div').filter({ has: inner }).filter({ hasText: text }).last();
}

/**
 * Wait for something that arrives by itself (the admin app polls the server every 5-30 s), reloading
 * the page between looks so a missed poll never fails a journey. `look` must resolve true when found.
 */
export async function waitFor(page, look, { what, timeoutMs = 90_000, reopen }) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (await look()) return;
    if (Date.now() > end) throw new Error(`waited ${timeoutMs / 1000}s for ${what}`);
    await page.waitForTimeout(5_000);
    if (await look()) return;
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 45_000 });
    if (reopen) await reopen();
  }
}

/** Screenshot for the evidence folder (qa-out/journeys/admin), by step name. */
export async function shot(page, testInfo, name) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: false });
}
