/** R-506 phase 3: alerts with the admin app closed (logic/webPush.ts) and the service worker's push handlers (public/sw.js). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ALERT_SETTINGS,
  PUSH_WORDS,
  TIME_CHOICES,
  alertSettingsFrom,
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

function loadWorker(windows: { url: string; focused?: boolean; navigated?: string[] }[] = []) {
  const listeners: Record<string, Listener> = {};
  const shown: { title: string; opts: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const self = {
    location: { origin: 'https://app.mettleup.fit' },
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
        })),
      openWindow: async (u: string) => {
        opened.push(u);
      },
    },
  };
  const src = readFileSync(join(__dirname, '../../public/sw.js'), 'utf8');
  new Function('self', 'caches', 'fetch', src)(self, {}, async () => new Response(''));
  const fire = async (name: string, e: Record<string, unknown>) => {
    let wait: Promise<unknown> = Promise.resolve();
    listeners[name]({ ...e, waitUntil: (p: Promise<unknown>) => (wait = p) });
    await wait;
  };
  return { fire, shown, opened, windows };
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
