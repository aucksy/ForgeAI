// R-506 (owner, 14 Nov 2026): UAT of the gym's alerts on the admin app (supabase/migrations/0075_gym_alerts.sql
// owner_alerts), on a phone (375 x 812). Every step uses the real screen; pictures go to e2e/.results/uat (CI uploads
// them as "dashboard-uat-pictures"). The gym's server is the pretend one (support.mjs); owner_alerts is answered here
// the way 0075 answers it: the server writes each line, the newest first. The browser's notice is replaced by a
// recorder (the permission is "allowed"), so the test sees what would pop up. Saturday 17 Oct 2026, 10:00 am IST.
//
//  1. A server without 0075 (the live server today): no "Latest from your members" card, nothing rings.
//  2. With 0075: the card lists the last 24 hours, newest first, and opening the page rings for nothing.
//  3. A new complaint comes in: within a minute the page rings once with the server's own line, and the card shows it.
//  4. An alert older than 24 hours stays off the card.
//  5. A tap on a line opens its page (Questions).
// Second journey (0076, alerts with the admin app closed; the browser's push parts are stand-ins: a headless browser
// has no push company):
//  6. Today offers "Get alerts on this device" once; "Turn on alerts" asks the browser, saves this device, says so.
//  7. Settings: the device is on; the owner picks "Once a week", Sunday, 8:00 pm, and saves it; then turns it off.
//  8. The desk on a second phone: their own device switch, and the owner's choice in words (no way to change it).
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { DESK, NOW, NoSuchFunction, Refusal, WEB_PUSH_FNS, addDeskPerson, expectFitsPhone, openApp, secondPhone, signIn, startOnlineGym, wait } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

const T0 = NOW.getTime();
const MIN = 60_000;

/** owner_alerts on the pretend server. `alerts.on` false: PGRST202, like the live server today. */
function installAlerts(server) {
  const alerts = { on: false, list: [] };
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (fn !== 'owner_alerts') return base(fn, args);
    server.calls.push(fn);
    server.log.push({ fn, args });
    if (!alerts.on) throw new NoSuchFunction(`Could not find the function public.${fn} in the schema cache`);
    server.anyone(args.p_key);
    const since = T0 - 3 * 24 * 60 * MIN;
    return { ok: true, alerts: alerts.list.filter((a) => a.at >= since).sort((x, y) => y.at - x.at) };
  };
  return alerts;
}

/** The browser's notice, recorded: window.__notes gets { title, body, tag } per notice. */
async function recordNotices(page) {
  await page.addInitScript(() => {
    window.__notes = [];
    class FakeNotification {
      static permission = 'granted';
      static requestPermission() {
        return Promise.resolve('granted');
      }
      constructor(title, opts = {}) {
        window.__notes.push({ title, body: opts.body, tag: opts.tag });
      }
      close() {}
    }
    window.Notification = FakeNotification;
  });
}

const notes = (page) => page.evaluate(() => window.__notes);
const pageNow = (page) => page.evaluate(() => Date.now());

test.use({ viewport: { width: 375, height: 812 } });

test('Gym alerts: not ready, the latest on Today, a new one rings once, a tap opens its page', async ({ page }) => {
  await recordNotices(page);
  const server = await openApp(page);
  const alerts = installAlerts(server);
  await startOnlineGym(page);
  const main = page.getByRole('main');

  // 1. No 0075: no card, nothing rings.
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await wait(page, 61_000);
  await expect(main.getByRole('heading', { name: 'Latest from your members' })).toHaveCount(0);
  expect(await notes(page)).toEqual([]);

  // 2. With 0075: what is already there is listed, newest first, and rings for nothing. Times are set from the
  //    page's own clock (it runs on from NOW, and the minute above already passed).
  alerts.on = true;
  const t1 = await pageNow(page);
  alerts.list.push(
    { id: 'a1', kind: 'trainer_question', line: 'Asha asked a trainer a question. Open Questions to reply.', route: '/questions', urgent: false, at: t1 - 5 * MIN },
    { id: 'a2', kind: 'shop_order', line: 'New shop order 12 from Neha. Get it ready on Shop.', route: '/shop', urgent: true, at: t1 - 3 * 60 * MIN },
    { id: 'a0', kind: 'member_joined', line: 'Vikram joined your gym in the MettleUp app. See them in Members using the app.', route: '/members/app', urgent: false, at: t1 - 30 * 60 * MIN },
  );
  await page.reload();
  const card = main.getByTestId('latest-alerts');
  await expect(main.getByRole('heading', { name: 'Latest from your members' })).toBeVisible({ timeout: 15_000 });
  const lines = card.getByRole('button');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText('Asha asked a trainer a question. Open Questions to reply.');
  await expect(lines.nth(0)).toContainText('5 min ago');
  await expect(lines.nth(1)).toContainText('New shop order 12 from Neha.');
  await expect(lines.nth(1)).toContainText('3 h ago');
  // 4. Older than a day: not on the card.
  await expect(card).not.toContainText('Vikram');
  expect(await notes(page), 'opening the page rings for nothing').toEqual([]);
  await expectFitsPhone(page, 'on Today with the latest alerts');
  await shot(page, 'phone-alerts-1-latest');

  // 3. A complaint comes in: one notice, the server's line, its own tag; the card puts it first.
  const t2 = await pageNow(page);
  alerts.list.push({
    id: 'a3', kind: 'member_complaint', line: 'Ravi sent your gym a complaint. Open Member messages to read it.', route: '/member-messages', urgent: true, at: t2,
  });
  await wait(page, 61_000);
  await expect.poll(() => notes(page)).toEqual([
    { title: 'MettleUp: news from your members', body: 'Ravi sent your gym a complaint. Open Member messages to read it.', tag: 'mettleup-alert-a3' },
  ]);
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(0)).toContainText('Ravi sent your gym a complaint.');
  await shot(page, 'phone-alerts-2-new-complaint');
  // The next minute with nothing new rings nothing more.
  await wait(page, 61_000);
  expect(await notes(page)).toHaveLength(1);

  // 5. A tap opens its page.
  await lines.filter({ hasText: 'Asha asked a trainer a question.' }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/questions');
  await shot(page, 'phone-alerts-3-opened-questions');
});

/** 0076 on the pretend server, by its rules: a device per sign-in key; the OWNER changes when the rest come. */
function installWebPush(server) {
  const push = { on: false, settings: { mode: 'daily', minute: 660, weekday: 1 }, devices: new Map() };
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (!WEB_PUSH_FNS.includes(fn)) return base(fn, args);
    server.calls.push(fn);
    server.log.push({ fn, args });
    if (!push.on) throw new NoSuchFunction(`Could not find the function public.${fn} in the schema cache`);
    const p = server.anyone(args.p_key);
    const owner = p.role === 'owner';
    if (fn === 'owner_alert_settings') return { ok: true, ...push.settings, canEdit: owner };
    if (fn === 'owner_save_alert_settings') {
      if (!owner) throw new Refusal('OWNER_ONLY');
      push.settings = { mode: args.p_mode, minute: args.p_minute, weekday: args.p_weekday };
      return { ok: true, ...push.settings, canEdit: true };
    }
    if (fn === 'owner_save_web_push') {
      push.devices.set(args.p_endpoint, args.p_key);
      return { ok: true, on: true };
    }
    if (fn === 'owner_clear_web_push') {
      push.devices.delete(args.p_endpoint);
      return { ok: true, on: false, removed: 1 };
    }
    return { ok: true, on: push.devices.get(args.p_endpoint) === args.p_key };
  };
  return push;
}

/** A browser that can get pushes: the permission (kept across reloads), the page's service worker and its push parts. */
async function pushBrowser(page, endpoint) {
  await page.route('**/api/push/web-key', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'B'.repeat(86) + 'A' }) }),
  );
  await page.addInitScript((end) => {
    const perm = () => localStorage.getItem('e2e.notifyPermission') || 'default';
    class FakeNotification {
      static get permission() {
        return perm();
      }
      static requestPermission() {
        localStorage.setItem('e2e.notifyPermission', 'granted');
        window.__asked = (window.__asked || 0) + 1;
        return Promise.resolve('granted');
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
      subscribe: async (opts) => {
        window.__subscribedWithKey = opts.applicationServerKey.length;
        localStorage.setItem('e2e.subscribed', '1');
        return sub;
      },
    };
    const reg = { pushManager };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => reg, ready: Promise.resolve(reg), register: async () => reg, addEventListener() {}, controller: null },
    });
  }, endpoint);
}

test('Alerts with the admin app closed: the offer on Today, the device switch, when the rest come, the desk', async ({ page, browser }) => {
  await pushBrowser(page, 'https://fcm.googleapis.com/fcm/send/e2e-owner-phone');
  const server = await openApp(page);
  const push = installWebPush(server);
  push.on = true;
  await startOnlineGym(page);
  const main = page.getByRole('main');

  // 6. The offer, once.
  const offer = main.getByTestId('alerts-offer');
  await expect(offer).toContainText('Get alerts on this device', { timeout: 15_000 });
  await expect(offer).toContainText('even when the admin app is closed');
  expect(await page.evaluate(() => window.__asked ?? 0), 'the browser is never asked before the tap').toBe(0);
  await expectFitsPhone(page, 'on Today with the alerts offer');
  await shot(page, 'phone-alerts-4-offer');
  await offer.getByRole('button', { name: 'Turn on alerts' }).click();
  await expect(offer).toContainText('Alerts are on for this device.');
  expect(await page.evaluate(() => window.__subscribedWithKey)).toBe(65);
  const saved = server.log.filter((c) => c.fn === 'owner_save_web_push');
  expect(saved).toHaveLength(1);
  expect(saved[0].args).toMatchObject({ p_endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-owner-phone', p_p256dh: 'B'.repeat(87), p_auth: 'A'.repeat(22) });
  await offer.getByRole('button', { name: 'OK' }).click();
  await expect(main.getByTestId('alerts-offer')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await expect(main.getByTestId('alerts-offer'), 'never offered again').toHaveCount(0);

  // 7. Settings: on for this device; the owner's choice.
  await page.evaluate(() => {
    window.location.hash = '/settings';
  });
  const card = main.getByTestId('alerts-device');
  await expect(card).toContainText('Alerts are on for this device.', { timeout: 15_000 });
  const when = main.getByTestId('alerts-when');
  await expect(when).toContainText('Daily at 11:00 am');
  await when.getByRole('button', { name: 'Once a week' }).click();
  await when.getByLabel('Day').selectOption({ label: 'Sunday' });
  await when.getByLabel('Time').selectOption({ label: '8:00 pm' });
  await expect(when).toContainText('Weekly on Sunday at 8:00 pm');
  await when.getByRole('button', { name: 'Save' }).click();
  await expect(when).toContainText('Saved.');
  expect(push.settings).toEqual({ mode: 'weekly', minute: 1200, weekday: 0 });
  await card.scrollIntoViewIfNeeded();
  await expectFitsPhone(page, 'on Settings with the alerts card');
  await shot(page, 'phone-alerts-5-settings', false);
  await card.getByRole('button', { name: 'Turn off on this device' }).click();
  await expect(card).toContainText('Alerts are off for this device.');
  expect(push.devices.size).toBe(0);

  // 8. The desk: their own switch; the owner's choice in words only.
  await addDeskPerson(page);
  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);
  await desk.evaluate(() => {
    window.location.hash = '/settings';
  });
  const deskMain = desk.getByRole('main');
  await expect(deskMain.getByTestId('alerts-when-readonly')).toContainText(
    'Your gym gets everything else together, every Sunday at 8:00 pm. Only the owner can change when they come.',
    { timeout: 15_000 },
  );
  await expect(deskMain.getByTestId('alerts-when')).toHaveCount(0);
  await shot(desk, 'phone-alerts-6-desk-settings');
});
