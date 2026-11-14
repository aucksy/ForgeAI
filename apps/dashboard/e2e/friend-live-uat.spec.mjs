// R-539 (owner, 14 Nov 2026): "I submitted the form but I don't see anything that popped up on the admin panel", and
// new things must reach an open panel at once or in the smallest gap, with a refresh button. UAT on a phone (375 x 812)
// and a computer (1280 x 900); every step uses the real screens; pictures go to e2e/.results/uat (CI uploads them as
// "dashboard-uat-pictures").
//
// The friend really fills the invite page (public/friend.html) on join.mettleup.fit/f/<code>, in a second tab. Its
// form goes to /api/friend, answered here the way the Worker + supabase 0085 friend_invite_send answer it on the
// pretend gym server: a new number makes an enquiry and an instant alert; a number that is already an open enquiry gets
// "Invited again by ..." on that enquiry, its follow-up moves to today, and the same alert. The page says "Sent" both
// times. owner_alerts is answered as 0075 does (alerts-uat.spec.mjs).
//  1. Enquiries says "Updated just now" with a Refresh button.
//  2. A new friend (Ravi): within the one-minute look the enquiry is on Enquiries and the alert has rung.
//  3. A walk-in already in Enquiries (Sunil, follow-up next week): his row says who invited him again, and he is due today.
//  4. A third friend (Karan), then Refresh: there at once, without waiting for the timers; alerts read again.
//  5. Today: the alerts in "Latest from your members", with the same Refresh line.
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { NOW, TODAY, expectFitsPhone, open, openApp, startOnlineGym, wait } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });
const PUB = new URL('../public/', import.meta.url);
const T0 = NOW.getTime();
const MIN = 60_000;

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

/** owner_alerts on the pretend server, as 0075 answers it (the newest first, the last 3 days). */
function installAlerts(server) {
  const alerts = { list: [] };
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (fn !== 'owner_alerts') return base(fn, args);
    server.calls.push(fn);
    server.log.push({ fn, args });
    server.anyone(args.p_key);
    const since = T0 - 3 * 24 * 60 * MIN;
    return { ok: true, alerts: alerts.list.filter((a) => a.at >= since).sort((x, y) => y.at - x.at) };
  };
  return alerts;
}

/** The browser's notice, recorded: window.__notes gets { title, body, tag } per notice (permission "allowed"). */
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

const first = (s) => String(s).trim().split(/\s+/)[0];
const TIME = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', any: 'Any time' };

/** supabase 0085 friend_invite_send on the pretend server (Asha Verma's link). Returns what the Worker answers. */
function friendSend(server, alerts, body, at) {
  const by = 'Asha Verma';
  const phone = `+91${String(body.phone).replace(/\D/g, '').slice(-10)}`;
  const prior = [...server.records.values()]
    .filter((r) => r.k === 'enquiry' && !r.x && (r.d.status ?? 'open') === 'open' && r.d.phone === phone)
    .sort((a, b) => b.d.updatedAt - a.d.updatedAt)[0];
  server.version += 1;
  if (prior) {
    const follow = prior.d.followUpOn && prior.d.followUpOn < TODAY ? prior.d.followUpOn : TODAY;
    server.records.set(`enquiry:${prior.id}`, {
      ...prior,
      ver: server.version,
      d: { ...prior.d, invitedAgain: { v: 1, by, time: body.time, at }, followUpOn: follow, updatedAt: at },
    });
    alerts.list.push({
      id: `again-${prior.id}`,
      kind: 'friend_referred',
      line: `${first(by)} invited ${first(prior.d.name)} to your gym. ${first(prior.d.name)} already asked about joining: call them from Enquiries today.`,
      route: '/enquiries',
      urgent: true,
      at,
    });
    return;
  }
  const id = `friend-${String(server.version).padStart(32, '0')}`;
  server.records.set(`enquiry:${id}`, {
    k: 'enquiry',
    id,
    x: false,
    ver: server.version,
    d: {
      id,
      gymId: server.gym.gymId,
      name: body.name,
      phone,
      interest: `Best time to train: ${TIME[body.time]}`,
      followUpOn: TODAY,
      status: 'open',
      memberId: null,
      source: 'friend',
      referral: { by, memberId: null, time: body.time },
      createdAt: at,
      updatedAt: at,
    },
  });
  alerts.list.push({ id: `friend-${id}`, kind: 'friend_referred', line: `${first(by)}'s friend asked about joining your gym. Call them from Enquiries.`, route: '/enquiries', urgent: true, at });
}

/** The invite page on join.mettleup.fit as the Worker serves it (friend.html, the gym written in), in its own tab. */
async function friendTab(context, onSend) {
  const tab = await context.newPage();
  await tab.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await tab.route(/^https:\/\/join\.mettleup\.fit\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/friend') {
      await onSend(route.request().postDataJSON());
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    if (/^\/f\/[A-Za-z0-9]{8}$/.test(url.pathname)) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(new URL('friend.html', PUB)) });
    }
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  await tab.addInitScript((g) => {
    window.__GYM__ = g;
  }, { gymName: 'Iron Temple Fitness', code: 'ABCD2345', inviter: 'Asha', brand: null });
  return tab;
}

async function fillFriendForm(tab, name, phone, time) {
  await tab.goto('https://join.mettleup.fit/f/ABCD2345');
  await expect(tab.locator('#title')).toHaveText('Iron Temple Fitness');
  await tab.getByLabel(/Your name/).fill(name);
  await tab.getByLabel(/Mobile number/).fill(phone);
  await tab.getByRole('radio', { name: new RegExp(time, 'i') }).check();
  await tab.getByRole('button', { name: /Send to the gym/ }).click();
  // Always "Sent", whether the gym knew the number or not (the page never tells a stranger who is a member).
  await expect(tab.locator('#done-title')).toContainText('Sent. Iron Temple Fitness will call you soon.');
}

const notes = (page) => page.evaluate(() => window.__notes);
const pageNow = (page) => page.evaluate(() => Date.now());

for (const size of ['phone', 'computer']) {
  test.describe(`R-539 on a ${size}`, () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test(`R-539 ${size}: a friend form reaches Enquiries and rings within the minute; Refresh brings it at once`, async ({ page, context }) => {
      await recordNotices(page);
      const server = await openApp(page);
      const alerts = installAlerts(server);
      await startOnlineGym(page);
      if (size === 'computer') await page.setViewportSize({ width: 1280, height: 900 });
      const phone = size === 'phone';
      const main = page.getByRole('main');
      const toEnquiries = async () => {
        if (phone) await open(page, 'Enquiries');
        else await page.evaluate(() => (window.location.hash = '/enquiries'));
        await expect(page.getByRole('heading', { name: 'Enquiries', exact: true })).toBeVisible();
      };
      const toToday = async () => {
        if (phone) await open(page, 'Today');
        else await page.evaluate(() => (window.location.hash = '/'));
        await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
      };

      // A walk-in the desk typed last week, to call again next week (not due today, so not on the "due" list yet).
      server.version += 1;
      server.records.set('enquiry:walkin-sunil', {
        k: 'enquiry',
        id: 'walkin-sunil',
        x: false,
        ver: server.version,
        d: {
          id: 'walkin-sunil', gymId: server.gym.gymId, name: 'Sunil Mehta', phone: '+919829055555', interest: '3 months, evening batch',
          followUpOn: '2026-10-22', status: 'open', memberId: null, createdAt: T0 - 3 * 24 * 60 * MIN, updatedAt: T0 - 3 * 24 * 60 * MIN,
        },
      });

      // 1. Enquiries says how fresh it is.
      await toEnquiries();
      const fresh = main.getByTestId('updated-records');
      await expect(fresh).toBeVisible({ timeout: 15_000 });
      await expect(fresh.getByTestId('updated-words')).toHaveText(/^Updated (just now|\d+ s ago)$/);
      await expect(fresh.getByRole('button', { name: 'Refresh' })).toBeVisible();
      await expect(main.getByText('Sunil Mehta', { exact: true })).toHaveCount(0);
      if (phone) await expectFitsPhone(page, 'on Enquiries with the Updated line');
      await shot(page, `${size}-friendlive-1-enquiries-fresh`);

      // 2. Ravi fills Asha's invite (a new number).
      const tab = await friendTab(context, async (b) => friendSend(server, alerts, b, await pageNow(page)));
      await fillFriendForm(tab, 'Ravi Kumar', '98290 44444', 'Evening');
      await shot(tab, `${size}-friendlive-2-friend-page-sent`, false);
      await page.bringToFront();
      // Within the one-minute look (the records come every 15 s; the alerts every minute).
      await wait(page, 61_000);
      const ravi = main.locator('div').filter({ has: page.getByText('Ravi Kumar', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Make Ravi Kumar a member' }) }).last();
      await expect(ravi).toBeVisible({ timeout: 15_000 });
      await expect(ravi).toContainText('Referred by Asha Verma');
      await expect.poll(() => notes(page), { timeout: 15_000 }).toContainEqual(expect.objectContaining({ body: "Asha's friend asked about joining your gym. Call them from Enquiries." }));

      // 3. Sunil's number from Asha's link: his row says so and he is due today; the alert rings.
      await tab.bringToFront();
      await fillFriendForm(tab, 'Sunil', '9829055555', 'Morning');
      await page.bringToFront();
      await wait(page, 61_000);
      const sunil = main.locator('div').filter({ has: page.getByText('Sunil Mehta', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Make Sunil Mehta a member' }) }).last();
      await expect(sunil).toBeVisible({ timeout: 15_000 });
      await expect(sunil).toContainText('Invited again by Asha Verma, best time to train: Morning');
      await expect(sunil).toContainText('3 months, evening batch');
      await expect.poll(() => notes(page), { timeout: 15_000 }).toContainEqual(
        expect.objectContaining({ body: 'Asha invited Sunil to your gym. Sunil already asked about joining: call them from Enquiries today.' }),
      );
      expect([...server.records.values()].filter((r) => r.k === 'enquiry' && r.d.phone === '+919829055555')).toHaveLength(1);
      if (phone) await expectFitsPhone(page, 'on Enquiries with an invited-again row');
      await sunil.scrollIntoViewIfNeeded();
      await shot(page, `${size}-friendlive-3-enquiries-invited-again`);

      // 4. Karan, then Refresh at once: no waiting for the timers. The alerts are read again too.
      await tab.bringToFront();
      await fillFriendForm(tab, 'Karan Singh', '9829066666', 'Any time');
      await page.bringToFront();
      const alertReads = server.calls.filter((c) => c === 'owner_alerts').length;
      await main.getByTestId('updated-records').getByRole('button', { name: 'Refresh' }).click();
      await expect(main.getByText('Karan Singh', { exact: true })).toBeVisible({ timeout: 5_000 });
      expect(server.calls.filter((c) => c === 'owner_alerts').length).toBeGreaterThan(alertReads);
      await expect(main.getByTestId('updated-records').getByTestId('updated-words')).toHaveText('Updated just now');
      await shot(page, `${size}-friendlive-4-after-refresh`);

      // 5. Today: the three alerts on "Latest from your members", newest first, with the same Refresh line.
      await toToday();
      const card = main.getByTestId('latest-alerts');
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card).toContainText('Asha invited Sunil to your gym. Sunil already asked about joining: call them from Enquiries today.');
      await expect(card).toContainText("Asha's friend asked about joining your gym. Call them from Enquiries.");
      const needsFresh = main.getByTestId('updated-needs');
      await expect(needsFresh).toHaveCount(1);
      await expect(needsFresh.getByTestId('updated-words')).toHaveText(/^Updated (just now|\d+ s ago)$/);
      await needsFresh.getByRole('button', { name: 'Refresh' }).click();
      await expect(needsFresh.getByTestId('updated-words')).toHaveText('Updated just now');
      if (phone) await expectFitsPhone(page, 'on Today with the alerts and the Updated line');
      await shot(page, `${size}-friendlive-5-today-alerts`);

      // A tap on the alert opens Enquiries.
      await card.getByRole('button').filter({ hasText: 'Sunil' }).first().click();
      await expect(page.getByRole('heading', { name: 'Enquiries', exact: true })).toBeVisible();
      await tab.close();
    });
  });
}
