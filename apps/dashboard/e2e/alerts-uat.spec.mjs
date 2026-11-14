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
//  5. A tap on a line opens its page (Questions for trainers: the question, one button; a complaint: Complaints).
// Fresh eyes (14 Nov 2026): the pretend server now also answers the trainer questions (0050/0053), Member messages
// (0069) and the shop's orders, so every line on the card agrees with the counts and pages it points to.
// Second journey (0076, alerts with the admin app closed; the browser's push parts are stand-ins: a headless browser
// has no push company):
//  6. Today offers "Get alerts on this device" once; "Turn on alerts" asks the browser, saves this device, says so.
//  7. Settings: the device is on; the owner picks "Once a week", Sunday, 8:00 pm, and saves it; then turns it off.
//  8. The desk on a second phone: their own device switch, and the owner's choice in words (no way to change it).
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import {
  DESK,
  NOW,
  NoSuchFunction,
  Refusal,
  WEB_PUSH_FNS,
  addDeskPerson,
  expectFitsPhone,
  hideGetStarted,
  installQuestions,
  installTalk,
  openApp,
  secondPhone,
  signIn,
  startOnlineGym,
  wait,
} from './support.mjs';

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

/** The shop's orders (owner_orders) on the pretend server: rows the way the server sends them. */
function installOrders(server) {
  const orders = [];
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (fn !== 'owner_orders') return base(fn, args);
    server.calls.push(fn);
    server.log.push({ fn, args });
    server.anyone(args.p_key);
    return orders.map((o) => ({
      order_id: `order-${o.no}`,
      order_no: o.no,
      member_name: o.name,
      lines: [{ productId: 'p1', optionId: null, name: 'Electrolyte drink 500 ml', qty: 1, unitPriceP: 6000 }],
      total_p: 6000,
      status: o.status,
      cancelled_by: null,
      created_at: new Date(o.at).toISOString(),
      updated_at: new Date(o.at).toISOString(),
    }));
  };
  return orders;
}

const notes = (page) => page.evaluate(() => window.__notes);
const pageNow = (page) => page.evaluate(() => Date.now());

test.use({ viewport: { width: 375, height: 812 } });

test('Gym alerts: not ready, the latest on Today, a new one rings once, a tap opens its page', async ({ page }) => {
  await recordNotices(page);
  const server = await openApp(page);
  const alerts = installAlerts(server);
  const qs = installQuestions(server);
  const talk = installTalk(server);
  const orders = installOrders(server);
  qs.on = true;
  talk.on = true;
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
  // The server's own words still say "Open Questions" (0075); the admin app names the page as its menu does.
  alerts.list.push(
    { id: 'a1', kind: 'trainer_question', line: 'Asha asked a trainer a question. Open Questions to reply.', route: '/questions', urgent: false, at: t1 - 5 * MIN },
    { id: 'a2', kind: 'shop_order', line: 'New shop order 12 from Neha. Get it ready on Shop.', route: '/shop', urgent: true, at: t1 - 3 * 60 * MIN },
    { id: 'a0', kind: 'member_joined', line: 'Vikram joined your gym in the MettleUp app. See them in Members using the app.', route: '/members/app', urgent: false, at: t1 - 30 * 60 * MIN },
  );
  // What the lines point at is really there: Asha's question, Neha's order (fresh eyes: the card said "New shop
  // order 12" while "Shop today" said 0 new orders, because the pretend shop had no orders at all).
  qs.list.push({ id: 'q1', name: 'Asha Verma', question: 'Is the 6 am batch full tomorrow?', askedAt: t1 - 5 * MIN });
  orders.push({ no: 12, name: 'Neha', status: 'ordered', at: t1 - 3 * 60 * MIN });
  await page.reload();
  const card = main.getByTestId('latest-alerts');
  await expect(main.getByRole('heading', { name: 'Latest from your members' })).toBeVisible({ timeout: 15_000 });
  const lines = card.getByRole('button');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText('Asha asked a trainer a question. Open Questions for trainers to reply.');
  await expect(lines.nth(0)).toContainText('5 min ago');
  await expect(lines.nth(1)).toContainText('New shop order #12 from Neha. Get it ready on Shop.');
  await expect(lines.nth(1)).toContainText('3 h ago');
  // The same order on "Shop today", and the question in "Needs you".
  await expect(main.getByText('new order', { exact: true })).toBeVisible();
  await expect(main).toContainText('1 question for trainers to answer');
  // 4. Older than a day: not on the card.
  await expect(card).not.toContainText('Vikram');
  expect(await notes(page), 'opening the page rings for nothing').toEqual([]);
  await expectFitsPhone(page, 'on Today with the latest alerts');
  await shot(page, 'phone-alerts-1-latest');

  // The order is made ready on Shop: the line says so, and Shop today has no new order left.
  orders[0].status = 'ready';
  await page.reload();
  await expect(lines.nth(1)).toContainText('Shop order #12 from Neha is ready for pickup.', { timeout: 15_000 });
  await expect(main.getByText('new orders', { exact: true })).toBeVisible();
  await shot(page, 'phone-alerts-1b-order-ready');

  // 3. A complaint comes in: one notice, the server's line, its own tag; the card puts it first.
  const t2 = await pageNow(page);
  alerts.list.push({
    id: 'a3', kind: 'member_complaint', line: 'Ravi sent your gym a complaint. Open Member messages to read it.', route: '/member-messages', urgent: true, at: t2,
  });
  talk.threads.push({
    id: 'c1', kind: 'complaint', anonymous: false, memberId: null, name: 'Ravi Kumar', phone: '98290 22222',
    lines: [{ id: 'c1-0', fromGym: false, who: null, text: 'The AC in the cardio room has not worked for a week.', at: t2 }],
  });
  await wait(page, 61_000);
  await expect.poll(() => notes(page)).toEqual([
    { title: 'MettleUp: news from your members', body: 'Ravi sent your gym a complaint. Open Member messages to read it.', tag: 'mettleup-alert-a3' },
  ]);
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(0)).toContainText('Ravi sent your gym a complaint.');
  // Fresh eyes (14 Nov 2026): the complaint had no count in "Needs you" (the pretend server had no Member messages).
  // The count is read in the same go as the line, so the two arrive together.
  await expect(main).toContainText('1 member message to reply to');
  await shot(page, 'phone-alerts-2-new-complaint');
  // The next minute with nothing new rings nothing more.
  await wait(page, 61_000);
  expect(await notes(page)).toHaveLength(1);

  // 5. A tap opens its page: Questions for trainers, with Asha's question and one way to load it again (fresh eyes:
  //    the picture showed "Something went wrong" with both Refresh and Try again; the pretend server had no 0053).
  await lines.filter({ hasText: 'Asha asked a trainer a question.' }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/questions');
  await expect(page.getByRole('heading', { name: 'Questions for trainers', exact: true })).toBeVisible();
  await expect(main).toContainText('Is the 6 am batch full tomorrow?');
  await expect(main).not.toContainText('Something went wrong');
  await expect(main.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh' })).toHaveCount(1);
  await expectFitsPhone(page, 'on Questions for trainers from Today');
  await shot(page, 'phone-alerts-3-opened-questions');
  // Negative: when the page cannot be read, the error card has the only button (no Refresh above it).
  qs.broken = true;
  await page.reload();
  await expect(main.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Refresh' })).toHaveCount(0);
  await shot(page, 'phone-alerts-3b-questions-error');
  qs.broken = false;

  // The complaint line opens Member messages on Complaints.
  await page.evaluate(() => {
    window.location.hash = '/';
  });
  await lines.filter({ hasText: 'Ravi sent your gym a complaint.' }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/member-messages/complaint');
  await expect(page.getByRole('heading', { name: 'Member messages', exact: true })).toBeVisible();
  await expect(main.getByTestId('member-message')).toHaveCount(1);
  await expect(main.getByTestId('member-message')).toContainText('The AC in the cardio room has not worked for a week.');
  await shot(page, 'phone-alerts-3c-opened-complaint');
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
  // Fresh eyes (14 Nov 2026): one set-up card at a time; the alerts offer comes after the Get started list.
  await expect(main.getByTestId('alerts-offer')).toHaveCount(0);
  await hideGetStarted(page);

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
  // Fresh eyes (14 Nov 2026): the gym's own choice to start with is once a day (the old picture was taken after the
  // test had picked once a week), and what comes at once is said in plain words.
  await expect(main.getByTestId('alerts-urgent')).toHaveText(
    'These always come at once: complaints, new shop orders, a member waiting at the check-in poster, a friend who wants to join, and a pause or renew request when the plan is about to end.',
  );
  await when.scrollIntoViewIfNeeded();
  await shot(page, 'phone-alerts-5a-settings-default', false);
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
  // Fresh eyes (14 Nov 2026): complaints are the owner's alone, so the desk is never told they come at once.
  await expect(deskMain.getByTestId('alerts-urgent')).toContainText('Complaints go to the owner only.');
  await expect(deskMain.getByTestId('alerts-urgent')).not.toContainText('come at once: complaints');
  await shot(desk, 'phone-alerts-6-desk-settings');
});

// Fresh eyes (14 Nov 2026): the card on a computer and in the light theme, with a payment line and a joined line
// (each opens its own page); then a desk person who is also a trainer: their "Latest" never shows the complaint (the
// pretend server sends it anyway, so the admin app's own check is what is tested), and they find "Questions for
// trainers" on More.
test('Latest from your members on a computer, light theme; payments and joins; the desk who trains', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  const server = await openApp(page);
  const alerts = installAlerts(server);
  const qs = installQuestions(server);
  const talk = installTalk(server);
  installOrders(server);
  alerts.on = true;
  qs.on = true;
  talk.on = true;
  await startOnlineGym(page);
  const main = page.getByRole('main');
  const t = await pageNow(page);
  alerts.list.push(
    { id: 'b1', kind: 'member_complaint', line: 'Ravi sent your gym a complaint. Open Member messages to read it.', route: '/member-messages', urgent: true, at: t - 2 * MIN },
    { id: 'b2', kind: 'paid_online', line: 'Asha paid online for Monthly. See it on Money.', route: '/money', urgent: false, at: t - 20 * MIN },
    { id: 'b3', kind: 'member_joined', line: 'Vikram joined your gym in the MettleUp app. See them in Members using the app.', route: '/members/app', urgent: false, at: t - 90 * MIN },
    { id: 'b4', kind: 'trainer_question', line: 'Asha asked a trainer a question. Open Questions to reply.', route: '/questions', urgent: false, at: t - 3 * 60 * MIN },
  );
  talk.threads.push({
    id: 'c1', kind: 'complaint', anonymous: false, memberId: null, name: 'Ravi Kumar', phone: '98290 22222',
    lines: [{ id: 'c1-0', fromGym: false, who: null, text: 'The AC in the cardio room has not worked for a week.', at: t - 2 * MIN }],
  });
  qs.list.push({ id: 'q1', name: 'Asha Verma', question: 'Is the 6 am batch full tomorrow?', askedAt: t - 3 * 60 * MIN });
  await page.reload();
  const card = main.getByTestId('latest-alerts');
  const lines = card.getByRole('button');
  await expect(lines).toHaveCount(4, { timeout: 15_000 });
  await expect(lines.nth(0)).toContainText('Ravi sent your gym a complaint.');
  await expect(lines.nth(1)).toContainText('Asha paid online for Monthly. See it on Money.');
  await expect(lines.nth(1)).toContainText('20 min ago');
  await expect(lines.nth(2)).toContainText('Vikram joined your gym in the MettleUp app.');
  await expect(lines.nth(3)).toContainText('Open Questions for trainers to reply.');
  await card.scrollIntoViewIfNeeded();
  await shot(page, 'computer-alerts-latest-light', false);

  // The payment line opens Money; the joined line opens Members using the app.
  await lines.nth(1).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/money');
  await page.evaluate(() => {
    window.location.hash = '/';
  });
  await lines.filter({ hasText: 'Vikram joined' }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/members/app');

  // The desk person, ticked as a trainer.
  await page.setViewportSize({ width: 375, height: 812 });
  qs.trainers.add(DESK.name);
  await addDeskPerson(page);
  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);
  const deskMain = desk.getByRole('main');
  const deskCard = deskMain.getByTestId('latest-alerts');
  await expect(deskCard.getByRole('button')).toHaveCount(3, { timeout: 15_000 });
  await expect(deskCard).not.toContainText('complaint');
  await expect(deskCard).toContainText('Asha paid online for Monthly.');
  await expect(deskCard).toContainText('Open Questions for trainers to reply.');
  await expectFitsPhone(desk, 'on the trainer’s Today');
  await shot(desk, 'phone-alerts-7-trainer-today');
  await desk.evaluate(() => {
    window.location.hash = '/more';
  });
  const row = deskMain.getByRole('link', { name: /^Questions for trainers/ });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.scrollIntoViewIfNeeded();
  await shot(desk, 'phone-alerts-8-trainer-more', false);
  await row.click();
  await expect(desk.getByRole('heading', { name: 'Questions for trainers', exact: true })).toBeVisible();
  await expect(deskMain).toContainText('Is the 6 am batch full tomorrow?');
  await shot(desk, 'phone-alerts-9-trainer-questions');
  await desk.context().close();
});
