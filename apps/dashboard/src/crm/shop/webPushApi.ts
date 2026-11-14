/**
 * R-506 phase 3: this browser's alerts with the admin app closed (logic/webPush.ts), and the gym's choice of when the
 * rest come (supabase/migrations/0076_panel_web_push.sql). Every gym-server call carries the owner's, desk's or
 * trainer's key; each browser is saved for that sign-in only (signing out stops its alerts).
 *
 * Until 0076 is on the server, the first call answers PGRST202 ("no such function"): this page then remembers
 * "not here" for the life of the page and the cards stay hidden (as alertsApi.ts does for 0075). The demo gym never
 * calls. The push company's address is made by the browser itself (pushManager.subscribe); the public key it needs
 * comes from our own Worker (/api/push/web-key, deploy/panel/webKey.js).
 */

import { isDemoLocked } from '../../lib/demoLock';
import { alertSettingsFrom, keyBytes, pushSupport, subscriptionParts, type AlertSettings, type PushSupport } from '../logic/webPush';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

let missing = false;

/** True once the server said it has no 0076 (or in the demo gym). */
export function webPushMissing(): boolean {
  return missing || isDemoLocked();
}

async function guarded<T>(fn: () => Promise<T>): Promise<T | 'missing'> {
  if (webPushMissing()) return 'missing';
  try {
    return await fn();
  } catch (e) {
    if (isNoSuchFunction(e)) {
      if (!missing) console.info('[web push] this gym server has no alerts with the app closed yet (0076 not applied)');
      missing = true;
      return 'missing';
    }
    throw e;
  }
}

/** The gym's choice. 'missing': no 0076. */
export function getAlertSettings(key: string): Promise<AlertSettings | 'missing'> {
  return guarded(async () => {
    const s = alertSettingsFrom(await call<unknown>('owner_alert_settings', { p_key: key }));
    if (!s) throw new Error('unreadable answer');
    return s;
  });
}

/** The owner changes it. Throws OWNER_ONLY / INVALID as they came. */
export async function saveAlertSettings(key: string, s: Pick<AlertSettings, 'mode' | 'minute' | 'weekday'>): Promise<AlertSettings> {
  const r = await guarded(async () => alertSettingsFrom(await call<unknown>('owner_save_alert_settings', { p_key: key, p_mode: s.mode, p_minute: s.minute, p_weekday: s.weekday })));
  if (r === 'missing' || !r) throw new Error('not saved');
  return r;
}

/** What this browser can do. */
export function browserPushSupport(): PushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'no';
  const ua = navigator.userAgent || '';
  const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return pushSupport({
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    notification: 'Notification' in window,
    apple,
    standalone,
  });
}

/** The page's service worker (public/sw.js), or null within a few seconds when there is none. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const now = await navigator.serviceWorker.getRegistration();
  if (now) return now;
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((done) => window.setTimeout(() => done(null), 8000))]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await registration();
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch (e) {
    console.warn('[web push] reading this browser', e);
    return null;
  }
}

/** Is this browser saved for this sign-in? 'missing': no 0076. */
export async function pushIsOn(key: string): Promise<boolean | 'missing'> {
  if (webPushMissing()) return 'missing';
  if (browserPushSupport() !== 'yes' || Notification.permission !== 'granted') return false;
  const sub = await currentSubscription();
  const parts = sub ? subscriptionParts(sub.toJSON()) : null;
  if (!parts) return false;
  return guarded(async () => {
    const r = await call<{ ok?: boolean; on?: boolean }>('owner_web_push_on', { p_key: key, p_endpoint: parts.endpoint });
    return r?.on === true;
  });
}

export type TurnOn = 'on' | 'blocked' | 'unsupported' | 'not-ready' | 'missing';

/** Ask the browser once (from a tap), make the push address, save it for this sign-in. */
export async function turnOnPush(key: string): Promise<TurnOn> {
  if (webPushMissing()) return 'missing';
  if (browserPushSupport() !== 'yes') return 'unsupported';
  const answer = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (answer !== 'granted') return 'blocked';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const res = await fetch('/api/push/web-key', { headers: { Accept: 'application/json' } });
  const body = (await res.json().catch(() => null)) as { key?: unknown } | null;
  if (!res.ok || typeof body?.key !== 'string') return 'not-ready';
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(body.key) as BufferSource });
  const parts = subscriptionParts(sub.toJSON());
  if (!parts) throw new Error('the browser gave no usable push address');
  const r = await guarded(() => call<unknown>('owner_save_web_push', { p_key: key, p_endpoint: parts.endpoint, p_p256dh: parts.p256dh, p_auth: parts.auth }));
  return r === 'missing' ? 'missing' : 'on';
}

/** Stop alerts on this browser: forget it on the server and drop the push address. */
export async function turnOffPush(key: string): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const parts = subscriptionParts(sub.toJSON());
  if (parts) await guarded(() => call<unknown>('owner_clear_web_push', { p_key: key, p_endpoint: parts.endpoint }));
  await sub.unsubscribe().catch((e: unknown) => console.warn('[web push] unsubscribe', e));
}

export function resetWebPushApiForTest(): void {
  missing = false;
}
