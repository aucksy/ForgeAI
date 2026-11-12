/**
 * F56 MettleUp Plus (R-461): keeps the plan in step with the rest of the app, from the root layout.
 *  - starts the free month on its first day with the plan switched on;
 *  - the gym unlock follows the gym link: Leave gym (or another gym) drops it; a kept "My membership" answer
 *    for the joined gym fills it at once (later answers come through membershipKept.keepMembership);
 *  - the watch follows the plan: on the free part the phone tells the watch "needs MettleUp Plus" in place of
 *    the workout and sends no rest (restCard.setWatchLock; Android only, the watch app is Wear OS);
 *  - with payments live, asks Google Play once a launch what this account owns (playBilling.ts).
 * Never throws; every step only logs.
 */
import { MEMBER_PAYMENTS_LIVE } from '@forgeai/theme';
import Constants from 'expo-constants';
import { AppState } from 'react-native';

import { useGymShop } from '@/shop/gymStore';

import { hasQaPlanStandIn } from './memberPlan';
import { forgetGym, isQaPlanBuild, memberAccessNow, noteMembership, setQaPlanBuild, startTrialIfDue, useMemberPlan } from './memberPlanStore';
import { WATCH_LOCKED } from './planWords';

let started = false;

function whenHydrated(store: { persist: { hasHydrated: () => boolean; onFinishHydration: (cb: () => void) => () => void } }): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const off = store.persist.onFinishHydration(() => {
      off();
      resolve();
    });
  });
}

async function followGym(): Promise<void> {
  const link = useGymShop.getState().link;
  const gym = useMemberPlan.getState().gym;
  // The device UAT's made-up gym (mettleup://qa-plan?gym=...) is not tied to a link.
  if (gym && gym.memberId === 'qa' && isQaPlanBuild()) return;
  if (!link) {
    forgetGym();
    return;
  }
  if (gym && gym.memberId !== link.memberId) forgetGym();
  if (!useMemberPlan.getState().gym) {
    const { readKeptMembership } = await import('@/shop/membershipKept');
    const kept = await readKeptMembership(link.memberId);
    if (kept) noteMembership(link.memberId, kept.answer);
  }
}

let lastWatch: string | null = null;
async function followWatch(): Promise<void> {
  const locked = !memberAccessNow().all;
  const key = locked ? 'locked' : 'open';
  if (key === lastWatch) return;
  lastWatch = key;
  const { setWatchLock } = await import('@/tracker/services/restCard');
  setWatchLock(locked ? WATCH_LOCKED : null);
}

/** Once, from the root layout. */
export function startPlanSync(): void {
  if (started) return;
  started = true;
  // First, before any screen draws: is this a QA build with the plan's test switch (app.json extra)?
  try {
    setQaPlanBuild(hasQaPlanStandIn(Constants.expoConfig?.extra));
  } catch {
    setQaPlanBuild(false);
  }
  void (async () => {
    try {
      await Promise.all([whenHydrated(useMemberPlan), whenHydrated(useGymShop)]);
      startTrialIfDue();
      await followGym();
      await followWatch();
      useGymShop.subscribe((s, prev) => {
        if (s.link?.memberId !== prev.link?.memberId) void followGym().catch((e: unknown) => console.warn('[plan] gym follow failed', e));
      });
      const follow = (): void => {
        startTrialIfDue();
        void followWatch().catch((e: unknown) => console.warn('[plan] watch follow failed', e));
      };
      useMemberPlan.subscribe(follow);
      // The free month can end overnight: look again whenever the app comes back.
      AppState.addEventListener('change', (st) => {
        if (st === 'active') follow();
      });
      if (MEMBER_PAYMENTS_LIVE && memberAccessNow().why !== 'off') {
        const { refreshOwned } = await import('./playBilling');
        await refreshOwned();
      }
    } catch (e) {
      console.warn('[plan] start failed; everything stays open', e);
    }
  })();
}
