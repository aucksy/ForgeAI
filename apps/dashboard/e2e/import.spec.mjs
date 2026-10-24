// UAT WP5b journeys 18 and 19 (INVENTORY O-66, O-67).
//
// J18: the owner imports his old payments list: one row per payment, a "paid so far" running total,
// and two rows for one member. The plans, receipts and dues that come out are checked on screen.
//
// J19: an online import of 600 members when the internet drops after the first batch of 500. The
// words say what was saved; importing the same file again finishes it, and nobody is added twice.
import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { chooseFile, membersFile, expectFitsPhone, freshGym, open, openApp, openMember, startOnlineGym, tile, wait } from './support.mjs';

/** One receipt row on a member's page. */
function paymentRow(page, receiptNo) {
  return page
    .getByRole('main')
    .locator('div')
    .filter({ has: page.getByRole('link', { name: new RegExp(receiptNo.replace(/\//g, '\\/')) }) })
    .filter({ hasText: '₹' })
    .last();
}

test('J18 import plans and payments: a payments list with a running total and two rows for one member', async ({ page }, testInfo) => {
  await freshGym(page);
  const csv = testInfo.outputPath('payments.csv');
  await writeFile(
    csv,
    [
      'Name,Mobile,Plan,Plan start,Valid till,Plan price,Amount paid,Payment date',
      // Ravi pays a Rs 6,000 quarter in two goes; the sheet keeps "paid so far": 2,000, then 4,500.
      'Ravi Kumar,9829050001,Quarterly,01/08/2026,31/10/2026,6000,2000,01/08/2026',
      'Ravi Kumar,9829050001,Quarterly,01/08/2026,31/10/2026,6000,4500,01/09/2026',
      'Sita Devi,9829050002,Monthly,05/10/2026,04/11/2026,1500,1500,05/10/2026',
      '',
    ].join('\n'),
  );
  await chooseFile(page, csv);
  await expectFitsPhone(page, 'on the import review');

  // The review: two new members; Ravi's second row is his second payment, not a second member.
  const main = page.getByRole('main');
  await expect(main).toContainText('3 rows: 2 will be added, 1 already members or repeated, 0 with a problem.');
  await expect(main).toContainText('Same member as row 2. This plan and payment are added to them');
  // What the file brings: the money actually paid is Rs 6,000 (Ravi 4,500 so far, Sita 1,500).
  await expect(main).toContainText('2 members come with their plan and its dates (2 plan names), and ₹6,000 already paid as receipts.');

  await page.getByRole('button', { name: 'Add 2 members' }).tap();
  await expect(main).toContainText('2 added, 0 skipped');
  await expect(main).toContainText('2 plans with their dates · 3 receipts · 2 new plan names added to Plans.');

  // Ravi: one Quarterly plan, two receipts (2,000 on 1 Aug, then the 2,500 more by 1 Sep), Rs 1,500 due.
  await openMember(page, 'Ravi Kumar');
  await expect(tile(page, 'Dues')).toContainText('₹1,500');
  await expect(main).toContainText('1 Aug 2026 → 31 Oct 2026');
  await expect(paymentRow(page, 'IMP/2026-27/0001')).toContainText('₹2,000');
  await expect(paymentRow(page, 'IMP/2026-27/0001')).toContainText('1 Aug 2026');
  await expect(paymentRow(page, 'IMP/2026-27/0002')).toContainText('₹2,500');
  await expect(paymentRow(page, 'IMP/2026-27/0002')).toContainText('1 Sep 2026');
  await expect(main.getByRole('link', { name: /^IMP\// })).toHaveCount(2);

  // Sita: fully paid.
  await openMember(page, 'Sita Devi');
  await expect(tile(page, 'Dues')).toContainText('Fully paid');
  await expect(paymentRow(page, 'IMP/2026-27/0003')).toContainText('₹1,500');

  // Dues: only Ravi, Rs 1,500, owed since 1 Aug (77 days: over 60).
  await open(page, 'Money');
  await page.getByRole('button', { name: 'Dues' }).tap();
  await expect(tile(page, 'Total due')).toContainText('₹1.5k');
  await expect(tile(page, 'Total due')).toContainText('1 member');
  await expect(tile(page, 'Over 60 days')).toContainText('₹1.5k');
  await expect(main).toContainText('77 days');

  // Collections over this financial year: Rs 6,000 on three receipts.
  await page.getByRole('button', { name: 'Collections' }).tap();
  await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: 'This financial year' }).tap();
  await expect(tile(page, 'Collected')).toContainText('₹6k');
  await expect(tile(page, 'Collected')).toContainText('3 receipts');

  // Plans: the two plan names from the file, at the file's prices.
  await open(page, 'Plans');
  await expect(main.getByText('Quarterly', { exact: true })).toBeVisible();
  await expect(main.getByText('Monthly', { exact: true })).toBeVisible();
  await expect(main).toContainText('₹6,000');
});

test('J19 online import: the internet drops after the first 500; the words say what was saved; a retry adds nobody twice', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const server = await openApp(page);
  await startOnlineGym(page);

  const csv = await membersFile(testInfo, 'six-hundred.csv', 600);
  await chooseFile(page, csv);
  await expect(page.getByRole('button', { name: 'Add 600 members' })).toBeVisible();
  // The first batch (500) reaches the server; then the internet drops.
  server.dropAfterCalls('crm_push', 1);
  await page.getByRole('button', { name: 'Add 600 members' }).tap();
  // The panel sends the same batch again twice (1.5 s, then 4 s) before it says so.
  await expect(page.getByText(/^Saving stopped halfway:/)).toBeVisible({ timeout: 30_000 });
  const main = page.getByRole('main');
  await expect(main).toContainText('500 added, 100 skipped');
  await expect(main).toContainText(
    'Saving stopped halfway: Can’t reach the internet. Check the connection and try again. 500 members were saved (up to row 501). The rest may not be saved. When the internet is back, tap “Try again” below, or import the same file again. Members already added are skipped, so nobody is added twice.',
  );
  await expectFitsPhone(page, 'after the import stopped');
  expect(server.rows('member')).toHaveLength(500);

  // The same file again, still without internet: 500 are members now, 100 are still to add.
  await page.getByRole('button', { name: 'Import another file' }).tap();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file' }).tap();
  await (await chooser).setFiles(csv);
  await expect(main).toContainText('600 rows: 100 will be added, 500 already members or repeated, 0 with a problem.');
  // The internet comes back as the owner taps Add. The panel first sends the batch it kept from the
  // failed try (those 100 land now), then carries on: the 100 read as already members. U-A11: this
  // used to stop with "Saving stopped halfway ... No new members were saved" although all 600 were in.
  server.reconnect();
  await page.getByRole('button', { name: 'Add 100 members' }).tap();
  await expect(main).toContainText('0 added, 600 skipped');
  await expect(page.getByText(/^Saving stopped halfway:/)).toHaveCount(0);
  await expect(main).not.toContainText('No new members were saved');

  // 600 members, each once, here and on the server.
  await page.getByRole('button', { name: 'Open members' }).tap();
  await expect(page.getByText('600 members', { exact: true })).toBeVisible();
  const phones = server.rows('member').map((m) => m.phone);
  expect(phones).toHaveLength(600);
  expect(new Set(phones).size).toBe(600);
  // And still 600 after the next refresh, from the server.
  await wait(page, 16_000);
  await page.reload();
  await open(page, 'Members');
  await expect(page.getByText('600 members', { exact: true })).toBeVisible();
});
