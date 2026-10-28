/**
 * Gym messages and offers that pop up at once (R-153 step 2, Firebase push): this phone's push
 * address, kept with the gym. The rules are in pushPlan.ts; this file asks Android and the server.
 *
 *  - Saved (member_save_push_token, 0038) while the phone is in a gym, "Messages from my gym" is on
 *    and the phone's notifications are allowed; again when Firebase gives the phone a new address,
 *    and once a week.
 *  - Cleared on the server when the switch or the phone's notifications go off; only forgotten here
 *    when the member leaves the gym or erases (member_leave deletes it on the server).
 *  - Checked again whenever the app comes to the front (notifications may have been turned on or
 *    off in the phone's settings meanwhile).
 *  - The step-1 background check (noticeTask.ts, every ~15 minutes) stays as the fallback.
 * Quiet on every failure: a phone without push still gets its pop-ups from the 15-minute check.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

import { apiClearPushToken, apiSavePushToken } from './gymApi';
import { useGymShop } from './gymStore';
import { planPushToken, savedPushFrom, type SavedPush } from './pushPlan';

type NotificationsModule = typeof import('expo-notifications');

export const PUSH_TOKEN_KEY = 'forgeai-gym-push-token';

let mod: NotificationsModule | null | undefined;
function N(): NotificationsModule | null {
  if (mod !== undefined) return mod;
  mod = null;
  if (Platform.OS !== 'android') return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as NotificationsModule;
  } catch (e) {
    console.warn('[ForgeErr] gym push: no notifications module', e);
  }
  return mod;
}

async function readSaved(): Promise<SavedPush | null> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    return savedPushFrom(raw ? (JSON.parse(raw) as unknown) : null);
  } catch {
    return null;
  }
}

let taskRegistered = false;
/** The push task (noticeTask.ts) and the channel the pushes are shown on, once per run. */
async function getReady(n: NotificationsModule): Promise<void> {
  const { ensureNoticeChannel } = await import('./noticeAlertsRun');
  await ensureNoticeChannel();
  if (taskRegistered) return;
  const { PUSH_TASK } = await import('./noticeTask');
  await n.registerTaskAsync(PUSH_TASK);
  taskRegistered = true;
}

/** The server has no 0038 yet: asked once per run, not on every sync. */
let serverMissing = false;

let chain: Promise<unknown> = Promise.resolve();

/** Save, clear or forget this phone's push address to match the phone now. Never rejects. */
export function syncPushToken(): Promise<void> {
  const run = chain.then(async () => {
    const n = N();
    if (!n) return;
    const link = useGymShop.getState().link;
    const switchOn = usePhonePrefs.getState().gymMessagesOn;
    const allowed = link && switchOn ? (await n.getPermissionsAsync()).granted : false;
    const saved = await readSaved();
    let token: string | null = null;
    if (link && switchOn && allowed) {
      await getReady(n).catch((e: unknown) => console.warn('[ForgeErr] gym push: getting ready', e));
      try {
        const t = await n.getDevicePushTokenAsync();
        token = typeof t.data === 'string' && t.data ? t.data : null;
      } catch (e) {
        console.warn('[ForgeErr] gym push: no push address from Firebase', e);
      }
    }
    const step = planPushToken({ linkKey: link?.memberKey ?? null, switchOn, allowed, token, saved, now: Date.now() });
    if (step.kind === 'none') return;
    if (step.kind === 'forget') {
      await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
      return;
    }
    if (step.kind === 'save') {
      if (serverMissing) return;
      const r = await apiSavePushToken(step.key, step.token);
      if (r.ok) {
        await AsyncStorage.setItem(PUSH_TOKEN_KEY, JSON.stringify({ memberKey: step.key, token: step.token, savedAt: Date.now() }));
      } else if ('missing' in r && r.missing) {
        serverMissing = true;
      } else {
        console.warn('[ForgeErr] gym push: saving the push address', r.error);
      }
      return;
    }
    // clear
    const r = await apiClearPushToken(step.key, step.token);
    const gone = r.ok || ('missing' in r && r.missing) || ('error' in r && r.error?.kind === 'BAD_KEY');
    if (gone) await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    else console.warn('[ForgeErr] gym push: clearing the push address (tried again later)', r.error);
  });
  chain = run.catch(() => undefined);
  return run.catch((e: unknown) => console.warn('[ForgeErr] gym push: the sync', e));
}

let started = false;
/**
 * Once, from noticeTaskSync.startNoticeTaskSync (after the saved stores are read): follow the gym link,
 * the switch, Firebase's new addresses and the app coming to the front.
 */
export function startPushTokenSync(): void {
  if (started || Platform.OS !== 'android') return;
  started = true;
  void syncPushToken();
  useGymShop.subscribe((s, prev) => {
    if (s.link?.memberKey !== prev.link?.memberKey) void syncPushToken();
  });
  usePhonePrefs.subscribe((s, prev) => {
    if (s.gymMessagesOn !== prev.gymMessagesOn) void syncPushToken();
  });
  AppState.addEventListener('change', (st) => {
    if (st === 'active') void syncPushToken();
  });
  try {
    N()?.addPushTokenListener(() => void syncPushToken());
  } catch (e) {
    console.warn('[ForgeErr] gym push: listening for a new address', e);
  }
}
