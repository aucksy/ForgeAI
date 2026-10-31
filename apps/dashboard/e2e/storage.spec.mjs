// UAT WP5b journey 23 (INVENTORY O-73): a gym kept in this browser, and the browser's storage.
//
// data/local.ts promises: "A shared front-desk PC has the CRM open in two tabs ... Without a re-read,
// tab B's save silently erases tab A's and both mint the same receipt number." So it re-reads before
// every write. J23a drives that with two real tabs. J23b-d set the browser's storage by code (a
// newer app's data, a cut-off save, a full browser) and check what the owner sees. J23c is the
// owner's decision on U-A13: say so, keep the data, offer Try again / Download / Start a new gym.
import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { addMember, addPlan, expectFitsPhone, freshGym, open, openApp, openMember, sell, sheet, tile, openSettings } from './support.mjs';

const STORE = 'forgeai-crm-v1';

test('J23a two tabs: the second tab\'s sale is not lost and takes the next receipt number; a mobile is never saved twice', async ({ page }) => {
  await freshGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '0', months: '1' });
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  expect(await sell(page, { received: '1500' })).toBe('Membership saved. Receipt 2026-27/0001.');

  // Tab B opens the same gym.
  const tabB = await page.context().newPage();
  await tabB.goto('./');
  await expect(tabB.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await open(tabB, 'Members');
  await expect(tabB.getByText('1 member', { exact: true })).toBeVisible();

  // Tab A sells to Bharat (receipt 0002). Tab B is still showing the old list.
  await page.bringToFront();
  await addMember(page, { name: 'Bharat Singh', phone: '98290 22222' });
  expect(await sell(page, { received: '1500' })).toBe('Membership saved. Receipt 2026-27/0002.');
  await expect(tabB.getByText('1 member', { exact: true })).toBeVisible();

  // Tab B, without reloading, sells to Chetan: the next number (0003), and Bharat is kept.
  await tabB.bringToFront();
  await addMember(tabB, { name: 'Chetan Rao', phone: '98290 33333' });
  expect(await sell(tabB, { received: '1500' })).toBe('Membership saved. Receipt 2026-27/0003.');
  await open(tabB, 'Members');
  await expect(tabB.getByText('3 members', { exact: true })).toBeVisible();

  // Both tabs add the same mobile: the second one (tab A, which never saw it) is refused.
  await addMember(tabB, { name: 'Deepa Nair', phone: '98290 44444' });
  await page.bringToFront();
  await open(page, 'Members');
  await page.getByRole('button', { name: '+ Add member' }).first().tap();
  const add = sheet(page, 'Add member');
  await add.getByLabel('Full name').fill('Deepa N');
  await add.getByLabel('Mobile number').fill('98290 44444');
  await add.getByRole('button', { name: 'Add member' }).tap();
  await expect(add).toContainText('Deepa Nair already has this mobile number in Members.');
  await add.getByRole('button', { name: 'Cancel' }).tap();

  // Tab A, after its refused save, shows what is really there: 4 members, 3 receipts, each once.
  await page.reload();
  await open(page, 'Members');
  await expect(page.getByText('4 members', { exact: true })).toBeVisible();
  await open(page, 'Money');
  await expect(tile(page, 'Collected')).toContainText('₹4,500');
  await expect(tile(page, 'Collected')).toContainText('3 receipts');
  for (const no of ['2026-27/0001', '2026-27/0002', '2026-27/0003']) {
    await expect(page.getByRole('main').getByRole('link', { name: no, exact: true })).toHaveCount(1);
  }
  await openMember(page, 'Chetan Rao');
  await expect(tile(page, 'Dues')).toContainText('Fully paid');
  await tabB.close();
});

test('J23b data saved by a newer app: "Couldn’t open your gym", Try again, and the data is left as it was', async ({ page }) => {
  await openApp(page);
  const newer = JSON.stringify({ version: 2, snapshot: { gym: { name: 'Shakti Gym' }, members: [{ id: 'm1' }] } });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE, newer]);
  await page.reload();
  await expect(page.getByText('Couldn’t open your gym')).toBeVisible();
  await expect(page.getByText('This gym was saved by a newer version of MettleUp (v2; this app reads v1). Reload the page to get the new version. Your data is safe.')).toBeVisible();
  await expectFitsPhone(page, 'on the start-up failure screen');
  await page.getByRole('button', { name: 'Try again' }).tap();
  await expect(page.getByText('Couldn’t open your gym')).toBeVisible();
  // Nothing was written over it, and a copy was kept.
  const kept = await page.evaluate((k) => ({ main: localStorage.getItem(k), copies: Object.keys(localStorage).filter((x) => x.startsWith(`${k}-backup-`)).length }), STORE);
  expect(kept.main).toBe(newer);
  expect(kept.copies).toBeGreaterThan(0);
});

test('J23c a save cut off half-way (damaged data): "We couldn’t read the gym", the data kept and downloadable, a new gym only when asked (U-A13)', async ({ page }) => {
  await freshGym(page);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  const cut = await page.evaluate((k) => {
    const raw = localStorage.getItem(k) ?? '';
    const half = raw.slice(0, Math.floor(raw.length / 2));
    localStorage.setItem(k, half);
    return half;
  }, STORE);
  expect(cut.length).toBeGreaterThan(10);
  await page.reload();

  // Not an empty gym: the screen says what happened, and that the data is kept.
  await expect(page.getByRole('alert')).toHaveText('We couldn’t read the gym saved in this browser. Your data is kept.');
  await expect(page.getByRole('button', { name: 'Start demo' })).toHaveCount(0);
  await expectFitsPhone(page, 'on the damaged-data screen');

  // Download the saved data: exactly what was in the browser.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download the saved data' }).tap();
  const file = await download;
  expect(file.suggestedFilename()).toBe('forgeai-saved-gym-2026-10-17.txt');
  expect(await readFile(await file.path(), 'utf8')).toBe(cut);

  // Try again: the same screen, and still one kept copy (not one more per try).
  await page.getByRole('button', { name: 'Try again' }).tap();
  await expect(page.getByRole('alert')).toHaveText('We couldn’t read the gym saved in this browser. Your data is kept.');
  const copies = () => page.evaluate((k) => Object.keys(localStorage).filter((x) => x.startsWith(`${k}-backup-`)).length, STORE);
  expect(await copies()).toBe(1);

  // Start a new gym asks first, and says the old data can still be downloaded. Cancel changes nothing.
  await page.getByRole('button', { name: 'Start a new gym' }).tap();
  const ask = page.getByRole('group', { name: 'Start a new gym?' });
  await expect(ask).toContainText('The data that couldn’t be read stays here. You can still download it from Settings → Your data.');
  await ask.getByRole('button', { name: 'Cancel' }).tap();
  await expect(page.getByRole('button', { name: 'Start a new gym' })).toBeVisible();
  await page.getByRole('button', { name: 'Start a new gym' }).tap();
  await page.getByRole('button', { name: 'Yes, start a new gym' }).tap();
  await expect(page.getByRole('button', { name: 'Start demo' })).toBeVisible();
  expect(await copies()).toBe(1);

  // Later, in the new gym's Settings: the kept copy is still there to download.
  await page.getByRole('button', { name: 'Start demo' }).tap();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await openSettings(page, 'Sign-in & data');
  await expect(page.getByRole('main')).toContainText('A gym this browser couldn’t read is kept here.');
  const again = page.waitForEvent('download');
  await page.getByRole('main').getByRole('button', { name: 'Download the saved data' }).tap();
  expect(await readFile(await (await again).path(), 'utf8')).toBe(cut);
});

test('J23d the browser is full: the save is refused with plain words, and nothing half-saved', async ({ page }) => {
  await freshGym(page);
  // The browser refuses every save from now on (its storage is full).
  await page.evaluate((k) => {
    const real = Storage.prototype.setItem;
    window.__fullStorage = true;
    Storage.prototype.setItem = function setItem(key, value) {
      if (window.__fullStorage && key === k) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return real.call(this, key, value);
    };
  }, STORE);
  await open(page, 'Members');
  await page.getByRole('button', { name: '+ Add member' }).first().tap();
  const add = sheet(page, 'Add member');
  await add.getByLabel('Full name').fill('Asha Verma');
  await add.getByLabel('Mobile number').fill('98290 11111');
  await add.getByRole('button', { name: 'Add member' }).tap();
  await expect(add.getByRole('alert')).toHaveText('This browser is full. Nothing was saved. Free up space, or put your gym online in Settings.');
  await expectFitsPhone(page, 'with the browser full');

  // Space is freed: the same press saves the member once.
  await page.evaluate(() => {
    window.__fullStorage = false;
  });
  await add.getByRole('button', { name: 'Add member' }).tap();
  await expect(page.getByRole('heading', { name: 'Asha Verma', exact: true })).toBeVisible();
  await open(page, 'Members');
  await expect(page.getByText('1 member', { exact: true })).toBeVisible();
});
