// R-578 (owner, 15 Nov 2026): UAT of "Send a test alert" on the alerts card in Settings (supabase 0095). The owner
// turns alerts on for this device, taps "Send a test alert", and the card answers within about 90 seconds: "It showed
// on this device at ..." (the service worker said so), "We sent it, but this device has not shown it yet." with things
// to look at, or "not left MettleUp yet" (our side). Every state is photographed on a phone and a computer, dark and
// light (e2e/.results/uat, CI uploads them as "dashboard-uat-pictures").
// The gym server is the pretend one (support.mjs) answering 0076 and 0095 by their rules: a test goes to this browser
// only, once a minute. A headless browser has no push company, so the browser's push parts are stand-ins and the
// service worker's "shown" is played by the test (the server row, and the worker's message to the open page).
//
//  1. A server without 0095 (the live server today): the alerts card as before, no test button.
//  2. Before: "Send a test alert" under "Alerts are on for this device."
//  3. Sent and waiting: the call carries this browser's address only; no second notice from the open page.
//  4. Shown: "Sent. Did a notice pop up? It showed on this device at 10:01 am."; "No notice popped up" opens the checks.
//  5. Too soon: a second tap within the minute says when the next can go.
//  6. Not shown after 90 s: the three checks; it turns to "shown" by itself if the device shows it later.
//  7. Not sent (our side), and the same answer again after the admin app is opened again.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { NoSuchFunction, TEST_ALERT_FNS, WEB_PUSH_FNS, expectFitsPhone, openApp, startOnlineGym, wait } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/e2e-owner-phone';

/** 0076 + 0095 on the pretend server. `push.now()` is the page's clock (set by the test before each tap). */
function installPush(server) {
  const push = { on: true, testOn: true, devices: new Map(), tests: [], at: 0, alerts: [] };
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (fn === 'owner_alerts') {
      server.calls.push(fn);
      server.log.push({ fn, args });
      server.anyone(args.p_key);
      // A server that wrongly listed a test alert: the open page must still never make its own notice for it.
      return { ok: true, alerts: push.alerts };
    }
    if (!WEB_PUSH_FNS.includes(fn) && !TEST_ALERT_FNS.includes(fn)) return base(fn, args);
    server.calls.push(fn);
    server.log.push({ fn, args });
    if (!push.on || (TEST_ALERT_FNS.includes(fn) && !push.testOn)) throw new NoSuchFunction(`Could not find the function public.${fn} in the schema cache`);
    server.anyone(args.p_key);
    const mine = push.devices.get(args.p_endpoint) === args.p_key;
    const last = push.tests.filter((t) => t.endpoint === args.p_endpoint).at(-1) ?? null;
    const wait = last ? Math.max(0, Math.ceil((last.at + 60_000 - push.at) / 1000)) : 0;
    switch (fn) {
      case 'owner_alert_settings':
        return { ok: true, mode: 'daily', minute: 660, weekday: 1, canEdit: true };
      case 'owner_save_web_push':
        push.devices.set(args.p_endpoint, args.p_key);
        return { ok: true, on: true };
      case 'owner_clear_web_push':
        push.devices.delete(args.p_endpoint);
        return { ok: true, on: false, removed: 1 };
      case 'owner_web_push_on':
        return { ok: true, on: mine };
      case 'owner_send_test_alert': {
        if (!mine) return { ok: false, error: 'NOT_ON' };
        if (wait > 0) return { ok: false, error: 'TOO_SOON', wait };
        const t = { id: `0b6f6a52-3c1e-4d2a-9f53-${String(push.tests.length + 1).padStart(12, '0')}`, endpoint: args.p_endpoint, at: push.at, sentAt: null, sentHow: null, shownAt: null };
        push.tests.push(t);
        return { ok: true, id: t.id, at: t.at };
      }
      case 'owner_test_alert': {
        if (!mine) return { ok: true, on: false, test: null, wait: 0 };
        const fresh = last && push.at - last.at < 60 * 60_000 ? last : null;
        return { ok: true, on: true, wait, test: fresh && { id: fresh.id, at: fresh.at, sentAt: fresh.sentAt, sentHow: fresh.sentHow, shownAt: fresh.shownAt } };
      }
      default:
        throw new Error(`unexpected ${fn}`);
    }
  };
  return push;
}

/**
 * A browser that can get pushes: the permission (kept across reloads), the service worker's stand-in (its messages
 * to the page can be played with window.__swSay), and window.__notes for any notice the open page makes itself.
 */
async function pushBrowser(page) {
  await page.route('**/api/push/web-key', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'B'.repeat(86) + 'A' }) }),
  );
  await page.addInitScript((end) => {
    window.__notes = [];
    const perm = () => localStorage.getItem('e2e.notifyPermission') || 'default';
    class FakeNotification {
      static get permission() {
        return perm();
      }
      static requestPermission() {
        localStorage.setItem('e2e.notifyPermission', 'granted');
        return Promise.resolve('granted');
      }
      constructor(title, opts = {}) {
        window.__notes.push({ title, tag: opts.tag });
      }
      close() {}
    }
    window.Notification = FakeNotification;
    if (!('PushManager' in window)) window.PushManager = function PushManager() {};
    const sub = {
      endpoint: end,
      toJSON: () => ({ endpoint: end, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } }),
      unsubscribe: async () => {
        localStorage.removeItem('e2e.subscribed');
        return true;
      },
    };
    const pushManager = {
      getSubscription: async () => (localStorage.getItem('e2e.subscribed') ? sub : null),
      subscribe: async () => {
        localStorage.setItem('e2e.subscribed', '1');
        return sub;
      },
    };
    const reg = {
      pushManager,
      showNotification: async (title, opts = {}) => {
        window.__notes.push({ title, tag: opts.tag, fromWorker: true });
      },
    };
    const listeners = new Set();
    window.__swSay = (data) => {
      for (const fn of listeners) fn({ data });
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => reg,
        ready: Promise.resolve(reg),
        register: async () => reg,
        addEventListener: (name, fn) => {
          if (name === 'message') listeners.add(fn);
        },
        removeEventListener: (name, fn) => {
          if (name === 'message') listeners.delete(fn);
        },
        controller: null,
      },
    });
  }, ENDPOINT);
}

const pageNow = (page) => page.evaluate(() => Date.now());

/** "10:01 am" in India time, as the card says it. */
function indiaClock(ms) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(ms))
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

async function shot(page, box, name) {
  await box.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Signed in, Settings open, alerts on for this device. */
async function settingsWithAlertsOn(page, { light, width, height }) {
  if (width) await page.setViewportSize({ width, height });
  await pushBrowser(page);
  const server = await openApp(page);
  const push = installPush(server);
  await startOnlineGym(page);
  if (light) {
    await page.getByRole('radio', { name: 'Light' }).first().click();
    await expect(page.getByRole('radio', { name: 'Light' }).first()).toBeChecked();
  }
  await page.evaluate(() => {
    window.location.hash = '/settings';
  });
  const main = page.getByRole('main');
  const device = main.getByTestId('alerts-device');
  await expect(device).toContainText('Alerts are off for this device.', { timeout: 15_000 });
  await device.getByRole('button', { name: 'Turn on alerts on this device' }).click();
  await expect(device).toContainText('Alerts are on for this device.');
  return { server, push, main, device };
}

test('R-578: without 0095 the alerts card is as before, with no test button', async ({ page }) => {
  await pushBrowser(page);
  const server = await openApp(page);
  const push = installPush(server);
  push.testOn = false;
  await startOnlineGym(page);
  await page.evaluate(() => {
    window.location.hash = '/settings';
  });
  const device = page.getByRole('main').getByTestId('alerts-device');
  await device.getByRole('button', { name: 'Turn on alerts on this device' }).click({ timeout: 15_000 });
  await expect(device).toContainText('Alerts are on for this device.');
  await page.waitForTimeout(500);
  await expect(device.getByTestId('test-alert')).toHaveCount(0);
  await expect(device.getByRole('button', { name: 'Send a test alert' })).toHaveCount(0);
  await expect(device.getByRole('button', { name: 'Turn off on this device' })).toBeVisible();
});

for (const look of [
  { name: 'phone-dark', light: false },
  { name: 'phone-light', light: true },
  { name: 'computer-dark', light: false, width: 1280, height: 900 },
  { name: 'computer-light', light: true, width: 1280, height: 900 },
]) {
  test(`R-578 Send a test alert, every answer (${look.name})`, async ({ page }) => {
    const { server, push, device } = await settingsWithAlertsOn(page, look);
    const box = device.getByTestId('test-alert');
    const phone = !look.width;

    // 2. Before.
    await expect(box).toHaveAttribute('data-state', 'none', { timeout: 15_000 });
    await expect(box).toContainText('Check that alerts reach this device, even with the admin app closed. Only this device gets the test.');
    const send = box.getByRole('button', { name: 'Send a test alert' });
    await expect(send).toBeVisible();
    if (phone) await expectFitsPhone(page, 'on Settings with "Send a test alert"');
    await shot(page, box, `${look.name}-test-alert-1-before`);

    // 3. Sent and waiting. The call names this browser only.
    push.at = await pageNow(page);
    await send.click();
    await expect(box).toHaveAttribute('data-state', 'waiting');
    await expect(box).toContainText('We are sending a test alert to this device. It can take up to a minute. You can close the admin app now to check that alerts come when it is closed.');
    await expect(box.getByRole('button', { name: 'Send a test alert' }), 'no second tap while it is on its way').toHaveCount(0);
    const sent = server.log.filter((c) => c.fn === 'owner_send_test_alert');
    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0].args).sort()).toEqual(['p_endpoint', 'p_key']);
    expect(sent[0].args.p_endpoint).toBe(ENDPOINT);
    if (phone) await expectFitsPhone(page, 'on Settings while the test is on its way');
    await shot(page, box, `${look.name}-test-alert-2-waiting`);

    // 4. HQ sends it within the minute; the service worker shows it and says so (the server row, then its message).
    //    The open page makes no notice of its own (one notice, not two), even if a server listed the test.
    push.alerts = [{ id: push.tests[0].id, kind: 'test_alert', line: 'Alerts work on this device.', route: '/settings', urgent: true, at: push.tests[0].at }];
    await wait(page, 35_000);
    push.tests[0].sentAt = push.tests[0].at + 30_000;
    push.tests[0].sentHow = 'instant';
    const shownAt = (await pageNow(page)) + 1_000;
    await wait(page, 1_000);
    push.tests[0].shownAt = shownAt;
    await page.evaluate((id) => window.__swSay({ type: 'mettleup-test-shown', id }), push.tests[0].id);
    await expect(box).toHaveAttribute('data-state', 'shown');
    await expect(box).toContainText(`Sent. Did a notice pop up? It showed on this device at ${indiaClock(shownAt)}.`);
    await wait(page, 61_000);
    expect(await page.evaluate(() => window.__notes), 'the open page never makes its own notice for a test').toEqual([]);
    if (phone) await expectFitsPhone(page, 'on Settings with the test shown');
    await shot(page, box, `${look.name}-test-alert-3-shown`);
    await box.getByRole('button', { name: 'No notice popped up' }).click();
    const help = box.getByTestId('test-alert-checks');
    await expect(help).toContainText('This device got the test, but the notice may have been hidden. Things to look at on this device:');
    await expect(help.getByRole('listitem')).toHaveCount(2);
    await expect(help).toContainText('Notices for “MettleUp for Gyms” (or for your browser) are allowed in the device’s settings, under Apps or Notifications.');
    await expect(help).toContainText('A battery saver or “Do not disturb” is not holding notices back.');
    await shot(page, box, `${look.name}-test-alert-3b-shown-no-popup`);

    // 5. Too soon: the next may go a minute after the last (the pretend server's clock is the page's).
    push.at = push.tests[0].at + 40_000;
    await box.getByRole('button', { name: 'Send a test alert' }).click();
    await expect(box).toContainText('You just sent a test. You can send another in 20 seconds.');
    expect(push.tests).toHaveLength(1);

    // 6. Not shown after 90 seconds: three things to look at. Then the device shows it late: the card says so by itself.
    push.at = await pageNow(page);
    await box.getByRole('button', { name: 'Send a test alert' }).click();
    await expect(box).toHaveAttribute('data-state', 'waiting');
    expect(push.tests).toHaveLength(2);
    push.tests[1].sentAt = push.tests[1].at + 20_000;
    push.tests[1].sentHow = 'instant';
    await wait(page, 95_000);
    await expect(box).toHaveAttribute('data-state', 'not-shown');
    await expect(box).toContainText('We sent it, but this device has not shown it yet.');
    const checks = box.getByTestId('test-alert-checks');
    await expect(checks.getByRole('listitem')).toHaveCount(3);
    await expect(checks).toContainText('This device is connected to the internet.');
    await expect(checks).toContainText('Then tap “Send a test alert” again. If the notice shows later, this line will change by itself.');
    await expect(box).not.toContainText(/your fault|wrong|broken/i);
    await expect(box.getByRole('button', { name: 'Send a test alert' })).toBeVisible();
    if (phone) await expectFitsPhone(page, 'on Settings with the test not shown');
    await shot(page, box, `${look.name}-test-alert-4-not-shown`);
    push.tests[1].shownAt = (await pageNow(page)) + 1_000;
    await wait(page, 21_000);
    await expect(box).toHaveAttribute('data-state', 'shown');
    await expect(box).toContainText(`It showed on this device at ${indiaClock(push.tests[1].shownAt)}.`);

    // 7. Not sent (on our side), and the same answer after the admin app is opened again.
    await wait(page, 61_000);
    push.at = await pageNow(page);
    await box.getByRole('button', { name: 'Send a test alert' }).click();
    await expect(box).toHaveAttribute('data-state', 'waiting');
    await wait(page, 95_000);
    await expect(box).toHaveAttribute('data-state', 'not-sent');
    await expect(box).toContainText('The test alert has not left MettleUp yet. That is on our side, not your device. This line will change by itself.');
    push.at = await pageNow(page);
    await page.reload();
    await expect(page.getByRole('main').getByTestId('test-alert')).toHaveAttribute('data-state', 'not-sent', { timeout: 15_000 });
    await shot(page, page.getByRole('main').getByTestId('test-alert'), `${look.name}-test-alert-5-not-sent`);
  });
}
