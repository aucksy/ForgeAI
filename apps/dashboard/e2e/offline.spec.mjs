// R-55 (22 Oct 2026), offline front desk step 1 (owner #7): an online gym's panel still OPENS with no
// internet, shows every member from the copy kept on this device under an "Offline mode" bar, and
// says plainly that saving waits for the internet. When the internet is back the bar goes and saving
// works again. (Check-ins saved offline are step 2.)
import { expect, test } from '@playwright/test';

import { addMember, expectFitsPhone, open, openApp, sheet, startOnlineGym } from './support.mjs';

/** The service worker has kept the panel's page, and this device has kept its copy of the gym. */
async function keptForOffline(page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          const page = await (await caches.open('forgeai-panel-v1')).match('/');
          const gyms = await new Promise((resolve) => {
            const req = indexedDB.open('forgeai-offline', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('gyms');
            req.onsuccess = () => {
              const t = req.result.transaction('gyms', 'readonly').objectStore('gyms').count();
              t.onsuccess = () => resolve(t.result);
              t.onerror = () => resolve(0);
            };
            req.onerror = () => resolve(0);
          });
          return Boolean(page) && gyms > 0;
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
}

test('J34 offline: the panel opens with no internet, shows the kept gym, refuses saves in plain words, recovers', async ({ page }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await keptForOffline(page);

  // The internet goes; the desk reloads the panel (or the computer restarts). The pretend server
  // answers inside the browser, so it is switched off too.
  await page.context().setOffline(true);
  server.disconnect();
  await page.reload();
  const bar = page.getByRole('status').filter({ hasText: 'Offline mode.' });
  await expect(bar).toBeVisible({ timeout: 15_000 });
  await expect(bar).toContainText('Saving waits until the internet is back.');
  await expectFitsPhone(page, 'offline, on Today');

  // Looking things up works.
  await open(page, 'Members');
  await expect(page.getByText('Asha Verma')).toBeVisible();

  // Saving says why it cannot, in plain words, and nothing is half-saved.
  await page.getByRole('button', { name: '+ Add member' }).first().tap();
  const s = sheet(page, 'Add member');
  await s.getByLabel('Full name').fill('Ravi Kumar');
  await s.getByLabel('Mobile number').fill('98290 22222');
  await s.getByRole('button', { name: 'Add member' }).tap();
  await expect(s).toContainText("No internet right now, so this can't be saved yet.", { timeout: 15_000 });

  // The internet is back: the bar goes by itself, and the same save goes through.
  await page.context().setOffline(false);
  server.reconnect();
  await expect(bar).toBeHidden({ timeout: 20_000 });
});
