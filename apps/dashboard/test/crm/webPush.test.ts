/** R-506 phase 3: alerts with the admin app closed (logic/webPush.ts) and the service worker's push handlers (public/sw.js). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ALERT_SETTINGS,
  PUSH_WORDS,
  TEST_WAIT_MS,
  TEST_WORDS,
  TIME_CHOICES,
  alertSettingsFrom,
  clockLabel,
  sendTestFrom,
  testAlertFrom,
  testAlertState,
  testPollMs,
  testWords,
  keyBytes,
  pushSupport,
  restLine,
  settingLine,
  showAlertsOffer,
  subscriptionParts,
  timeLabel,
} from '../../src/crm/logic/webPush';

describe('alerts with the admin app closed: the words and checks', () => {
  it('reads the gym choice, refusing anything else', () => {
    expect(alertSettingsFrom({ ok: true, mode: 'weekly', minute: 1200, weekday: 5, canEdit: true })).toEqual({ mode: 'weekly', minute: 1200, weekday: 5, canEdit: true });
    expect(alertSettingsFrom({ ok: true, mode: 'daily', minute: 660, weekday: 1 })?.canEdit).toBe(false);
    expect(alertSettingsFrom({ ok: true, mode: 'hourly', minute: 660, weekday: 1 })).toBeNull();
    expect(alertSettingsFrom({ ok: true, mode: 'daily', minute: 1440, weekday: 1 })).toBeNull();
    expect(alertSettingsFrom({ ok: false })).toBeNull();
    expect(alertSettingsFrom([])).toBeNull();
  });

  it('says the time and the choice the Indian way', () => {
    expect(timeLabel(660)).toBe('11:00 am');
    expect(timeLabel(0)).toBe('12:00 am');
    expect(timeLabel(720)).toBe('12:00 pm');
    expect(timeLabel(1290)).toBe('9:30 pm');
    expect(TIME_CHOICES).toHaveLength(48);
    expect(settingLine({ mode: 'instant', minute: 660, weekday: 1 })).toBe('Instantly');
    expect(settingLine({ mode: 'daily', minute: 660, weekday: 1 })).toBe('Daily at 11:00 am');
    expect(settingLine({ mode: 'weekly', minute: 1200, weekday: 0 })).toBe('Weekly on Sunday at 8:00 pm');
    expect(restLine({ mode: 'daily', minute: 660, weekday: 1 })).toBe('Your gym gets everything else together, every day at 11:00 am.');
    expect(restLine({ mode: 'weekly', minute: 660, weekday: 1 })).toBe('Your gym gets everything else together, every Monday at 11:00 am.');
    expect(restLine({ mode: 'instant', minute: 660, weekday: 1 })).toBe('Your gym gets everything else at once too.');
  });

  it('keeps only a real subscription; the key becomes 65 bytes', () => {
    const keys = { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) };
    expect(subscriptionParts({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys })).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', ...keys });
    expect(subscriptionParts({ endpoint: 'http://fcm.googleapis.com/x', keys })).toBeNull();
    expect(subscriptionParts({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'x', auth: 'y' } })).toBeNull();
    expect(subscriptionParts(null)).toBeNull();
    expect(keyBytes('B'.repeat(86) + 'A')).toHaveLength(65);
  });

  it('an iPhone needs the Home Screen app first; the offer shows once, only where it can work', () => {
    const all = { serviceWorker: true, pushManager: true, notification: true, apple: false, standalone: false };
    expect(pushSupport(all)).toBe('yes');
    expect(pushSupport({ ...all, apple: true })).toBe('iphone-install');
    expect(pushSupport({ ...all, apple: true, standalone: true })).toBe('yes');
    expect(pushSupport({ ...all, pushManager: false })).toBe('no');
    const offer = { support: 'yes' as const, permission: 'default', on: false, dismissed: false, ready: true };
    expect(showAlertsOffer(offer)).toBe(true);
    expect(showAlertsOffer({ ...offer, dismissed: true })).toBe(false);
    expect(showAlertsOffer({ ...offer, permission: 'granted' })).toBe(false);
    expect(showAlertsOffer({ ...offer, permission: 'denied' })).toBe(false);
    expect(showAlertsOffer({ ...offer, on: true })).toBe(false);
    expect(showAlertsOffer({ ...offer, ready: false })).toBe(false);
    expect(showAlertsOffer({ ...offer, support: 'iphone-install' })).toBe(false);
  });

  it('fresh eyes: what comes at once, in plain words; the desk is never told complaints come to it', () => {
    for (const w of [PUSH_WORDS.urgentOwner, PUSH_WORDS.urgentStaff]) {
      expect(w).not.toMatch(/check-in numbers|3 days or less/i);
      expect(w).toMatch(/new shop orders/);
    }
    expect(PUSH_WORDS.urgentOwner).toMatch(/^These always come at once: complaints,/);
    expect(PUSH_WORDS.urgentStaff).not.toMatch(/come at once: complaints/i);
    expect(PUSH_WORDS.urgentStaff).toMatch(/Complaints go to the owner only\.$/);
    // Everything else is gathered once a day by default (R-506), not once a week.
    expect(DEFAULT_ALERT_SETTINGS.mode).toBe('daily');
  });

  it('plain words', () => {
    for (const w of Object.values(PUSH_WORDS)) {
      expect(w).not.toMatch(/\b(volume|PR|session|push|VAPID|subscription|service worker)\b/i);
      expect(w.length).toBeLessThanOrEqual(220);
    }
  });
});

// ---------------------------------------------------------------- the service worker, run with a stand-in browser
type Listener = (e: Record<string, unknown>) => void;

function loadWorker(
  windows: { url: string; focused?: boolean; navigated?: string[]; messages?: unknown[] }[] = [],
  env: { origin?: string; fetch?: (url: string, init: RequestInit) => Promise<Response> } = {},
) {
  const listeners: Record<string, Listener> = {};
  const shown: { title: string; opts: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const fetched: { url: string; init: RequestInit }[] = [];
  const self = {
    location: { origin: env.origin ?? 'https://app.mettleup.fit' },
    addEventListener: (name: string, fn: Listener) => {
      listeners[name] = fn;
    },
    skipWaiting: () => undefined,
    registration: {
      showNotification: async (title: string, opts: Record<string, unknown>) => {
        shown.push({ title, opts });
      },
    },
    clients: {
      claim: async () => undefined,
      matchAll: async () =>
        windows.map((w) => ({
          url: w.url,
          focus: async () => {
            w.focused = true;
          },
          navigate: async (u: string) => {
            (w.navigated ??= []).push(u);
          },
          postMessage: (m: unknown) => {
            (w.messages ??= []).push(m);
          },
        })),
      openWindow: async (u: string) => {
        opened.push(u);
      },
    },
  };
  const src = readFileSync(join(__dirname, '../../public/sw.js'), 'utf8');
  const fetchImpl = async (url: string, init: RequestInit) => {
    fetched.push({ url, init });
    return env.fetch ? env.fetch(url, init) : new Response('{"ok":true}');
  };
  new Function('self', 'caches', 'fetch', src)(self, {}, fetchImpl);
  const fire = async (name: string, e: Record<string, unknown>) => {
    let wait: Promise<unknown> = Promise.resolve();
    listeners[name]({ ...e, waitUntil: (p: Promise<unknown>) => (wait = p) });
    await wait;
  };
  return { fire, shown, opened, windows, fetched };
}

describe('the service worker shows an alert and opens its page', () => {
  it('a push shows the words with the tag and the page; a broken push still shows something plain', async () => {
    const w = loadWorker();
    const data = { json: () => ({ title: 'MettleUp: news from your members', body: 'Ravi sent your gym a complaint. Open Member messages to read it.', route: '/member-messages', tag: 'mettleup-alert-a3' }) };
    await w.fire('push', { data });
    expect(w.shown[0]).toEqual({
      title: 'MettleUp: news from your members',
      opts: { body: 'Ravi sent your gym a complaint. Open Member messages to read it.', tag: 'mettleup-alert-a3', icon: '/icons/admin-192.png', badge: '/icons/admin-192.png', data: { route: '/member-messages' } },
    });
    await w.fire('push', { data: { json: () => { throw new Error('not json'); } } });
    expect(w.shown[1].title).toBe('MettleUp: news from your members');
    expect(w.shown[1].opts.body).toBe('Open the admin app to see what is new.');
    await w.fire('push', { data: { json: () => ({ body: 'x', route: 'https://evil.example' }) } });
    expect((w.shown[2].opts.data as { route: string }).route).toBe('/');
  });

  it('a tap opens the page in the open admin app tab, or a new one', async () => {
    const tab = { url: 'https://app.mettleup.fit/#/', navigated: [] as string[] };
    const w = loadWorker([{ url: 'https://other.example/' }, tab]);
    let closed = false;
    await w.fire('notificationclick', { notification: { data: { route: '/questions' }, close: () => (closed = true) } });
    expect(closed).toBe(true);
    expect(tab.navigated).toEqual(['https://app.mettleup.fit/#/questions']);
    expect(w.opened).toEqual([]);
    const none = loadWorker([]);
    await none.fire('notificationclick', { notification: { data: { route: '/shop' }, close: () => undefined } });
    expect(none.opened).toEqual(['https://app.mettleup.fit/#/shop']);
  });
});

// ---------------------------------------------------------------- R-578 "Send a test alert"
describe('the test alert: answers, what the card says, when it asks again', () => {
  const ID = '0b6f6a52-3c1e-4d2a-9f53-2a6c1d9e7b10';
  const AT = Date.UTC(2026, 10, 15, 14, 10, 0); // 7:40 pm India time

  it('reads the server answers, refusing anything else', () => {
    expect(testAlertFrom({ ok: true, on: true, test: null, wait: 0 })).toEqual({ on: true, test: null, wait: 0 });
    expect(testAlertFrom({ ok: true, on: true, wait: 42, test: { id: ID, at: AT, sentAt: AT + 30_000, sentHow: 'instant', shownAt: null } })).toEqual({
      on: true,
      wait: 42,
      test: { id: ID, at: AT, sentAt: AT + 30_000, sentHow: 'instant', shownAt: null },
    });
    expect(testAlertFrom({ ok: true, on: false, test: null, wait: 0 })?.on).toBe(false);
    expect(testAlertFrom({ ok: true, test: { id: 7, at: AT } })).toBeNull();
    expect(testAlertFrom({ ok: true, test: 'x' })).toBeNull();
    expect(testAlertFrom({ ok: false })).toBeNull();
    expect(sendTestFrom({ ok: true, id: ID, at: AT })).toEqual({ ok: true, id: ID, at: AT });
    expect(sendTestFrom({ ok: false, error: 'TOO_SOON', wait: 37 })).toEqual({ ok: false, error: 'TOO_SOON', wait: 37 });
    expect(sendTestFrom({ ok: false, error: 'NOT_ON' })).toEqual({ ok: false, error: 'NOT_ON', wait: 0 });
    expect(sendTestFrom({ ok: false, error: 'SOMETHING' })).toEqual({ ok: false, error: 'UNREADABLE', wait: 0 });
    expect(sendTestFrom(null).ok).toBe(false);
  });

  it('waits about 90 seconds, then says shown, not shown, or still with us', () => {
    const t = { id: ID, at: AT, sentAt: null, sentHow: null, shownAt: null };
    expect(testAlertState(null, AT)).toBe('none');
    expect(testAlertState(t, AT + 10_000)).toBe('waiting');
    expect(testAlertState({ ...t, sentAt: AT + 40_000, sentHow: 'instant' }, AT + TEST_WAIT_MS - 1)).toBe('waiting');
    expect(testAlertState({ ...t, sentAt: AT + 40_000, sentHow: 'instant' }, AT + TEST_WAIT_MS)).toBe('not-shown');
    expect(testAlertState(t, AT + TEST_WAIT_MS)).toBe('not-sent');
    // Shown wins at any time, even after "not shown yet" (a phone that showed it late).
    expect(testAlertState({ ...t, sentAt: AT + 40_000, sentHow: 'instant', shownAt: AT + 45_000 }, AT + 5 * 60_000)).toBe('shown');
    expect(testAlertState({ ...t, sentAt: AT + 40_000, sentHow: 'instant', shownAt: AT + 45_000 }, AT + 45_000)).toBe('shown');
    expect(testAlertState({ ...t, sentAt: AT + 40_000, sentHow: 'none' }, AT + 50_000)).toBe('unreached');
  });

  it('asks every 5 s for 2 minutes, then every 20 s, and stops at 10 minutes or once answered', () => {
    expect(testPollMs('waiting', 1_000)).toBe(5_000);
    expect(testPollMs('not-shown', 119_000)).toBe(5_000);
    expect(testPollMs('not-shown', 121_000)).toBe(20_000);
    expect(testPollMs('not-sent', 9 * 60_000)).toBe(20_000);
    expect(testPollMs('not-shown', 10 * 60_000)).toBeNull();
    expect(testPollMs('shown', 1_000)).toBeNull();
    expect(testPollMs('unreached', 1_000)).toBeNull();
    expect(testPollMs('none', 0)).toBeNull();
  });

  it('says the time on the device clock', () => {
    expect(clockLabel(AT + 60_000, 330)).toBe('7:41 pm');
    expect(clockLabel(AT + 60_000, 0)).toBe('2:11 pm');
    expect(clockLabel(Date.UTC(2026, 10, 15, 2, 0, 0), -300)).toBe('9:00 pm');
    expect(testWords(TEST_WORDS.shown, { time: '7:41 pm' })).toBe('Sent. Did a notice pop up? It showed on this device at 7:41 pm.');
    expect(testWords(TEST_WORDS.tooSoon, { n: 37 })).toBe('You just sent a test. You can send another in 37 seconds.');
  });

  it('plain words that never blame the device or its owner', () => {
    expect(TEST_WORDS.button).toBe('Send a test alert');
    expect(TEST_WORDS.notShown).toBe('We sent it, but this device has not shown it yet.');
    for (const w of Object.values(TEST_WORDS)) {
      expect(w).not.toMatch(/\b(volume|PR|session|push|VAPID|subscription|service worker|endpoint|wrong|fault|broken|your mistake|you must|you need to)\b/i);
      expect(w.length).toBeLessThanOrEqual(220);
    }
    // The checks are things to look at, never "you turned it off".
    for (const w of [TEST_WORDS.checkAllowed, TEST_WORDS.checkQuiet, TEST_WORDS.checkOnline]) expect(w).not.toMatch(/\byou\b/i);
    expect(TEST_WORDS.notSent).toMatch(/on our side/);
  });
});

describe('the service worker shows a test alert and says so', () => {
  const ID = '0b6f6a52-3c1e-4d2a-9f53-2a6c1d9e7b10';
  const testPush = (tag = `mettleup-test-${ID}`) => ({
    data: { json: () => ({ title: 'MettleUp: test alert', body: 'Alerts work on this device. Alerts from your members will look like this.', route: '/settings', tag }) },
  });

  it('shown first, then the alert id (only) to the gym server at our own address, then the open tabs', async () => {
    const tab = { url: 'https://app.mettleup.fit/#/settings', messages: [] as unknown[] };
    const w = loadWorker([tab]);
    await w.fire('push', testPush());
    expect(w.shown).toHaveLength(1);
    expect(w.shown[0].title).toBe('MettleUp: test alert');
    expect(w.shown[0].opts.tag).toBe(`mettleup-test-${ID}`);
    expect(w.fetched).toHaveLength(1);
    expect(w.fetched[0].url).toBe('https://app.mettleup.fit/sb/rest/v1/rpc/panel_test_alert_shown');
    expect(w.fetched[0].init.method).toBe('POST');
    expect(JSON.parse(String(w.fetched[0].init.body))).toEqual({ p_alert: ID });
    expect((w.fetched[0].init.headers as Record<string, string>).apikey).toMatch(/^sb_publishable_/);
    expect(tab.messages).toEqual([{ type: 'mettleup-test-shown', id: ID }]);
  });

  it('our address failing: the direct address once; off our site: the direct address only', async () => {
    const urls: string[] = [];
    const w = loadWorker([], {
      fetch: async (url) => {
        urls.push(url);
        if (url.startsWith('https://app.mettleup.fit/')) throw new TypeError('network');
        return new Response('{"ok":true}');
      },
    });
    await w.fire('push', testPush());
    expect(urls).toEqual(['https://app.mettleup.fit/sb/rest/v1/rpc/panel_test_alert_shown', 'https://hdxzqbdiokjklnypfisq.supabase.co/rest/v1/rpc/panel_test_alert_shown']);
    const dev = loadWorker([], { origin: 'http://localhost:5173' });
    await dev.fire('push', testPush());
    expect(dev.fetched.map((f) => f.url)).toEqual(['https://hdxzqbdiokjklnypfisq.supabase.co/rest/v1/rpc/panel_test_alert_shown']);
  });

  it('a normal alert, or a tag that only looks like a test, tells nobody; a server that fails still shows the notice', async () => {
    const w = loadWorker();
    await w.fire('push', { data: { json: () => ({ body: 'New shop order 7 from Neha. Get it ready on Shop.', route: '/shop', tag: `mettleup-alert-${ID}` }) } });
    await w.fire('push', testPush('mettleup-test-not-an-id'));
    await w.fire('push', testPush(`mettleup-test-${ID}-x`));
    expect(w.shown).toHaveLength(3);
    expect(w.fetched).toEqual([]);
    const down = loadWorker([], { fetch: async () => new Response('', { status: 503 }) });
    await down.fire('push', testPush());
    expect(down.shown).toHaveLength(1);
    expect(down.fetched).toHaveLength(2);
  });
});
