// UAT WP5b journeys 15 and 17 (INVENTORY O-34, O-36, F-07; FINDINGS U-A1, MONEY-ACCESS F-09).
//
// J15: an online gym with two people taking money: the owner (Ramesh) on his phone and the front
// desk (Sunita) on hers, both on one pretend server. The owner then reads Collections for a date
// range, filters it by who took the money, and downloads the Excel file: the totals always match the
// rows, and the file's Amount column adds up to Collected (cancelled money in its own column, F-09).
//
// J17: the receipt says who took the money when the panel knows (U-A1), and says nothing when it
// does not (a gym kept in this browser has no signed-in person).
import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import {
  DESK,
  OWNER,
  PHONE,
  addDeskPerson,
  addMember,
  addPlan,
  expectFitsPhone,
  freshGym,
  open,
  openApp,
  openMember,
  secondPhone,
  sell,
  sheet,
  signIn,
  startOnlineGym,
  tile,
  wait,
} from './support.mjs';

/** A plain CSV reader for the panel's own export (quoted fields, "" inside quotes, CRLF). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const body = text.replace(/^﻿/, '');
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

/** One receipt card on Money -> Collections (phone layout), found by its receipt number. */
function receiptCard(page, receiptNo) {
  return page
    .getByRole('main')
    .locator('div')
    .filter({ has: page.getByRole('link', { name: receiptNo, exact: true }) })
    .filter({ hasText: '₹' })
    .last();
}

/** The receipt numbers listed on Collections, top to bottom. */
async function listedReceipts(page) {
  const links = page.getByRole('main').getByRole('link', { name: /^\d{4}-\d{2}\/\d{4}$/ });
  return (await links.allTextContents()).map((t) => t.trim());
}

/** Sum of the amounts on the listed receipt cards, in rupees. */
async function listedTotal(page, receiptNos) {
  let total = 0;
  for (const no of receiptNos) {
    // The card's amount is its own line ("₹1,000"); the receipt number follows it.
    const text = (await receiptCard(page, no).getByText(/^₹[\d,]+$/).first().textContent()) ?? '';
    total += Number(text.replace(/[₹,]/g, ''));
  }
  return total;
}

/** Owner: sell the first plan, starting and paid on `day`. */
async function sellOn(page, { day, received, method }) {
  await page.getByRole('button', { name: 'Sell membership' }).first().tap();
  const s = sheet(page, 'Sell membership');
  await s.getByLabel('Starts on').fill(day);
  if (received) {
    await s.getByLabel('Received now').fill(received);
    await s.getByLabel('Received on').fill(day);
    if (method) await s.getByLabel('Paid by').selectOption({ label: method });
  }
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(s).toBeHidden();
}

/** Desk: Money (only Dues for the desk) -> Collect on a member's row -> Save payment. */
async function deskCollects(desk, name, { amount, method, day }) {
  await open(desk, 'Money');
  const row = desk
    .getByRole('main')
    .locator('div')
    .filter({ has: desk.getByRole('link', { name }) })
    .filter({ has: desk.getByRole('button', { name: 'Collect' }) })
    .last();
  await row.getByRole('button', { name: 'Collect' }).tap();
  const c = sheet(desk, 'Collect payment');
  await expect(c).toContainText('Today, or up to 31 days back.');
  if (amount) await c.getByLabel('Amount received').fill(amount);
  if (method) await c.getByLabel('Paid by').selectOption({ label: method });
  if (day) await c.getByLabel('Received on').fill(day);
  await c.getByRole('button', { name: 'Save payment' }).tap();
  await expect(c).toBeHidden();
  await expect(desk.getByText('Payment saved.', { exact: true })).toBeVisible();
}

test('J15 collections for a date range, by who took the money; the Excel file adds up to Collected', async ({ page, browser }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });

  // The owner takes money on 5 Oct (Asha, Rs 2,000 cash) and 10 Oct (Bharat, Rs 1,000 UPI).
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await sellOn(page, { day: '2026-10-05', received: '2000' });
  await expect(page.getByText('Membership saved. Receipt 2026-27/0001.')).toBeVisible();
  await addMember(page, { name: 'Bharat Singh', phone: '98290 22222' });
  await sellOn(page, { day: '2026-10-10', received: '1000', method: 'UPI' });
  await expect(page.getByText('Membership saved. Receipt 2026-27/0002.')).toBeVisible();
  // Chetan pays nothing yet.
  await addMember(page, { name: 'Chetan Rao', phone: '98290 33333' });
  expect(await sell(page, {})).toBe('Membership saved. No money taken yet.');
  await addDeskPerson(page);

  // Sunita, on the desk phone, collects three times: Bharat's Rs 1,000 today (cash), Chetan's
  // Rs 1,200 today (UPI) and Rs 800 dated 12 Oct.
  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);
  await deskCollects(desk, 'Bharat Singh', {});
  await deskCollects(desk, 'Chetan Rao', { amount: '1200', method: 'UPI' });
  await deskCollects(desk, 'Chetan Rao', { amount: '800', day: '2026-10-12' });
  await desk.context().close();

  // The owner's phone picks the desk's receipts up on its next refresh.
  await wait(page, 16_000);
  await open(page, 'Money');
  await expectFitsPhone(page, 'on Collections');
  await expect(tile(page, 'Collected')).toContainText('₹6k');

  // The 800 was typed wrong: the owner cancels it.
  await receiptCard(page, '2026-27/0005').getByRole('button', { name: 'Cancel receipt' }).tap();
  const v = sheet(page, 'Cancel this receipt?');
  await v.getByLabel('Reason').fill('Typed the wrong amount');
  await v.getByRole('button', { name: 'Cancel receipt' }).tap();
  await expect(page.getByText('Receipt cancelled. The amount is back in their dues.')).toBeVisible();

  // 8 to 17 Oct: Asha's receipt of 5 Oct is outside; the cancelled one is not counted.
  await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: 'Custom' }).tap();
  await page.getByLabel('From').fill('2026-10-08');
  await page.getByLabel('To').fill('2026-10-17');
  await expectFitsPhone(page, 'on Collections, custom dates');
  const main = page.getByRole('main');
  await expect(main).toContainText('8 Oct 2026 → 17 Oct 2026');
  await expect(tile(page, 'Collected')).toContainText('₹3.2k');
  await expect(tile(page, 'Collected')).toContainText('3 receipts');
  await expect(tile(page, 'Cancelled')).toContainText('₹800');
  await expect(tile(page, 'Cancelled')).toContainText('1 not counted');
  let shown = await listedReceipts(page);
  expect(shown.sort()).toEqual(['2026-27/0002', '2026-27/0003', '2026-27/0004']);
  expect(await listedTotal(page, shown)).toBe(3200);
  // How it came in: UPI Rs 2,200 (2), cash Rs 1,000 (1).
  await expect(main).toContainText('UPI · 2₹2,200');
  await expect(main).toContainText('Cash · 1₹1,000');
  await expect(receiptCard(page, '2026-27/0002')).toContainText(`Taken by ${OWNER.name}`);
  await expect(receiptCard(page, '2026-27/0003')).toContainText(`Taken by ${DESK.name}`);

  // Only what Sunita took: Rs 2,200 on two receipts.
  const takenBy = page.getByLabel('Taken by');
  // Everyone, then each person who took money (in the order they first did; each phone keeps its own
  // pretend clock here, so the order is not checked).
  await expect(takenBy.locator('option')).toHaveCount(3);
  expect((await takenBy.locator('option').allTextContents()).sort()).toEqual(['Everyone', OWNER.name, DESK.name].sort());
  await takenBy.selectOption({ label: DESK.name });
  await expect(main).toContainText(`Taken by ${DESK.name}`);
  await expect(tile(page, 'Collected')).toContainText('₹2.2k');
  await expect(tile(page, 'Collected')).toContainText('2 receipts');
  shown = await listedReceipts(page);
  expect(shown.sort()).toEqual(['2026-27/0003', '2026-27/0004']);
  expect(await listedTotal(page, shown)).toBe(2200);
  // Her cancelled receipt is hers too.
  await expect(tile(page, 'Cancelled')).toContainText('₹800');

  // Only what Ramesh took: Rs 1,000 on one receipt.
  await takenBy.selectOption({ label: OWNER.name });
  await expect(tile(page, 'Collected')).toContainText('₹1k');
  await expect(tile(page, 'Collected')).toContainText('1 receipt');
  await expect(tile(page, 'Cancelled')).toContainText('₹0');
  expect(await listedReceipts(page)).toEqual(['2026-27/0002']);

  // Everyone again, with the cancelled receipt shown: still Rs 3,200 collected.
  await takenBy.selectOption({ label: 'Everyone' });
  await page.getByLabel('Show cancelled receipts').check();
  await expect(receiptCard(page, '2026-27/0005')).toContainText('CANCELLED');
  await expect(tile(page, 'Collected')).toContainText('₹3.2k');

  // The Excel file: Amount adds up to Collected; the cancelled Rs 800 sits in its own column.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Excel file' }).tap();
  const file = await download;
  expect(file.suggestedFilename()).toBe('shakti-gym-collections-2026-10-08-2026-10-17.csv');
  await expect(page.getByText('Exported 4 receipts.')).toBeVisible();
  const [head, ...rows] = parseCsv(await readFile(await file.path(), 'utf8'));
  const col = (name) => head.indexOf(name);
  expect(head).toEqual([
    'Receipt no', 'Date', 'Member', 'Mobile', 'Membership', 'Method', 'Reference',
    'Amount (INR)', 'Cancelled amount (INR)', 'Status', 'Taken by',
  ]);
  expect(rows).toHaveLength(4);
  const amount = rows.reduce((t, r) => t + Number(r[col('Amount (INR)')]), 0);
  const cancelled = rows.reduce((t, r) => t + Number(r[col('Cancelled amount (INR)')]), 0);
  expect(amount).toBe(3200);
  expect(cancelled).toBe(800);
  const r5 = rows.find((r) => r[col('Receipt no')] === '2026-27/0005');
  expect(r5?.[col('Status')]).toBe('Cancelled: Typed the wrong amount');
  expect(r5?.[col('Amount (INR)')]).toBe('0');
  expect(r5?.[col('Taken by')]).toBe(DESK.name);
  expect(rows.find((r) => r[col('Receipt no')] === '2026-27/0002')?.[col('Taken by')]).toBe(OWNER.name);
});

test('J17 the receipt says who took the money (U-A1); a browser-only gym names nobody', async ({ page, browser }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '0', months: '1' });
  await addMember(page, { name: 'Neha Kapoor', phone: '98290 44440' });
  expect(await sell(page, { received: '1500' })).toBe('Membership saved. Receipt 2026-27/0001.');
  await page.getByRole('link', { name: /2026-27\/0001/ }).tap();
  await expect(page.getByRole('heading', { name: 'Receipt 2026-27/0001', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(`Received by ${OWNER.name}`);
  // The WhatsApp message says it too.
  const wa = page.getByRole('link', { name: 'Send on WhatsApp' });
  expect(decodeURIComponent((await wa.getAttribute('href')) ?? '')).toContain(`Received by ${OWNER.name}.`);
  await expect(page.getByRole('main').getByText(`Received by ${OWNER.name}`)).toBeVisible();

  // The desk person's receipt names her.
  await addDeskPerson(page);
  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);
  await addMember(desk, { name: 'Om Prakash', phone: '98290 44441' });
  expect(await sell(desk, { received: '1500' })).toBe('Membership saved. Receipt 2026-27/0002.');
  await desk.getByRole('link', { name: /2026-27\/0002/ }).tap();
  await expect(desk.getByRole('main')).toContainText(`Received by ${DESK.name}`);
  await desk.context().close();

  // A gym kept only in this browser has no signed-in person: no "Received by" line at all.
  const local = await browser.newContext({ ...PHONE, baseURL: test.info().project.use.baseURL });
  const lp = await local.newPage();
  await freshGym(lp);
  await addPlan(lp, { name: 'Monthly', price: '1500', joining: '0', months: '1' });
  await addMember(lp, { name: 'Pooja Rani', phone: '98290 44442' });
  await sell(lp, { received: '1500' });
  await openMember(lp, 'Pooja Rani');
  await lp.getByRole('link', { name: /2026-27\/0001/ }).tap();
  await expect(lp.getByRole('heading', { name: 'Receipt 2026-27/0001', exact: true })).toBeVisible();
  await expect(lp.getByRole('main')).not.toContainText('Received by');
  await local.close();
});
