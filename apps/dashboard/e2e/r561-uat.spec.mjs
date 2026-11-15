// R-561 UAT (owner, 15 Nov 2026), on a computer (1280 x 900) and a phone (390 x 844), light and dark, English and
// Hinglish. Pictures for a person to read: e2e/.results/uat/r561-*.png (CI keeps them as dashboard-uat-pictures).
//  1. The side menu's group headings look unlike its rows (small capitals, heavy, a line above), and every row fits on
//     one line in the wider menu, in English and in Hinglish.
//  2. "Set up your gym" keeps its ring and "3/7" when it is moved to the bottom of the menu.
//  3. The bell: "Your gym" first with its count, payment notices in their own colour with a "Payment" label, and the
//     "Turn on alerts" card while alerts are off; X closes it for good on this device.
//  4. The top bar: one "Updated ... ago" with one Refresh (no second Refresh on the page), English | Hinglish beside
//     Dark | Light, and no language card left in Settings. Refresh while the internet is off says so in a sentence.
//  5. A line under each setting (Settings, Gym details).
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { NOW, NoSuchFunction, WEB_PUSH_FNS, expectFitsPhone, open, openApp, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r561-${name}.png`, ...opts });
}

const T0 = NOW.getTime();
const MIN = 60_000;
const COMPUTER = { viewport: { width: 1280, height: 900 }, isMobile: false };
const menuOf = (page) => page.getByRole('navigation', { name: 'Main' });
const menuShot = (page, name) => shot(page, name, { clip: { x: 0, y: 0, width: 320, height: page.viewportSize().height } });

/** owner_alerts as 0075 answers it (the newest first), with a payment among them. */
function installAlerts(server) {
  const alerts = {
    list: [
      { id: 'a1', kind: 'paid_online', line: 'Asha Verma paid online for 3 months. See it on Money.', route: '/money', urgent: false, at: T0 - 4 * MIN },
      { id: 'a2', kind: 'member_question', line: 'Ravi asked a workout question.', route: '/questions', urgent: false, at: T0 - 20 * MIN },
      { id: 'a3', kind: 'member_joined', line: 'Vikram joined your gym in the MettleUp app. See them in Members using the app.', route: '/members/app', urgent: false, at: T0 - 90 * MIN },
    ],
  };
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (fn !== 'owner_alerts') return base(fn, args);
    server.calls.push(fn);
    server.anyone(args.p_key);
    return { ok: true, alerts: [...alerts.list].sort((x, y) => y.at - x.at) };
  };
  return alerts;
}

/** The alerts-with-the-app-closed part (0076), off on this device until the bell's card turns it on. */
function installWebPush(server) {
  const devices = new Map();
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (!WEB_PUSH_FNS.includes(fn)) return base(fn, args);
    server.calls.push(fn);
    server.anyone(args.p_key);
    if (fn === 'owner_alert_settings' || fn === 'owner_save_alert_settings') return { ok: true, mode: 'daily', minute: 660, weekday: 1, canEdit: true };
    if (fn === 'owner_save_web_push') {
      devices.set(args.p_endpoint, args.p_key);
      return { ok: true, on: true };
    }
    if (fn === 'owner_clear_web_push') return { ok: true, on: false, removed: 1 };
    return { ok: true, on: devices.get(args.p_endpoint) === args.p_key };
  };
}

/** A browser that can get pushes (as alerts-uat.spec.mjs): permission not asked yet, a service worker with push. */
async function pushBrowser(page) {
  await page.route('**/api/push/web-key', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'B'.repeat(86) + 'A' }) }),
  );
  await page.addInitScript(() => {
    const end = 'https://fcm.googleapis.com/fcm/send/e2e-r561';
    const perm = () => localStorage.getItem('e2e.notifyPermission') || 'default';
    class FakeNotification {
      static get permission() {
        return perm();
      }
      static requestPermission() {
        localStorage.setItem('e2e.notifyPermission', 'granted');
        return Promise.resolve('granted');
      }
      close() {}
    }
    window.Notification = FakeNotification;
    if (!('PushManager' in window)) window.PushManager = function PushManager() {};
    const sub = { endpoint: end, toJSON: () => ({ endpoint: end, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } }), unsubscribe: async () => true };
    const pushManager = {
      getSubscription: async () => (localStorage.getItem('e2e.subscribed') ? sub : null),
      subscribe: async () => {
        localStorage.setItem('e2e.subscribed', '1');
        return sub;
      },
    };
    const reg = { pushManager };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => reg, ready: Promise.resolve(reg), register: async () => reg, addEventListener() {}, controller: null },
    });
  });
}

/** Rows of the side menu whose words wrap onto a second line (hidden screen-reader words left out). */
async function wrappedRows(page) {
  return menuOf(page)
    .locator('[data-sidebar-rows]')
    .getByRole('link')
    .evaluateAll((links) =>
      links
        .filter((a) => {
          const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const el = n.parentElement;
            if (!el || !n.textContent.trim() || el.getBoundingClientRect().width <= 2) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
            if (tops.size > 1) return true;
          }
          return false;
        })
        .map((a) => (a.textContent ?? '').trim()),
    );
}

/** The look of a menu group heading next to a menu row. */
async function headingLook(page) {
  const head = menuOf(page).locator('[data-menu-group-head]').first();
  const button = head.getByRole('button');
  const row = menuOf(page).locator('[data-sidebar-rows]').getByRole('link').first();
  return {
    headTransform: await button.evaluate((b) => getComputedStyle(b).textTransform),
    headWeight: Number(await button.evaluate((b) => getComputedStyle(b).fontWeight)),
    headLine: await head.evaluate((h) => getComputedStyle(h).borderTopWidth),
    rowTransform: await row.evaluate((r) => getComputedStyle(r).textTransform),
  };
}

const setTheme = (page, mode) =>
  page.locator('[data-top-bar]').getByRole('radiogroup', { name: 'Screen colours' }).getByRole('radio', { name: mode === 'light' ? 'Light' : 'Dark' }).click();

test.describe('R561 on a computer', () => {
  test.use(COMPUTER);

  test('R561-1 the menu headings, one-line rows, the top bar and Refresh, in English and Hinglish, light and dark', async ({ page }) => {
    const server = await openApp(page);
    installAlerts(server);
    await startOnlineGym(page);
    const main = page.getByRole('main');
    const menu = menuOf(page);
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });

    // 1. Headings unlike rows: capitals, heavy, a line above; the rows are not in capitals.
    await expect(menu.locator('[data-menu-group-head]')).toHaveCount(5);
    const look = await headingLook(page);
    expect(look.headTransform).toBe('uppercase');
    expect(look.headWeight).toBeGreaterThanOrEqual(700);
    expect(look.headLine).toBe('1px');
    expect(look.rowTransform).toBe('none');
    expect(await wrappedRows(page), 'every menu row on one line (English)').toEqual([]);
    await setTheme(page, 'light');
    await menuShot(page, 'computer-menu-light-en');
    await setTheme(page, 'dark');
    await menuShot(page, 'computer-menu-dark-en');

    // 4. The top bar: one Refresh with how fresh the page is, the bell, Dark | Light and English | Hinglish together.
    const bar = page.locator('[data-top-bar]');
    const refresh = page.getByTestId('panel-refresh');
    await expect(refresh).toHaveCount(1);
    await expect(refresh.getByTestId('updated-words')).toHaveText(/^Updated (just now|\d+ s ago)$/, { timeout: 15_000 });
    await expect(bar.getByRole('radiogroup', { name: 'Screen colours' })).toBeVisible();
    await expect(bar.getByRole('radiogroup', { name: 'Language' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Refresh/ }), 'one Refresh on the screen').toHaveCount(1);
    await shot(page, 'computer-top-bar-dark', { clip: { x: 640, y: 0, width: 640, height: 90 } });
    const reads = server.calls.filter((c) => c === 'owner_alerts').length;
    await refresh.getByRole('button', { name: /^Refresh/ }).click();
    await expect(refresh.getByTestId('updated-words')).toHaveText('Updated just now');
    expect(server.calls.filter((c) => c === 'owner_alerts').length, 'Refresh reads the alerts too').toBeGreaterThan(reads);

    // The pages that had their own Refresh now have none (Enquiries, Member questions).
    await menu.getByRole('link', { name: 'Enquiries', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Enquiries', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /Refresh/ }), 'only the top bar has one').toHaveCount(1);

    // Negative: Refresh with no internet says so in a sentence, and the page stays as it was.
    server.disconnect();
    await refresh.getByRole('button', { name: /^Refresh/ }).click();
    await expect(refresh.getByTestId('updated-words')).toHaveText('Could not refresh. Check the internet and try again.', { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Enquiries', level: 1 })).toBeVisible();
    await shot(page, 'computer-refresh-failed', { clip: { x: 640, y: 0, width: 640, height: 90 } });
    server.reconnect();
    await refresh.getByRole('button', { name: /^Refresh/ }).click();
    await expect(refresh.getByTestId('updated-words')).toHaveText('Updated just now', { timeout: 20_000 });

    // The language is in the top bar only: Settings has no language card any more.
    await menu.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Language' }), 'only the top bar has one').toHaveCount(1);

    // 5. A line under each setting: Gym details.
    await expect(main.getByText('This name shows in your members’ MettleUp app and on your receipts.')).toBeVisible();
    await expect(main.getByText('This number is printed on your receipts, and your web page can show it with a Call button.')).toBeVisible();
    await expect(main.getByText('This address shows on your receipts and on your web page.')).toBeVisible();
    await setTheme(page, 'light');
    await shot(page, 'computer-settings-lines-en', { fullPage: true });

    // Hinglish, from the top bar: the menu's rows still fit on one line; the setting lines are in Hinglish.
    await bar.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: 'Hinglish' }).click();
    await expect(main.getByText('Yeh naam aapke members ki MettleUp app mein aur aapki receipts par dikhta hai.')).toBeVisible();
    expect(await wrappedRows(page), 'every menu row on one line (Hinglish)').toEqual([]);
    await shot(page, 'computer-settings-lines-hi', { fullPage: true });
    await menuShot(page, 'computer-menu-light-hi');
    await setTheme(page, 'dark');
    await menuShot(page, 'computer-menu-dark-hi');
    await shot(page, 'computer-top-bar-dark-hi', { clip: { x: 640, y: 0, width: 640, height: 90 } });
  });

  test('R561-2 Set up your gym keeps its ring and count when moved to the bottom of the menu', async ({ page }) => {
    await openApp(page);
    await startOnlineGym(page);
    const menu = menuOf(page);
    const setupLink = menu.getByRole('link', { name: /^Set up your gym/ });
    const mark = setupLink.locator('[data-setup-mark]');
    await expect(mark).toContainText(/^\d+\/\d+/, { timeout: 15_000 });
    const before = (await mark.textContent()) ?? '';
    await setupLink.click();
    await page.getByRole('button', { name: 'Move this page to the bottom of the menu' }).click();
    // The row is now under Your gym, with the same ring and count.
    const moved = menu.getByRole('group', { name: 'Your gym' }).getByRole('link', { name: /^Set up your gym/ });
    await expect(moved).toBeVisible();
    await expect(moved.locator('[data-setup-mark]')).toBeVisible();
    expect(await moved.locator('[data-setup-mark]').textContent(), 'the same ring and count').toBe(before);
    await expect(moved).toHaveAccessibleName(/steps done/);
    expect(await wrappedRows(page)).toEqual([]);
    await menuShot(page, 'computer-menu-setup-moved-down');
    // It stays after a reload, and goes back to the top when asked.
    await page.reload();
    await expect(menu.getByRole('group', { name: 'Your gym' }).getByRole('link', { name: /^Set up your gym/ }).locator('[data-setup-mark]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Show this page at the top of the menu again' }).click();
    await expect(menu.getByRole('group', { name: 'Your gym' }).getByRole('link', { name: /^Set up your gym/ })).toHaveCount(0);
  });

  test('R561-3 the bell: Your gym first with its count, the payment in its colour, the alerts card and its X', async ({ page }) => {
    await pushBrowser(page);
    const server = await openApp(page);
    installAlerts(server);
    installWebPush(server);
    await startOnlineGym(page);
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
    await setTheme(page, 'dark');
    const bell = page.getByRole('button', { name: /^Notifications/ });
    await expect(bell).toHaveAccessibleName(/^Notifications, \d+ new$/, { timeout: 70_000 });
    await bell.click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel).toBeVisible();

    // The alerts card first, then the groups; Your gym is the first group, with 3.
    const card = panel.getByTestId('bell-alerts-card');
    await expect(card).toContainText('Turn on alerts', { timeout: 15_000 });
    await expect(card).toContainText('If you close this card, you can still turn alerts on in Settings.');
    const heads = await panel.locator('[data-group-label]').evaluateAll((hs) => hs.map((h) => (h.textContent ?? '').trim()));
    const shown = await panel.getByTestId('bell-gym-alerts').locator('li').count();
    expect(shown).toBeGreaterThanOrEqual(1);
    expect(heads[0], 'Your gym first, with its count').toBe(`Your gym${shown}`);
    const order = heads.map((h) => h.replace(/\d+$/, ''));
    expect(order.filter((h) => ['Your gym', 'From MettleUp', "What's new"].includes(h))).toEqual(order);
    expect(order.indexOf('Your gym')).toBe(0);

    // The payment stands out: its own row look and the "Payment" label with the tone in words; the others do not.
    const payRow = panel.locator('[data-pay-row="paid"]');
    await expect(payRow).toHaveCount(1);
    await expect(payRow).toContainText('Payment');
    await expect(payRow).toContainText('Asha Verma paid online for 3 months.');
    await expect(payRow).toHaveAccessibleName(/Payment: Paid/);
    await expect(panel.locator('[data-pay-row]')).toHaveCount(1);
    await shot(page, 'computer-bell-dark', { clip: { x: 520, y: 0, width: 760, height: 900 } });
    // A tap outside (the Light switch) closes the panel; open it again in light.
    await setTheme(page, 'light');
    await expect(panel).toHaveCount(0);
    await bell.click();
    await expect(panel).toBeVisible();
    await shot(page, 'computer-bell-light', { clip: { x: 520, y: 0, width: 760, height: 900 } });

    // X hides the card for good on this device; the browser was never asked.
    await panel.getByTestId('bell-alerts-card').getByRole('button', { name: 'Close this card' }).click();
    await expect(panel.getByTestId('bell-alerts-card')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('bell-alerts-card'), 'closed for good on this device').toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('e2e.notifyPermission'))).toBeNull();
  });
});

test.describe('R561 on a phone', () => {
  test('R561-4 phone: the top bar fits (Refresh, bell, Dark | Light, EN | HI), the bell groups, More headings, Hinglish', async ({ page }) => {
    await pushBrowser(page);
    const server = await openApp(page);
    installAlerts(server);
    installWebPush(server);
    await startOnlineGym(page);
    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });

    // The top bar: one round Refresh with a short age, the bell, the two switches, all inside 390 px.
    const refresh = page.getByTestId('panel-refresh');
    await expect(refresh).toHaveCount(1);
    await expect(refresh.getByRole('button', { name: /^Refresh\. Updated/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('radiogroup', { name: 'Language' }).first()).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Hinglish' }).first()).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Dark' }).first()).toBeVisible();
    await expectFitsPhone(page, 'on Today with the new top bar');
    for (const el of [refresh, page.getByRole('button', { name: /^Notifications/ }), page.getByRole('radiogroup', { name: 'Language' }).first()]) {
      const box = await el.boundingBox();
      expect(box.x + box.width, 'inside the phone').toBeLessThanOrEqual(391);
    }
    await page.getByRole('radio', { name: 'Light' }).first().click();
    await shot(page, 'phone-top-bar-light', { clip: { x: 0, y: 0, width: 390, height: 120 } });
    await page.getByRole('radio', { name: 'Dark' }).first().click();
    await shot(page, 'phone-top-bar-dark', { clip: { x: 0, y: 0, width: 390, height: 120 } });

    // Refresh on a phone: the age goes back to "now".
    await refresh.getByRole('button').click();
    await expect(refresh.getByTestId('updated-words')).toHaveText('Updated just now', { timeout: 20_000 });

    // The bell on a phone: the card, Your gym with the payment.
    await page.getByRole('button', { name: /^Notifications/ }).click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel.getByTestId('bell-alerts-card')).toBeVisible({ timeout: 15_000 });
    await expect(panel.locator('[data-pay-row="paid"]')).toBeVisible({ timeout: 70_000 });
    await expectFitsPhone(page, 'with the bell open');
    await shot(page, 'phone-bell-dark');
    await page.getByRole('radio', { name: 'Light' }).first().click();
    await page.getByRole('button', { name: /^Notifications/ }).click();
    if (!(await panel.isVisible())) await page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(panel).toBeVisible();
    await shot(page, 'phone-bell-light');
    await page.keyboard.press('Escape');

    // More: the same group headings as the menu.
    await open(page, 'More');
    await expect(main.locator('[data-group-label]').first()).toBeVisible();
    expect(await main.locator('[data-group-label]').first().evaluate((h) => getComputedStyle(h).textTransform)).toBe('uppercase');
    await expectFitsPhone(page, 'on More');
    await shot(page, 'phone-more-light', { fullPage: true });

    // Hinglish from the top bar: the bell's groups and the short switch.
    await page.getByRole('radio', { name: 'Hinglish' }).first().click();
    await expect(page.getByRole('radio', { name: 'Hinglish' }).first()).toHaveAttribute('aria-checked', 'true');
    await expectFitsPhone(page, 'on More in Hinglish');
    await shot(page, 'phone-more-hi', { fullPage: true });
    await page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(panel).toContainText('Aapka gym');
    await expect(panel).toContainText('Alerts chalu karein');
    await expectFitsPhone(page, 'with the bell open in Hinglish');
    await shot(page, 'phone-bell-hi');
  });
});
