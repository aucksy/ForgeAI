// #47 AI import (23 Oct 2026): the owner of an online gym imports an old register with columns the
// app has no box for (locker, blood group, referred by) and an Aadhaar column. The AI endpoint is a
// stand-in (page.route): it checks what the browser sends (no phone numbers, the sign-in key in a
// header) and answers like the Worker would. Then: our own rules when AI is off. R-157 (28 Oct 2026):
// no "Ask AI" button any more; the sheet goes to the AI by itself, once, when it opens.
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

  // R-157: no question and no button: the AI is asked by itself, once. The Aadhaar column is set aside.
  await expect(page.getByRole('button', { name: 'Ask AI' })).toHaveCount(0);
  await expect(main).toContainText('AI matched 3 columns. Check the boxes below and change any that are wrong.');
  await expect(main).toContainText('Not imported: Column D “Aadhaar No.” has Aadhaar numbers. ID numbers are never imported.');
  await expectFitsPhone(page, 'after the AI matched');

  // What left the browser: column names, masked examples and counts, no mobile, no Aadhaar, and
  // (#59) no member's or referrer's name, only "[name]"; the key in a header.
  expect(sent).toHaveLength(1);
  expect(sent[0].body).toContain('"stats":{"filled":100,"mobile":100');
  expect(sent[0].key.length).toBeGreaterThanOrEqual(16);
  expect(sent[0].body).not.toMatch(/9829050001|9829050002|2345 6789 0124|234567890124/);
  expect(sent[0].body).not.toMatch(/Ravi|Kumar|Sita|Devi|Sunil/);
  expect(sent[0].body).toContain('[name]');
  expect(sent[0].body).toContain('98XXXXXX01');
  expect(sent[0].body).toContain('[ID number]');
  expect(sent[0].body).toContain('"B+"');
  expect(sent[0].body).not.toContain(sent[0].key);

  // #36: every column is kept unless the owner unticks it. "Referred By" was a name the AI was not
  // sure of: the column is still kept, and the owner gives it a better name.
  const lockers = page.getByRole('checkbox', { name: /Keep Column C “Lkr”/ });
  const blood = page.getByRole('checkbox', { name: /Keep Column E “BG”/ });
  const referred = page.getByRole('checkbox', { name: /Keep Column F “Ref By”/ });
  await expect(lockers).toBeChecked();
  await expect(blood).toBeChecked();
  await expect(referred).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Aadhaar/ })).toHaveCount(0);
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

test('J47b AI is off: one calm line, our own rules matched, the import still works', async ({ page }, testInfo) => {
  await openApp(page);
  await startOnlineGym(page);
  const sent = await stubAi(page, () => ({ status: 503, body: { reason: 'off', error: 'AI matching is not switched on yet.' } }));
  const csv = testInfo.outputPath('register.csv');
  await writeFile(csv, REGISTER);
  await chooseFile(page, csv);
  const main = page.getByRole('main');

  await expect(main).toContainText('Matched without AI (it was not available). Check the columns below.');
  expect(sent).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Ask AI' })).toHaveCount(0);

  // Our rules: the locker column is already kept (#36: every column is, unless unticked), with its own name.
  await expect(page.getByRole('checkbox', { name: /Keep Column C “Lkr”/ })).toBeChecked();
  await expect(main).toContainText('Lkr: 12');
  await page.getByRole('button', { name: 'Add 2 members' }).tap();
  await expect(main).toContainText('2 added, 0 skipped');
});

// R-155 / R-157: Phone (landlines, blanks), Home phone, Cell phone (the real mobiles).
const PHONES = [
  'Name,Phone,Home phone,Cell phone,Plan',
  'Asha Test,0141-2745101,,9876500011,Monthly',
  'Ravi Test,,0141-2745102,9876500012,Monthly',
  'Neha Test,0141-2745103,,9876500013,Monthly',
  'Sunil Test,,9876500025,,Monthly',
  '',
].join('\n');

test('J47c several phone columns: Mobile is Cell phone, the AI marks it, an empty cell falls back', async ({ page }, testInfo) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  const sent = await stubAi(page, () => ({
    status: 200,
    body: {
      columns: [
        { column: 0, target: 'fullName', confidence: 0.99 },
        { column: 1, target: 'phone', confidence: 0.97 }, // wrong: our counts refuse it
        { column: 3, target: 'extra:Cell', confidence: 0.6 },
      ],
      provider: 'gemini',
      left: 18,
    },
  }));
  const csv = testInfo.outputPath('phones.csv');
  await writeFile(csv, PHONES);
  await chooseFile(page, csv);
  const main = page.getByRole('main');
  await expect(main).toContainText(/AI (matched|checked)/);
  expect(sent).toHaveLength(1);
  await expect(page.getByLabel(/^Mobile \*/)).toHaveValue('3');
  await page.getByRole('button', { name: 'Add 4 members' }).tap();
  await expect(main).toContainText('4 added, 0 skipped');
  const phones = server.rows('member').map((m) => m.phone).sort();
  expect(phones.join(' ')).toMatch(/9876500011.*9876500012.*9876500013.*9876500025/);
});
