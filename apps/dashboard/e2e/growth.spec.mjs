// "Your growth" (owner, 30 Oct 2026): is the gym growing since it started on MettleUp? The owner opens
// it from "Your numbers" on Today and from More, reads the summary and the six numbers, downloads the
// Excel file and opens the one-page report to share. A new gym with no old records is told how to add
// them. The front desk never sees the page, not even by its address. GROWTH_SHOTS=<folder> keeps the
// pictures there too.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { DESK, addDeskPerson, bottomBar, expectFitsPhone, openApp, sheet, signIn, startDemo, startOnlineGym, toast } from './support.mjs';

const NUMBERS = ['Money collected', 'Active members', 'New members', 'Renewal rate', 'Members lost', 'Visits per member'];

async function shoot(page, testInfo, name, opts = {}) {
  const path = testInfo.outputPath(name);
  await page.waitForTimeout(300);
  await page.screenshot({ path, ...opts });
  if (process.env.GROWTH_SHOTS) {
    mkdirSync(process.env.GROWTH_SHOTS, { recursive: true });
    copyFileSync(path, join(process.env.GROWTH_SHOTS, name));
  }
}

test('J-G1 owner: Your growth from Today and More; six numbers; Excel file; the report to share', async ({ page }, testInfo) => {
  await openApp(page);
  await startDemo(page);

  // From "Your numbers" on Today.
  const link = page.getByRole('region', { name: 'Your numbers' }).getByRole('link', { name: /^Your growth/ });
  await link.scrollIntoViewIfNeeded();
  await link.tap();
  await expect(page).toHaveURL(/#\/growth$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Your growth' })).toBeVisible();

  const summary = page.getByRole('region', { name: 'Summary' });
  await expect(summary).toContainText(/Since you started MettleUp in \w+ 2026, compared with the months before:/);
  await expect(summary).toContainText('Money collected:');
  await expect(summary).toContainText('Other things also change your numbers, like the season or prices.');
  for (const n of NUMBERS) await expect(page.getByRole('heading', { level: 2, name: n, exact: true })).toBeVisible();
  // Each number has its chart, with the month the gym started marked.
  await expect(page.getByRole('main').getByRole('img', { name: /by month:/ })).toHaveCount(6);
  await expect(page.getByRole('main')).toContainText('Before MettleUp');
  await expect(page.getByRole('main')).toContainText('Since MettleUp');
  await expect(page.getByRole('main')).toContainText('within 15 days');
  // The demo has its old records: no "add your old records" card.
  await expect(page.getByText('To compare with before MettleUp, add your old records')).toHaveCount(0);
  await expectFitsPhone(page, 'on Your growth');
  await shoot(page, testInfo, 'growth-phone.png', { fullPage: true });

  // The Excel file: one row a month, the same columns as the table.
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel file' }).first().tap()]);
  expect(file.suggestedFilename()).toMatch(/^[a-z0-9-]+-growth-2026-10-17\.csv$/);
  const lines = readFileSync(await file.path(), 'utf8').replace(/^﻿/, '').trim().split(/\r\n/);
  expect(lines[0]).toBe(
    'Month,Part,Month finished,Money collected (INR),Active members at month end,New members,Plans ended,Renewed,Members lost,Still within 15 days,Renewal rate (%),Check-ins,Visits per member',
  );
  expect(lines.length).toBeGreaterThan(12);
  expect(lines.at(-1)).toMatch(/^Oct 2026,Since MettleUp,"?No, so far"?,/);
  await expect(toast(page)).toContainText('Downloaded');

  // The report to share: one sheet of paper with the gym's name.
  await page.getByRole('button', { name: 'Share this report' }).tap();
  await expect(page).toHaveURL(/#\/growth\/print$/);
  await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible();
  const paper = page.locator('.print-sheet');
  await expect(paper).toContainText('Iron Temple Fitness');
  await expect(paper).toContainText('Average a month');
  await expectFitsPhone(page, 'on the report');
  await page.setViewportSize({ width: 900, height: 1300 });
  await page.emulateMedia({ media: 'print' });
  await shoot(page, testInfo, 'growth-print.png', { fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  // From More on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/');
  await bottomBar(page).getByRole('link', { name: /^More/ }).tap();
  await page.getByRole('main').getByRole('link', { name: /^Your growth/ }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Your growth' })).toBeVisible();

  // A computer screen: the menu on the side has it too.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Your growth' })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: /^Your growth/ })).toBeVisible();
  await shoot(page, testInfo, 'growth-desktop.png', { fullPage: true });

  // Light theme on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem('forgeai.theme.v1', 'light'));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Your growth' })).toBeVisible();
  await shoot(page, testInfo, 'growth-phone-light.png');
});

test('J-G2 a new gym with no old records: no made-up comparison, and the way to add them', async ({ page }, testInfo) => {
  await openApp(page);
  await startOnlineGym(page);
  await page.goto('./#/growth');
  await expect(page.getByRole('heading', { level: 1, name: 'Your growth' })).toBeVisible();
  const summary = page.getByRole('region', { name: 'Summary' });
  await expect(summary).toContainText('You started MettleUp in October 2026.');
  await expect(summary).toContainText('once you have 2 full months on MettleUp');
  await expect(summary.getByRole('listitem')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'To compare with before MettleUp, add your old records' })).toBeVisible();
  await expectFitsPhone(page, 'on Your growth with no history');
  await shoot(page, testInfo, 'growth-nohistory-phone.png', { fullPage: true });
  await page.getByRole('button', { name: 'Add old records' }).tap();
  await expect(page).toHaveURL(/#\/members\/import$/);
});

test('J-G3 front desk: no Your growth on Today or More, and its address is closed', async ({ page }) => {
  await openApp(page);
  await startOnlineGym(page);
  await addDeskPerson(page);
  await page.getByRole('button', { name: 'Sign out of this device' }).tap();
  await sheet(page, 'Sign out of this device?').getByRole('button', { name: 'Sign out' }).tap();
  await signIn(page, DESK.phone);

  await page.getByRole('region', { name: 'Your numbers' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('link', { name: /^Your growth/ })).toHaveCount(0);
  await bottomBar(page).getByRole('link', { name: /^More/ }).tap();
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /^Your growth/ })).toHaveCount(0);

  for (const path of ['./#/growth', './#/growth/print']) {
    await page.goto(path);
    await expect(page.getByText('Only an owner can see this')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Your growth' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toHaveCount(0);
  }
});
