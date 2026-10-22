// #47 AI import (23 Oct 2026): the owner of an online gym imports an old register with columns the
// app has no box for (locker, blood group, referred by) and an Aadhaar column. The AI endpoint is a
// stand-in (page.route): it checks what the browser sends (no phone numbers, the sign-in key in a
// header) and answers like the Worker would. Then: the by-hand path when AI is off, and "I'll match
// them myself" sending nothing.
import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { chooseFile, expectFitsPhone, open, openApp, openMember, startOnlineGym } from './support.mjs';

const REGISTER = [
  'Member,Contact,Lkr,Aadhaar No.,BG,Ref By',
  'Ravi Kumar,9829050001,12,2345 6789 0124,B+,Sunil',
  'Sita Devi,9829050002,B-3,,O+,',
  '',
].join('\n');

/** Answer /api/ai/match-columns; every request body is kept for checks. */
async function stubAi(page, reply) {
  const sent = [];
  await page.route('**/api/ai/match-columns', async (route) => {
    const req = route.request();
    sent.push({ body: req.postData() ?? '', key: req.headers()['x-forge-key'] ?? '' });
    const { status, body } = reply();
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return sent;
}

test('J47 AI matches the columns: extra details come in, the Aadhaar column never does, undo removes it all', async ({ page }, testInfo) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  const sent = await stubAi(page, () => ({
    status: 200,
    body: {
      columns: [
        { column: 0, target: 'fullName', confidence: 0.99 },
        { column: 1, target: 'phone', confidence: 0.98 },
        { column: 2, target: 'extra:Locker No.', confidence: 0.9 },
        { column: 3, target: 'extra:Aadhaar', confidence: 0.9 },
        { column: 4, target: 'extra:Blood Group', confidence: 0.85 },
        { column: 5, target: 'extra:Referred By', confidence: 0.5 },
      ],
      provider: 'gemini',
      left: 19,
    },
  }));
  const csv = testInfo.outputPath('register.csv');
  await writeFile(csv, REGISTER);
  await chooseFile(page, csv);
  const main = page.getByRole('main');

  // Asked first, in one line; the Aadhaar column is already set aside.
  await expect(main).toContainText('Ask AI to match the columns? It sends the column names and 5 example rows. Phone numbers, emails and ID numbers are hidden.');
  await expect(main).toContainText('Not imported: Column D “Aadhaar No.” has Aadhaar numbers. ID numbers are never imported.');
  expect(sent).toHaveLength(0);
  await expectFitsPhone(page, 'on the AI question');

  await page.getByRole('button', { name: 'Ask AI' }).tap();
  await expect(main).toContainText('AI matched 2 columns. They are marked “AI” below. Check them before you add.');
  await expect(main).toContainText('19 AI matches left today.');

  // What left the browser: names and masked examples, no mobile, no Aadhaar; the key in a header.
  expect(sent).toHaveLength(1);
  expect(sent[0].key.length).toBeGreaterThanOrEqual(16);
  expect(sent[0].body).not.toMatch(/9829050001|9829050002|2345 6789 0124|234567890124/);
  expect(sent[0].body).toContain('98XXXXXX01');
  expect(sent[0].body).toContain('[ID number]');
  expect(sent[0].body).not.toContain(sent[0].key);

  // Locker and blood group ticked by the AI; "Referred By" was a guess it was not sure of: not ticked.
  const lockers = page.getByRole('checkbox', { name: /Keep Column C “Lkr”/ });
  const blood = page.getByRole('checkbox', { name: /Keep Column E “BG”/ });
  const referred = page.getByRole('checkbox', { name: /Keep Column F “Ref By”/ });
  await expect(lockers).toBeChecked();
  await expect(blood).toBeChecked();
  await expect(referred).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Aadhaar/ })).toHaveCount(0);
  await referred.tap();
  const names = page.getByLabel('Name on the member’s page');
  await expect(names).toHaveCount(3);
  await names.nth(2).fill('Referred by');

  await expect(main).toContainText('Locker No.: 12 · Blood Group: B+ · Referred by: Sunil');
  await expect(main).toContainText('Locker No.: B-3 · Blood Group: O+');
  await expectFitsPhone(page, 'on the import review with extra details');

  await page.getByRole('button', { name: 'Add 2 members' }).tap();
  await expect(main).toContainText('2 added, 0 skipped');

  // The member's page shows the gym's own details; no Aadhaar anywhere, here or on the server.
  await openMember(page, 'Ravi Kumar');
  await expect(main).toContainText('Locker No.');
  await expect(main).toContainText('Blood Group');
  await expect(main).toContainText('Referred by');
  await expect(main).not.toContainText('2345');
  const ravi = server.rows('member').find((m) => m.fullName === 'Ravi Kumar');
  expect(ravi.extra).toEqual({ 'Locker No.': '12', 'Blood Group': 'B+', 'Referred by': 'Sunil' });
  expect(JSON.stringify(server.rows('member'))).not.toMatch(/2345 ?6789|234567890124/);

  // One tap undoes the whole import, extra details with it.
  await open(page, 'Members');
  await page.getByRole('button', { name: 'Import from Excel' }).first().tap();
  await page.getByRole('button', { name: /^Undo the import of/ }).tap();
  await page.getByRole('button', { name: 'Yes, undo it' }).tap();
  await expect(main).toContainText('Import undone: 2 members');
  await expect.poll(() => server.rows('member').length).toBe(0);
});

test('J47b AI is off: the owner is told in one line and matches by hand; "I’ll match them myself" sends nothing', async ({ page }, testInfo) => {
  await openApp(page);
  await startOnlineGym(page);
  const sent = await stubAi(page, () => ({ status: 503, body: { reason: 'off', error: 'AI matching is not switched on yet.' } }));
  const csv = testInfo.outputPath('register.csv');
  await writeFile(csv, REGISTER);
  await chooseFile(page, csv);
  const main = page.getByRole('main');

  await page.getByRole('button', { name: 'Ask AI' }).tap();
  await expect(main).toContainText('AI matching is not switched on yet. Match the columns yourself below.');
  expect(sent).toHaveLength(1);

  // By hand: tick the locker column; it keeps its own name.
  await page.getByRole('checkbox', { name: /Keep Column C “Lkr”/ }).tap();
  await expect(main).toContainText('Lkr: 12');
  await page.getByRole('button', { name: 'Add 2 members' }).tap();
  await expect(main).toContainText('2 added, 0 skipped');

  // A second file: the owner says no; the card goes and nothing is sent.
  await page.getByRole('button', { name: 'Import another file' }).tap();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file' }).tap();
  const csv2 = testInfo.outputPath('register2.csv');
  await writeFile(csv2, REGISTER.replace(/98290500/g, '98290600'));
  await (await chooser).setFiles(csv2);
  await page.getByRole('button', { name: 'I’ll match them myself' }).tap();
  await expect(page.getByRole('button', { name: 'Ask AI' })).toHaveCount(0);
  expect(sent).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Add 2 members' })).toBeVisible();
});
