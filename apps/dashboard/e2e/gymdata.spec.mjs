// Launch D8 (21 Oct 2026): a gym that leaves takes everything with it, and an online gym can ask
// ForgeAI to delete it. The delete request goes to the feedback box (answered here); nothing is
// deleted by the button itself.
import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { open, openApp, sheet, startDemo, startOnlineGym } from './support.mjs';

test('J31a Download all your gym’s data: an Excel file and a full copy, with the demo gym inside', async ({ page }) => {
  await openApp(page);
  await startDemo(page);
  await open(page, 'Settings');
  const files = [];
  page.on('download', (d) => files.push(d));
  await page.getByRole('button', { name: 'Download all your gym’s data' }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Downloaded: an Excel file and a full copy.' })).toBeVisible();
  await expect.poll(() => files.length).toBe(2);
  const names = files.map((d) => d.suggestedFilename()).sort();
  expect(names[0]).toMatch(/ data 2026-10-17 \(full copy\)\.json$/);
  expect(names[1]).toMatch(/ data 2026-10-17\.xlsx$/);
  const json = JSON.parse(await readFile(await files.find((d) => d.suggestedFilename().endsWith('.json')).path(), 'utf8'));
  expect(json.members.length).toBeGreaterThan(0);
  expect(json.payments.length).toBeGreaterThan(0);
  const xlsx = await readFile(await files.find((d) => d.suggestedFilename().endsWith('.xlsx')).path());
  expect(xlsx.subarray(0, 2).toString()).toBe('PK'); // a real Excel (zip) file
});

test('J31b an online gym asks to be deleted: asked first, request sent, nothing deleted here', async ({ page }) => {
  const sent = [];
  await page.route('**/api/feedback', async (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' });
  });
  await openApp(page);
  await startOnlineGym(page);
  await open(page, 'Settings');
  await page.getByRole('button', { name: 'Delete our gym from ForgeAI' }).tap();
  const ask = sheet(page, 'Delete your gym from ForgeAI?');
  await expect(ask).toContainText('Download your data first.');
  await ask.getByRole('button', { name: 'Cancel' }).tap();
  expect(sent).toHaveLength(0);

  await page.getByRole('button', { name: 'Delete our gym from ForgeAI' }).tap();
  await sheet(page, 'Delete your gym from ForgeAI?').getByRole('button', { name: 'Send delete request' }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Request sent.' })).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ source: 'admin', screen: 'settings/delete-request' });
  expect(sent[0].text).toMatch(/^DELETE REQUEST: gym "Shakti Gym", code /);
  await open(page, 'Members'); // the gym is still all here
});
