// #47 (23 Oct 2026): the real AI column match, against the live panel Worker and the real AI keys.
//   XJ7  (gym A) Members -> Import from Excel: a register with odd column names; "Ask AI" really
//        answers and marks the columns it matched "AI". Nothing is imported (the file is left), so the
//        gym's member count stays as the other steps expect.
import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { open, openAsOwner, shot } from './support.mjs';

// Column names our own rules do not know, so the AI has gaps to fill. Made-up people, numbers that
// belong to nobody (the 98765000xx range the other steps use).
const REGISTER = [
  'Sadasya ka naam,Sampark,Locker kramank,Khoon ka group',
  'Asha Test,9876500031,14,B+',
  'Ravi Test,9876500032,15,O+',
  '',
].join('\n');

test('XJ7 owner asks AI to match the columns of an odd register', async ({ page }, testInfo) => {
  await openAsOwner(page, 'A');
  const csv = testInfo.outputPath('xj7-register.csv');
  await writeFile(csv, REGISTER);
  await open(page, 'Members');
  await page.getByRole('button', { name: 'Import from Excel' }).first().tap();
  await expect(page.getByRole('heading', { name: 'Import members from Excel', exact: true })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file' }).tap();
  await (await chooser).setFiles(csv);
  const main = page.getByRole('main');
  await expect(main).toContainText('Ask AI to match the columns?', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Ask AI' }).tap();
  // A real answer: the matched columns are marked "AI" and the day's count is shown.
  await expect(main).toContainText(/AI matched \d+ columns?/, { timeout: 45_000 });
  await expect(main).toContainText(/\d+ AI match(es)? left today/);
  await shot(page, testInfo, 'xj7-ai-matched');
});
