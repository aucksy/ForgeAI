// Tracker #36 (24 Oct 2026): "an import that never fails". The owner imports a register with a
// totals row, a row numbers column, odd extra columns, a short mobile and a date that is not real.
// Nothing stops: the bad rows wait under "Rows to check", he fixes one right there and skips the
// other, everything else goes in, and every extra column comes in with its own name.
import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { chooseFile, expectFitsPhone, freshGym, openMember } from './support.mjs';

const REGISTER = [
  'Sr. No.,Name,Mobile,Joining Date,Locker No.,Trainer',
  '1,Check Test One,9829060001,01/10/2026,12,Coach Demo',
  '2,Check Test Two,9829060002,02/10/2026,14,',
  '3,Check Test Short,98290 6000,03/10/2026,15,Coach Demo',
  '4,Check Test Date,9829060004,31/02/2026,16,',
  'Total,,,,,',
  '',
].join('\n');

test('J36 rows to check: a bad mobile is fixed on the screen, a bad date is skipped, the totals row is left out, every column kept', async ({ page }, testInfo) => {
  await freshGym(page);
  const csv = testInfo.outputPath('register.csv');
  await writeFile(csv, REGISTER);
  await chooseFile(page, csv);
  const main = page.getByRole('main');

  // Before anything is saved: the totals row is named, the row numbers are not kept, the rest is.
  await expect(main).toContainText('4 rows: 2 will be added, 0 already members or repeated, 2 with a problem.');
  await expect(main).toContainText('Not added: Row 6 is a totals row, not a member.');
  await expect(page.getByRole('checkbox', { name: /Keep Column A “Sr. No.”/ })).not.toBeChecked();
  await expect(main).toContainText('It only numbers the rows, so it is not kept. Tick it to keep it.');
  await expect(page.getByRole('checkbox', { name: /Keep Column E “Locker No.”/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Keep Column F “Trainer”/ })).toBeChecked();
  await expect(main).toContainText('Locker No.: 12 · Trainer: Coach Demo');

  // "Rows to check": both bad rows, each with its reason in plain words.
  await expect(main).toContainText('2 rows can’t be added yet.');
  await expect(main).toContainText('Mobile “98290 6000” is not a 10-digit number.');
  await expect(main).toContainText('Joining date “31/02/2026” is not a date we can read. Write it like 15/08/2026.');
  await expectFitsPhone(page, 'on rows to check');

  // Fix the mobile right here, then check again: the row now goes in.
  await page.getByLabel('Mobile, row 4').fill('9829060003');
  await page.getByRole('button', { name: 'Check again' }).first().tap();
  await expect(main).toContainText('Row 4 checked again.');
  await expect(main).toContainText('4 rows: 3 will be added, 0 already members or repeated, 1 with a problem.');

  // Skip the row with the impossible date.
  await page.getByRole('button', { name: 'Skip row 5' }).tap();
  await expect(main).toContainText('You skipped 1 row. It is not added.');

  await page.getByRole('button', { name: 'Add 3 members' }).tap();
  await expect(main).toContainText('3 added, 1 skipped');
  await expect(page.getByRole('button', { name: 'Download 1 skipped row' })).toBeVisible();

  // The fixed member is in, with the gym's own details.
  await openMember(page, 'Check Test Short');
  await expect(main).toContainText('Locker No.');
  await expect(main).toContainText('15');
});
