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
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { NOW, NoSuchFunction, expectFitsPhone, openApp, startOnlineGym, wait } from './support.mjs';

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

  // 2. With 0075: what is already there is listed, newest first, and rings for nothing.
  alerts.on = true;
  alerts.list.push(
    { id: 'a1', kind: 'trainer_question', line: 'Asha asked a trainer a question. Open Questions to reply.', route: '/questions', urgent: false, at: T0 - 5 * MIN },
    { id: 'a2', kind: 'shop_order', line: 'New shop order 12 from Neha. Get it ready on Shop.', route: '/shop', urgent: true, at: T0 - 3 * 60 * MIN },
    { id: 'a0', kind: 'member_joined', line: 'Vikram joined your gym in the MettleUp app. See them in Members using the app.', route: '/members/app', urgent: false, at: T0 - 30 * 60 * MIN },
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
  alerts.list.push({
    id: 'a3', kind: 'member_complaint', line: 'Ravi sent your gym a complaint. Open Member messages to read it.', route: '/member-messages', urgent: true, at: T0 + 30_000,
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
