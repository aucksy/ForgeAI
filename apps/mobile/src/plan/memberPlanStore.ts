/**
 * F56 MettleUp Plus (R-461): what the phone keeps about the member's plan, and the ONE place every screen asks
 * "may this member use that paid feature now?" (memberAccessNow / useMemberAccess / canUseNow). The rules are
 * packages/theme/src/memberPlan.ts; the blob and its checks are memberPlan.ts.
 *
 * While MEMBER_PLAN_GATE_ON is false (today) every answer is "everything open" and nothing here changes what a
 * member sees. Before the kept blob has loaded, the answer is the free month's day 1 (everything open): the app
 * never locks anyone by mistake.
 * Shared code: Android and iPhone alike.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { canUse, type MemberAccess, type PaidFeature, type PlusOption } from '@forgeai/theme';

import { todayISO } from '@/lib/date';
import type { MembershipAnswer } from '@/shop/membership';

import { accessOf, cleanPlan, EMPTY_PLAN, gymFactsFrom, MEMBER_PLAN_STORAGE_KEY, planToday, qaPlanFrom, type PlanBlob } from './memberPlan';

interface PlanState extends PlanBlob {
  setBlob: (b: Partial<PlanBlob>) => void;
}

export const useMemberPlan = create<PlanState>()(
  persist(
    (set) => ({
      ...EMPTY_PLAN,
      setBlob: (b) => set(b),
    }),
    {
      name: MEMBER_PLAN_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s): PlanBlob => ({
        trialStartedOn: s.trialStartedOn,
        bought: s.bought,
        staff: s.staff,
        gym: s.gym,
        seenSoon: s.seenSoon,
        seenEnded: s.seenEnded,
        qaGateOn: s.qaGateOn,
        qaToday: s.qaToday,
      }),
      merge: (persisted, current) => ({ ...current, ...cleanPlan(persisted) }),
    },
  ),
);

let qa = false;
/**
 * This build carries the 'memberPlan' stand-in (QA builds for the cloud phone test only). Set once by
 * planSync.startPlanSync from app.json, before the first screen draws; this file stays free of expo-constants
 * so the pure tests (and every store that asks canUseNow) load it under Node.
 */
export function isQaPlanBuild(): boolean {
  return qa;
}
export function setQaPlanBuild(on: boolean): void {
  qa = on;
}

function blob(): PlanBlob {
  return useMemberPlan.getState();
}

/** Who gets what right now. Never throws (anything odd = everything open). */
export function memberAccessNow(): MemberAccess {
  try {
    return accessOf(blob(), todayISO(), isQaPlanBuild());
  } catch (e) {
    console.warn('[plan] access check failed; everything open', e);
    return { all: true, why: 'off' };
  }
}

/** The day the plan counts as today (a QA build's made-up day wins there). */
export function planTodayNow(): string {
  return planToday(blob(), todayISO(), isQaPlanBuild());
}

/** May the member use this paid feature now? Never throws (true on any doubt). */
export function canUseNow(feature: PaidFeature): boolean {
  return canUse(memberAccessNow(), feature);
}

/** The same answer for a screen, redrawn when the kept plan changes. */
export function useMemberAccess(): MemberAccess {
  // Each field the answer reads, picked one by one so an unrelated change redraws nothing.
  const s = useMemberPlan();
  return accessOf(s, todayISO(), isQaPlanBuild());
}

/** Start the free month on its first day with the plan switched on. Never throws. */
export function startTrialIfDue(): void {
  try {
    const a = memberAccessNow();
    if (a.why === 'off' || blob().trialStartedOn) return;
    useMemberPlan.getState().setBlob({ trialStartedOn: planTodayNow() });
  } catch (e) {
    console.warn('[plan] the free month could not be started', e);
  }
}

/** "My membership" answered for the joined gym (membershipKept.ts): keep what it says about a plan or pass. */
export function noteMembership(memberId: string, answer: MembershipAnswer): void {
  try {
    const prev = blob().gym;
    const lock = prev && prev.memberId === memberId ? prev.lockAfterEnd : null;
    const gym = gymFactsFrom(memberId, answer, lock);
    if (JSON.stringify(gym) !== JSON.stringify(prev)) useMemberPlan.getState().setBlob({ gym });
  } catch (e) {
    console.warn('[plan] the gym plan could not be kept', e);
  }
}

/** The gym owner's switch (0070) as the gym's server said it, for this member's link. */
export function noteGymLock(memberId: string, lockAfterEnd: boolean | null): void {
  const g = blob().gym;
  if (!g || g.memberId !== memberId || g.lockAfterEnd === lockAfterEnd) return;
  useMemberPlan.getState().setBlob({ gym: { ...g, lockAfterEnd } });
}

/**
 * "Find my gym with my number" found this gym's plan for the proven number and the join linked it (0068): keep
 * the plan's end (null = a pass) for this link at once. Later "My membership" answers keep it up to date.
 */
export function noteFoundGym(memberId: string, gymName: string, endsOn: string | null): void {
  const prev = blob().gym;
  const lockAfterEnd = prev && prev.memberId === memberId ? prev.lockAfterEnd : null;
  useMemberPlan.getState().setBlob({ gym: { memberId, gymName: gymName.trim().slice(0, 80) || 'your gym', endsOn, lockAfterEnd } });
}

/** The phone left the gym (or joined another): the gym unlocks nothing any more. */
export function forgetGym(): void {
  if (blob().gym) useMemberPlan.getState().setBlob({ gym: null });
}

/** "Do you run a gym on MettleUp?" proved this person is the gym's owner or desk staff. */
export function noteStaff(gymName: string, joinCode: string): void {
  useMemberPlan.getState().setBlob({ staff: { gymName: gymName.trim().slice(0, 80) || 'your gym', joinCode } });
}

/** What Google Play (or the QA stand-in store) says this account owns now; null = nothing. */
export function noteBought(option: PlusOption | null): void {
  const prev = blob().bought?.option ?? null;
  if (prev !== option) useMemberPlan.getState().setBlob({ bought: option ? { option } : null });
}

/** The "ends soon" / "has ended" pop-up was shown for this free month. */
export function markSeen(kind: 'soon' | 'ended', lastDay: string): void {
  useMemberPlan.getState().setBlob(kind === 'soon' ? { seenSoon: lastDay } : { seenEnded: lastDay });
}

/**
 * Erase all data: the staff unlock, the gym unlock and what Google Play said go (Play is asked again; "I already
 * paid" brings a purchase back). The free month's first day stays: it is the plan's clock, not the member's data,
 * and an erase must not start a new free month.
 */
export function forgetOnErase(): void {
  useMemberPlan.getState().setBlob({ staff: null, gym: null, bought: null, qaGateOn: false, qaToday: null });
}

/** QA builds only (mettleup://qa-plan): set the test switch, the day and the facts. Ignored elsewhere. */
export function applyQaPlan(params: Record<string, string | undefined>): boolean {
  if (!isQaPlanBuild()) return false;
  const next = qaPlanFrom(blob(), params, todayISO());
  useMemberPlan.getState().setBlob(next);
  return true;
}
