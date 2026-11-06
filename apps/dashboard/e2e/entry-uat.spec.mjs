// F103 / T77 step 2 (6 Nov 2026), UAT of Settings -> Entry machines and the member's machine number, on a phone
// (375 x 812) with one computer picture (1280 x 900). Every step taps the real screen; pictures go to
// e2e/.results/uat (CI uploads them as "dashboard-uat-pictures"). The gym's server is the pretend one (support.mjs).
//
//  1. A server without 0059 (the live server today): the Settings card is there, the screen says plainly
//     "Entry machines are not ready for your gym yet" and offers nothing to press.
//  2. With 0059: "No entry machines yet", Add a machine: the brands (Realtime, Matrix, Hikvision "coming
//     soon"), the steps with our address, a wrong serial, a serial another gym has, then a good one.
//  3. The job: both members get numbers (1001, 1002); the member with a plan is put on the machine; a sale to
//     the other queues them too.
//  4. Online with a refused entry; a second machine Offline (computer picture).
//  5. The member page: the number and the enrol line; a wrong number, a duplicate, then a change (the old
//     number is taken off the machine).
//  6. Remove a machine.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { addMember, addPlan, expectFitsPhone, openMember, openSettings, sell, sheet, startOnlineGym, openApp } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

function rosterIdOf(server, fullName) {
  const r = [...server.records.values()].find((x) => x.k === 'member' && !x.x && x.d.fullName === fullName);
  if (!r) throw new Error(`no member ${fullName}`);
  return r.id;
}

const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);

test.use({ viewport: { width: 375, height: 812 } });

test('F103 step 2: entry machines, not ready, add, numbers, online and offline, refused, remove', async ({ page }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', months: '1' });
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await sell(page, { received: '1500' });
  await addMember(page, { name: 'Ravi Kumar', phone: '98290 22222' });
  const main = page.getByRole('main');

  // 1. The live server today has no 0059: the card is there, the screen says so, nothing to press, nothing sent.
  await openSettings(page);
  const card = main.locator('div').filter({ has: page.getByText('Entry machines', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Open entry machines' }) }).last();
  await expect(card).toContainText('Connect your eSSL or ZKTeco finger or face machine.');
  await card.getByRole('button', { name: 'Open entry machines' }).tap();
  await expect(page.getByRole('heading', { name: 'Entry machines', exact: true })).toBeVisible();
  await expect(main.getByTestId('entry-not-ready')).toContainText('Entry machines are not ready for your gym yet');
  await expect(main.getByTestId('entry-not-ready')).toContainText('Nothing you do here is saved.');
  await expect(main.getByRole('button', { name: 'Add a machine' })).toHaveCount(0);
  await expectFitsPhone(page, 'on Entry machines, not ready');
  await shot(page, 'phone-entry-1-not-ready');
  // The member page shows no machine number while there is no machine.
  await openMember(page, 'Asha Verma');
  await expect(main.getByTestId('machine-number')).toHaveCount(0);
  expect(server.log.filter((c) => c.fn === 'owner_set_machine_numbers' || c.fn === 'owner_queue_machine_commands')).toHaveLength(0);

  // 2. With 0059: no machines yet.
  server.entryServer = true;
  await page.reload();
  await go(page, '/settings/entry');
  await expect(main.getByTestId('entry-empty')).toContainText('No entry machines yet');
  await shot(page, 'phone-entry-2-empty');
  // Still nothing queued: no machine.
  expect(server.log.filter((c) => c.fn === 'owner_set_machine_numbers' || c.fn === 'owner_queue_machine_commands')).toHaveLength(0);

  await main.getByRole('button', { name: 'Add a machine' }).tap();
  const add = sheet(page, 'Add a machine');
  await expect(add).toBeVisible();
  await expect(add.getByRole('button', { name: 'eSSL / ZKTeco' })).toBeVisible();
  for (const soon of ['Realtime', 'Matrix', 'Hikvision']) await expect(add.getByRole('button', { name: `${soon}: coming soon` })).toBeDisabled();
  await expect(add).toContainText('Set Server Address to gate.mettleup.fit');
  await expect(add).toContainText('Set Server Port to 80.');
  await expect(add).toContainText('Step 1: find the serial number');
  await expectFitsPhone(page, 'in Add a machine');
  await shot(page, 'phone-entry-3-add-sheet');
  // A wrong serial.
  await add.getByLabel('Serial number').fill('CJDE 2315#');
  await add.getByRole('button', { name: 'Save machine' }).tap();
  await expect(add).toContainText('A serial number has only letters and numbers, like CJDE231560123.');
  // A serial another gym has.
  await add.getByLabel('Serial number').fill('OTHERGYM1');
  await add.getByRole('button', { name: 'Save machine' }).tap();
  await expect(add).toContainText('This machine is already added to a gym.');
  await shot(page, 'phone-entry-4-add-errors', false);
  expect(server.entryMachines).toHaveLength(0);
  // A good one.
  await add.getByLabel('Serial number').fill('CJDE231560123');
  await add.getByLabel('Machine name').fill('Front door');
  await add.getByRole('button', { name: 'Save machine' }).tap();
  await expect(add).toBeHidden();
  await expect(page.getByText('Saved. Front door shows Online within a minute of its first call.')).toBeVisible();
  const front = main.getByTestId('entry-machine').filter({ hasText: 'Front door' });
  await expect(front).toContainText('Not connected yet');
  await expect(front).toContainText('eSSL / ZKTeco · Serial CJDE231560123');

  // 3. The job: numbers for both members; Asha (with a plan) goes on the machine, Ravi (no plan) does not.
  const asha = rosterIdOf(server, 'Asha Verma');
  const ravi = rosterIdOf(server, 'Ravi Kumar');
  await expect.poll(() => server.entryNumbers.get(asha), { timeout: 15_000 }).toBe('1001');
  expect(server.entryNumbers.get(ravi)).toBe('1002');
  await expect.poll(() => server.entryQueue.map((q) => `${q.command.type}:${q.command.memberNo}`), { timeout: 15_000 }).toEqual(['upsert_member:1001']);
  expect(server.entryQueue[0].command).toMatchObject({ name: 'Asha Verma', active: true });
  expect(server.entryMachines[0].sweptOn).toBe('2026-10-17');
  // Adding the same serial again (this gym's own list): refused on the form.
  await main.getByRole('button', { name: 'Add a machine' }).tap();
  await sheet(page, 'Add a machine').getByLabel('Serial number').fill('cjde231560123');
  await sheet(page, 'Add a machine').getByRole('button', { name: 'Save machine' }).tap();
  await expect(sheet(page, 'Add a machine')).toContainText('This machine is already on your list.');
  await sheet(page, 'Add a machine').getByRole('button', { name: 'Cancel' }).tap();

  // A sale to Ravi puts him on the machine.
  await openMember(page, 'Ravi Kumar');
  await sell(page, { received: '1500' });
  await expect.poll(() => server.entryQueue.some((q) => q.command.type === 'upsert_member' && q.command.memberNo === '1002'), { timeout: 15_000 }).toBe(true);

  // 4. Online with a refused entry this morning; a second machine Offline since last night.
  const m = server.entryMachines[0];
  // The page's own clock (installed at NOW, running since): called 30 seconds ago.
  m.lastSeenAt = (await page.evaluate(() => Date.now())) - 30_000;
  m.refusedToday = 1;
  m.lastRefused = { memberNo: '1002', at: new Date('2026-10-17T07:15:00+05:30').getTime() };
  server.entryMachines.push({
    ...m, id: 'mac-back', name: 'Back gate', serial: 'BKG7781', lastSeenAt: new Date('2026-10-16T21:02:00+05:30').getTime(),
    refusedToday: 0, lastRefused: null, sweptOn: '2026-10-17',
  });
  await page.reload();
  await go(page, '/settings/entry');
  await expect(front).toContainText('Online');
  await expect(front).toContainText('Refused today: 1');
  await expect(front).toContainText('Last refused: number 1002 (Ravi Kumar) at 7:15 am');
  const back = main.getByTestId('entry-machine').filter({ hasText: 'Back gate' });
  await expect(back).toContainText('Offline');
  await expect(back).toContainText('Last seen yesterday at 9:02 pm. Check the machine has internet.');
  await expectFitsPhone(page, 'on Entry machines, online and offline');
  await shot(page, 'phone-entry-5-online-offline-refused');
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, 'computer-entry-5-online-offline-refused');
  await page.setViewportSize({ width: 375, height: 812 });

  // 5. The member page.
  await openMember(page, 'Asha Verma');
  const num = main.getByTestId('machine-number');
  await expect(num).toContainText('Machine number: 1001');
  await expect(num).toContainText('Enrol this member’s finger or face on the machine with number 1001.');
  await num.scrollIntoViewIfNeeded();
  await shot(page, 'phone-entry-6-member-number', false);
  await num.getByRole('button', { name: 'Change number' }).tap();
  const change = sheet(page, 'Machine number for Asha Verma');
  await change.getByLabel('Machine number').fill('12a');
  await change.getByRole('button', { name: 'Save number' }).tap();
  await expect(change).toContainText('Type a machine number from 1 to 999999999, with no letters or spaces.');
  await change.getByLabel('Machine number').fill('1002');
  await change.getByRole('button', { name: 'Save number' }).tap();
  await expect(change).toContainText('Number 1002 is already Ravi Kumar’s. Pick another number.');
  await shot(page, 'phone-entry-7-number-duplicate', false);
  await change.getByLabel('Machine number').fill('1050');
  await change.getByRole('button', { name: 'Save number' }).tap();
  await expect(change).toBeHidden();
  await expect(page.getByText('Saved. Enrol the finger or face again on the machine with number 1050.')).toBeVisible();
  await expect(num).toContainText('Machine number: 1050');
  expect(server.entryNumbers.get(asha)).toBe('1050');
  await expect.poll(() => server.entryQueue.some((q) => q.command.type === 'remove_member' && q.command.memberNo === '1001'), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => server.entryQueue.some((q) => q.command.type === 'upsert_member' && q.command.memberNo === '1050'), { timeout: 15_000 }).toBe(true);

  // 6. Remove the back gate.
  await go(page, '/settings/entry');
  await back.getByRole('button', { name: 'Remove Back gate' }).tap();
  const rm = sheet(page, 'Remove Back gate?');
  await expect(rm).toContainText('MettleUp stops reading entries from this machine.');
  await shot(page, 'phone-entry-8-remove', false);
  await rm.getByRole('button', { name: 'Remove machine' }).tap();
  await expect(rm).toBeHidden();
  await expect(page.getByText('Back gate removed.')).toBeVisible();
  await expect(main.getByTestId('entry-machine')).toHaveCount(1);
  expect(server.entryMachines.map((x) => x.id)).toEqual(['mac-1']);
});
