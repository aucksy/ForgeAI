// R-168: "Your numbers" on Today. The owner sees five tiles with a trend line each, taps one for the
// people behind it (Call, WhatsApp with the message ready, an Excel download), changes the days, and
// the front desk never sees the money tile or its list. Pictures of Today at phone and computer
// width are kept in the test's output folder (NUMBERS_SHOTS=<folder> copies them there too).
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { DESK, addDeskPerson, expectFitsPhone, openApp, signIn, sheet, startDemo, startOnlineGym, tile, toast } from './support.mjs';

const TILES = ['Renewals due', 'Money owed', 'Stopped coming', 'New members', 'Busy hours'];

function keep(testInfo, name) {
  const path = testInfo.outputPath(name);
  if (process.env.NUMBERS_SHOTS) {
    mkdirSync(process.env.NUMBERS_SHOTS, { recursive: true });
    return { path, copy: () => copyFileSync(path, join(process.env.NUMBERS_SHOTS, name)) };
  }
  return { path, copy: () => undefined };
}

async function shoot(page, testInfo, name, opts = {}) {
  const k = keep(testInfo, name);
  await page.waitForTimeout(300);
  await page.screenshot({ path: k.path, ...opts });
  k.copy();
}

test('J-N1 owner: five numbers with lines; a tile opens its people; days change; Excel download', async ({ page }, testInfo) => {
  await openApp(page);
  await startDemo(page);

  const section = page.getByRole('region', { name: 'Your numbers' });
  await section.scrollIntoViewIfNeeded();
  for (const label of TILES) await expect(tile(page, label)).toBeVisible();
  // Every tile but Busy hours draws a line (Busy hours draws bars).
  await expect(section.getByRole('img')).toHaveCount(4);
  await expectFitsPhone(page, 'on Today with the numbers');
  await expect(section.getByRole('button', { name: '30 days', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await shoot(page, testInfo, 'numbers-phone.png');
  await shoot(page, testInfo, 'today-phone-full.png', { fullPage: true });

  // Renewals due -> the members whose plan ends, each with Call and WhatsApp.
  const renewals = Number((await tile(page, 'Renewals due').locator('div').first().textContent()).trim());
  await tile(page, 'Renewals due').tap();
  await expect(page).toHaveURL(/#\/numbers\/renewals\/30$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Renewals due' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^${renewals} members?$`) })).toBeVisible();
  await expectFitsPhone(page, 'on Renewals due');
  await shoot(page, testInfo, 'renewals-phone.png');
  if (renewals > 0) {
    const call = page.getByRole('link', { name: /^Call / }).first();
    await expect(call).toHaveAttribute('href', /^tel:\+91\d{10}$/);
    await page.getByRole('button', { name: /^WhatsApp / }).first().tap();
    const wa = page.getByRole('dialog', { name: /^WhatsApp / });
    await expect(wa).toBeVisible();
    await expect(wa.getByRole('button', { name: 'Plan ending' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(wa).toBeHidden();

    // The Excel download is the list on screen.
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel file' }).tap()]);
    expect(file.suggestedFilename()).toMatch(/^[a-z0-9-]+-renewals-due-2026-10-17-2026-11-16\.csv$/);
    const text = readFileSync(await file.path(), 'utf8').replace(/^﻿/, '');
    const lines = text.trim().split(/\r\n/);
    expect(lines[0]).toBe('Member,Mobile,Plan,Plan ends,Days left');
    expect(lines).toHaveLength(renewals + 1);
    await expect(toast(page)).toContainText('Downloaded');
  }

  // 7 days: the address and the words follow.
  await page.getByRole('button', { name: '7 days', exact: true }).tap();
  await expect(page).toHaveURL(/#\/numbers\/renewals\/7$/);
  await expect(page.getByRole('main')).toContainText('Next 7 days');

  // Two dates: the boxes appear, and a range is read as typed.
  await page.getByRole('button', { name: 'Pick dates', exact: true }).tap();
  await page.getByRole('textbox', { name: 'From' }).fill('2026-10-01');
  await page.getByRole('textbox', { name: 'To' }).fill('2026-10-31');
  await expect(page).toHaveURL(/#\/numbers\/renewals\/2026-10-01_2026-10-31$/);
  await expect(page.getByRole('main')).toContainText('1 Oct – 31 Oct 2026');

  // Busy hours: the hours, busiest first.
  await page.goto('./#/numbers/busy/30');
  await expect(page.getByRole('heading', { level: 1, name: 'Busy hours' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Hours, busiest first' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(/\d+ (am|pm)–\d+ (am|pm)about \d+ a day · \d+/);
  await expectFitsPhone(page, 'on Busy hours');
  await shoot(page, testInfo, 'busy-phone.png');

  // Money owed: the same total as Money -> Dues.
  await page.goto('./#/numbers/owed/30');
  await expect(page.getByRole('heading', { level: 1, name: 'Money owed' })).toBeVisible();
  await shoot(page, testInfo, 'owed-phone.png');

  // Back on Today the days picked last are remembered.
  await page.goto('./#/');
  await expect(page.getByRole('region', { name: 'Your numbers' }).getByRole('button', { name: 'Pick dates', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('region', { name: 'Your numbers' }).getByRole('button', { name: '30 days', exact: true }).tap();

  // A computer screen.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.getByRole('region', { name: 'Your numbers' }).scrollIntoViewIfNeeded();
  await shoot(page, testInfo, 'numbers-desktop.png');
  await page.goto('./#/numbers/stopped/90');
  await expect(page.getByRole('heading', { level: 1, name: 'Stopped coming' })).toBeVisible();
  await shoot(page, testInfo, 'stopped-desktop.png');

  // Light theme, phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem('forgeai.theme.v1', 'light'));
  await page.goto('./#/');
  await page.reload();
  await page.getByRole('region', { name: 'Your numbers' }).scrollIntoViewIfNeeded();
  await shoot(page, testInfo, 'numbers-phone-light.png');
});

test('J-N2 front desk: no money tile, and the money list is closed to them', async ({ page }) => {
  await openApp(page);
  await startOnlineGym(page);
  await addDeskPerson(page);
  await page.getByRole('button', { name: 'Sign out of this device' }).tap();
  await sheet(page, 'Sign out of this device?').getByRole('button', { name: 'Sign out' }).tap();
  await signIn(page, DESK.phone);

  const section = page.getByRole('region', { name: 'Your numbers' });
  await section.scrollIntoViewIfNeeded();
  for (const label of ['Renewals due', 'Stopped coming', 'New members', 'Busy hours']) await expect(tile(page, label)).toBeVisible();
  await expect(section.getByText('Money owed', { exact: true })).toHaveCount(0);
  await expectFitsPhone(page, 'on the desk’s Today');

  await page.goto('./#/numbers/owed/30');
  await expect(page.getByRole('heading', { level: 1, name: 'Money owed' })).toHaveCount(0);
  await page.goto('./#/numbers/new/30');
  await expect(page.getByRole('heading', { level: 1, name: 'New members' })).toBeVisible();
});
