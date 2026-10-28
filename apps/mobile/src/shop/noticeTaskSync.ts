/**
 * Gym notices that pop up on the phone: keeps the background job (noticeTask.ts) registered while
 * the phone is in a gym and "Messages from my gym" is on, and unregistered (with what was alerted
 * forgotten) when the member leaves, the gym lets the phone go, the data is erased or the switch
 * goes off. Started once from the root layout; every join, leave and erase moves the gym link,
 * so watching the link covers them all. Quiet on every failure.
 */
import { Platform } from 'react-native';

import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

import { useGymShop } from './gymStore';
import { NOTICE_TASK_MINUTES, noticeTaskWanted } from './noticeAlerts';

let chain: Promise<unknown> = Promise.resolve();

/** Register or unregister the job to match the phone now. Never rejects. */
export function syncNoticeTask(): Promise<void> {
  const run = chain.then(async () => {
    if (Platform.OS !== 'android') return;
    const BackgroundTask = await import('expo-background-task');
    // The entry file (index.js) loads noticeTask; asking for it here makes sure it is defined.
    const { NOTICE_TASK } = await import('./noticeTask');
    const wanted = noticeTaskWanted(useGymShop.getState().link != null, usePhonePrefs.getState().gymMessagesOn);
    if (wanted) {
      await BackgroundTask.registerTaskAsync(NOTICE_TASK, { minimumInterval: NOTICE_TASK_MINUTES });
      return;
    }
    await BackgroundTask.unregisterTaskAsync(NOTICE_TASK);
    // The next time it is on (or a gym is joined) starts with a first look: no flood of old notices.
    const { forgetNoticeAlerts } = await import('./noticeAlertsRun');
    await forgetNoticeAlerts();
  });
  chain = run.catch(() => undefined);
  return run.catch((e: unknown) => console.warn('[ForgeErr] gym notices: the background job', e));
}

function whenRead(p: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void }): Promise<void> {
  if (p.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    const unsub = p.onFinishHydration(() => {
      clearTimeout(timer);
      unsub();
      resolve();
    });
  });
}

/** Root layout, once. */
export function startNoticeTaskSync(): void {
  if (Platform.OS !== 'android') return;
  void Promise.all([whenRead(useGymShop.persist), whenRead(usePhonePrefs.persist)]).then(() => {
    void syncNoticeTask();
    // R-153 step 2: the push address follows the same link and switch (pushToken.ts); step 1 stays the fallback.
    void import('./pushToken').then((m) => m.startPushTokenSync()).catch((e: unknown) => console.warn('[ForgeErr] gym push: start', e));
    useGymShop.subscribe((s, prev) => {
      if (s.link?.memberKey === prev.link?.memberKey) return;
      void syncNoticeTask();
      // Just joined: take a first look now (remembers what is there, shows nothing), not 15 minutes on.
      if (s.link) void import('./gymActions').then((m) => m.refreshInbox()).catch(() => undefined);
    });
    usePhonePrefs.subscribe((s, prev) => {
      if (s.gymMessagesOn !== prev.gymMessagesOn) void syncNoticeTask();
    });
  });
}
