// Offline front desk, step 3 (owner #7, 24 Oct 2026): with no internet the desk takes a payment
// (printed with this device's own receipt number), adds a new member and checks them in. The page is
// restarted while still offline: everything is still there, marked "Waiting to send". When the
// internet is back it all goes by itself, each thing exactly once, and the bar says "All sent".
import { expect, test } from '@playwright/test';

import { addMember, addPlan, expectFitsPhone, open, openMember, sell, sheet, startOnlineGym } from './support.mjs';

/** The service worker has kept the panel's page, this device has its copy and its receipt series. */
async function readyForOffline(page, server, { series = true } = {}) {
  await expect
    .poll(
      () =>
        page.evaluate(async (withSeries) => {
          await navigator.serviceWorker.ready;
          const shell = await (await caches.open('forgeai-panel-v1')).match('/');
          const count = (name, store) =>
            new Promise((resolve) => {
              const req = indexedDB.open(name, 1);
              req.onupgradeneeded = () => req.result.createObjectStore(store);
              req.onsuccess = () => {
                const t = req.result.transaction(store, 'readonly').objectStore(store).count();
                t.onsuccess = () => resolve(t.result);
                t.onerror = () => resolve(0);
              };
              req.onerror = () => resolve(0);
            });
          return Boolean(shell) && (await count('forgeai-offline', 'gyms')) > 0 && (!withSeries || (await count('forgeai-outbox', 'gyms')) > 0);
        }, series),
      { timeout: 20_000 },
    )
    .toBe(true);
  // The device's receipt series (D1) was given while online, when a money sheet first opened.
  if (series) await expect.poll(() => server.records.has('enquiry:deskseries-1'), { timeout: 20_000 }).toBe(true);
}

/** How many pushes carried this record (by kind and id). */
const timesSent = (server, k, id) => server.pushes.flat().filter((r) => r.k === k && r.id === id).length;

test('J34b offline: a payment, a new member and a check-in made offline survive a restart and arrive once', async ({ page }) => {
  const { openApp } = await import('./support.mjs');
  const server = await openApp(page);
  await startOnlineGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '0', months: '1' });
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await sell(page, { received: '500' });
  await readyForOffline(page, server);

  // The internet goes and the desk reloads (or the computer restarts).
  await page.context().setOffline(true);
  server.disconnect();
  await page.reload();
  const bar = page.getByRole('status').filter({ hasText: 'Offline mode.' });
  await expect(bar).toBeVisible({ timeout: 15_000 });
  await expect(bar).toContainText('Check-ins, payments and new members are saved on this device');

  // 1. A payment: Asha pays the Rs 1,000 she owes. Its receipt number is this desk's own series.
  await openMember(page, 'Asha Verma');
  await page.getByRole('button', { name: 'Collect payment' }).tap();
  const c = sheet(page, 'Collect payment');
  await c.getByLabel('Amount received').fill('1000');
  await c.getByRole('button', { name: 'Save payment' }).tap();
  await expect(c).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText('Payment saved on this device. Receipt 2026-27/D1-0001.', { exact: false })).toBeVisible();
  await expect(page.getByText('Waiting to send').first()).toBeVisible();
  // Not safe to keep for later: greyed out, with the reason.
  await expect(page.getByRole('button', { name: 'Cancel receipt' }).first()).toBeDisabled();
  await expectFitsPhone(page, 'offline, on a member with a waiting receipt');

  // The receipt prints now, with the number it keeps for ever.
  await page.getByRole('link', { name: /2026-27\/D1-0001/ }).first().tap();
  await expect(page.getByRole('main')).toContainText('2026-27/D1-0001');

  // 2. A new member, then 3. their check-in.
  await addMember(page, { name: 'Ravi Kumar', phone: '98290 22222' });
  await page.getByRole('button', { name: 'Check in', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Checked in today' })).toBeVisible({ timeout: 15_000 });
  await expect(bar).toContainText('3 waiting to send.');
  expect(server.pushes.flat().some((r) => r.k === 'payment' && r.d?.receiptNo === '2026-27/D1-0001')).toBe(false);

  // Restart while still offline: everything is still on this device.
  await page.reload();
  await expect(bar).toBeVisible({ timeout: 15_000 });
  await expect(bar).toContainText('3 waiting to send.');
  await open(page, 'Members');
  await expect(page.getByText('Ravi Kumar')).toBeVisible();
  await open(page, 'Today');
  await expect(page.getByText('₹1,000 in 1 payment taken on this device is waiting to send.')).toBeVisible();

  // The internet is back: it all goes by itself, then "All sent".
  await page.context().setOffline(false);
  server.reconnect();
  await expect(page.getByText('All sent. Everything saved on this device is now online.')).toBeVisible({ timeout: 25_000 });
  await expect(bar).toBeHidden();

  const pay = server.rows('payment').filter((p) => p.receiptNo === '2026-27/D1-0001');
  expect(pay).toHaveLength(1);
  expect(pay[0]).toMatchObject({ amountP: 100_000, offline: true });
  const ravi = server.rows('member').filter((m) => m.fullName === 'Ravi Kumar');
  expect(ravi).toHaveLength(1);
  expect(server.rows('visit').filter((v) => v.memberId === ravi[0].id)).toHaveLength(1);
  // Each went once: never a second push of the same record.
  expect(timesSent(server, 'payment', pay[0].id)).toBe(1);
  expect(timesSent(server, 'member', ravi[0].id)).toBe(1);

  // A later look (the 15-second refresh, a reload) sends nothing again.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  expect(timesSent(server, 'payment', pay[0].id)).toBe(1);
  // Online again: the next receipt is from the normal series.
  await openMember(page, 'Ravi Kumar');
  await expect(page.getByText('Waiting to send')).toHaveCount(0);
});

test('J34c offline: pages that need the internet say so; signing out waits until everything is sent', async ({ page }) => {
  const { openApp } = await import('./support.mjs');
  const server = await openApp(page);
  await startOnlineGym(page);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  // No money sheet opened here: no receipt series is claimed (review SHOULD 5).
  await readyForOffline(page, server, { series: false });
  expect(server.records.has('enquiry:deskseries-1')).toBe(false);
  await page.context().setOffline(true);
  server.disconnect();
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Offline mode.' })).toBeVisible({ timeout: 15_000 });

  // Messages, staff and sign-in: one plain card instead of the page.
  await open(page, 'Messages & offers');
  await expect(page.getByText('Messages & offers needs the internet')).toBeVisible();
  await open(page, 'Staff & sign-in');
  await expect(page.getByText('Staff & sign-in needs the internet')).toBeVisible();

  // A check-in waits on this device.
  await openMember(page, 'Asha Verma');
  await page.getByRole('button', { name: 'Check in', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Checked in today' })).toBeVisible({ timeout: 15_000 });

  // The internet is back, but the server takes nothing for now (MettleUp paused the gym): it keeps waiting.
  server.hqStatus = 'suspended';
  await page.context().setOffline(false);
  server.reconnect();
  await expect(page.getByText('Internet is back. Sending 1 saved on this device')).toBeVisible({ timeout: 25_000 });

  // Signing out now would leave it behind on this device: the sheet says so and "Sign out" is greyed out.
  await open(page, 'Staff & sign-in');
  await page.getByRole('button', { name: 'Sign out of this device' }).tap();
  const out = sheet(page, 'Sign out of this device?');
  await expect(out).toContainText('1 saved on this device is still waiting to send.');
  await expect(out.getByRole('button', { name: 'Sign out' })).toBeDisabled();
  await out.getByRole('button', { name: 'Cancel' }).tap();

  // The gym is switched back on: it goes by itself, once, and signing out works again.
  server.hqStatus = 'active';
  await expect(page.getByText('All sent. Everything saved on this device is now online.')).toBeVisible({ timeout: 25_000 });
  expect(server.rows('visit')).toHaveLength(1);
  await page.getByRole('button', { name: 'Sign out of this device' }).tap();
  await expect(sheet(page, 'Sign out of this device?').getByRole('button', { name: 'Sign out' })).toBeEnabled();
});
test('J34d a payment whose save got no answer: kept, not printable yet, never taken twice, sent once', async ({ page }) => {
  const { openApp } = await import('./support.mjs');
  const server = await openApp(page);
  await startOnlineGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '0', months: '1' });
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await sell(page, { received: '500' });

  // The internet drops for saving only: every try of this payment's save gets no answer.
  server.dropAfterCalls('crm_push', 0);
  await page.getByRole('button', { name: 'Collect payment' }).tap();
  const c = sheet(page, 'Collect payment');
  await c.getByLabel('Amount received').fill('500');
  await c.getByRole('button', { name: 'Save payment' }).tap();
  await expect(c).toContainText("The internet dropped while saving, so it may not have gone through yet.", { timeout: 20_000 });
  await c.getByRole('button', { name: 'Cancel' }).tap();

  // It shows on the member's page as waiting; its receipt can't be printed until its number is sure.
  await expect(page.getByText('Waiting to send').first()).toBeVisible();
  await page.getByRole('link', { name: /2026-27\/0002/ }).first().tap();
  await expect(page.getByText('Not confirmed yet: the internet dropped while this was saved.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print' })).toBeDisabled();
  await page.goBack();

  // A second payment for her is refused while the first is not confirmed (a second receipt for the same cash).
  await page.getByRole('button', { name: 'Collect payment' }).tap();
  const c2 = sheet(page, 'Collect payment');
  await c2.getByLabel('Amount received').fill('500');
  await c2.getByRole('button', { name: 'Save payment' }).tap();
  await expect(c2).toContainText('A payment for this member is still being sent.', { timeout: 20_000 });
  await c2.getByRole('button', { name: 'Cancel' }).tap();

  // The internet is back: it goes by itself, once.
  server.reconnect();
  await expect(page.getByText('All sent. Everything saved on this device is now online.')).toBeVisible({ timeout: 25_000 });
  const pays = server.rows('payment').filter((p) => p.amountP === 50_000);
  expect(pays.map((p) => p.receiptNo).sort()).toEqual(['2026-27/0001', '2026-27/0002']);
  expect(timesSent(server, 'payment', pays.find((p) => p.receiptNo === '2026-27/0002').id)).toBe(1);
});