/**
 * F56 MettleUp Plus (R-461) on the phone: the PURE half of what the phone keeps (the free month's first day,
 * what Google Play said, the staff and gym unlock) and how it turns into "who gets what". The rules themselves
 * are shared with the admin app: packages/theme/src/memberPlan.ts. memberPlanStore.ts keeps the blob.
 * Shared code: Android and iPhone alike.
 */
import { MEMBER_PLAN_GATE_ON, PLUS_OPTIONS, memberAccess, planDay, type GymUnlockFacts, type MemberAccess, type PlusOption } from '@forgeai/theme';

import type { MembershipAnswer } from '@/shop/membership';

/** What the phone keeps (AsyncStorage 'mettleup-member-plan'). */
export interface PlanBlob {
  /** The free month's first day on this phone; null = not started. Erase all data keeps it (the plan's clock). */
  trialStartedOn: string | null;
  /** What Google Play last said this account owns (or the QA stand-in store). */
  bought: { option: PlusOption } | null;
  /** Owner or desk staff (proved with the admin-app PIN on "Do you run a gym on MettleUp?"). */
  staff: { gymName: string; joinCode: string } | null;
  /** The joined gym's list showed a plan or pass for this member (memberId = the link it was read for). */
  gym: (GymUnlockFacts & { memberId: string }) | null;
  /** The free month whose "ends soon" / "has ended" pop-up was shown (its last day), so each shows once. */
  seenSoon: string | null;
  seenEnded: string | null;
  /** QA builds only (mettleup://qa-plan): the test switch and a made-up today. */
  qaGateOn: boolean;
  qaToday: string | null;
}

export const EMPTY_PLAN: PlanBlob = {
  trialStartedOn: null,
  bought: null,
  staff: null,
  gym: null,
  seenSoon: null,
  seenEnded: null,
  qaGateOn: false,
  qaToday: null,
};

export const MEMBER_PLAN_STORAGE_KEY = 'mettleup-member-plan';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 80): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** A saved blob, checked field by field (anything odd is dropped, never trusted). PURE. */
export function cleanPlan(raw: unknown): PlanBlob {
  if (!isObj(raw)) return EMPTY_PLAN;
  const bought = isObj(raw.bought) && (PLUS_OPTIONS as readonly unknown[]).includes(raw.bought.option) ? { option: raw.bought.option as PlusOption } : null;
  const staff = isObj(raw.staff) && text(raw.staff.joinCode) ? { gymName: text(raw.staff.gymName) || 'your gym', joinCode: text(raw.staff.joinCode, 12) } : null;
  let gym: PlanBlob['gym'] = null;
  if (isObj(raw.gym) && text(raw.gym.memberId, 200)) {
    const endsOn = raw.gym.endsOn === null ? null : planDay(raw.gym.endsOn);
    if (endsOn !== null || raw.gym.endsOn === null) {
      gym = {
        memberId: text(raw.gym.memberId, 200),
        gymName: text(raw.gym.gymName) || 'your gym',
        endsOn,
        lockAfterEnd: typeof raw.gym.lockAfterEnd === 'boolean' ? raw.gym.lockAfterEnd : null,
      };
    }
  }
  return {
    trialStartedOn: planDay(raw.trialStartedOn),
    bought,
    staff,
    gym,
    seenSoon: planDay(raw.seenSoon),
    seenEnded: planDay(raw.seenEnded),
    qaGateOn: raw.qaGateOn === true,
    qaToday: planDay(raw.qaToday),
  };
}

/**
 * The gym facts from a "My membership" answer: a pass (no end), the running plan (or the renewal after it), a
 * plan that starts later, or the plan that ended last. null = the gym's list shows no plan for this member (or
 * the member's number is not linked yet), so the gym unlocks nothing. `lockAfterEnd` is carried over. PURE.
 */
export function gymFactsFrom(memberId: string, a: MembershipAnswer, lockAfterEnd: boolean | null): PlanBlob['gym'] {
  if (!a.ok) return null;
  // A pass (FITPASS...; also the device UAT's pass stand-in) has no end.
  if (a.pass) return { memberId, gymName: a.gymName, endsOn: null, lockAfterEnd };
  const endsOn = a.next?.endsOn ?? a.current?.endsOn ?? a.lastEndedOn;
  if (!endsOn) return null;
  return { memberId, gymName: a.gymName, endsOn, lockAfterEnd };
}

/** Is the test switch allowed in this build (QA builds with the 'memberPlan' stand-in)? PURE. */
export function hasQaPlanStandIn(extra: unknown): boolean {
  const list = extra && typeof extra === 'object' ? (extra as { qaStandIns?: unknown }).qaStandIns : undefined;
  return Array.isArray(list) && list.includes('memberPlan');
}

/** Who gets what, for this blob on `realToday` (a QA build's made-up today wins there). PURE. */
export function accessOf(b: PlanBlob, realToday: string, qaBuild: boolean, gateOn: boolean = MEMBER_PLAN_GATE_ON): MemberAccess {
  const today = qaBuild && b.qaToday ? b.qaToday : realToday;
  return memberAccess({
    today,
    gateOn: gateOn || (qaBuild && b.qaGateOn),
    trialStartedOn: b.trialStartedOn,
    bought: b.bought,
    staff: b.staff,
    gym: b.gym,
  });
}

/** The day the app counts as today for this blob. PURE. */
export function planToday(b: PlanBlob, realToday: string, qaBuild: boolean): string {
  return qaBuild && b.qaToday ? b.qaToday : realToday;
}

/** Which one-time pop-up is due now, if any (each free month shows each once). PURE. */
export function duePopUp(a: MemberAccess, b: PlanBlob): { kind: 'soon'; lastDay: string; daysLeft: number } | { kind: 'ended'; lastDay: string } | null {
  if (a.why === 'trial' && a.daysLeft <= 5 && b.seenSoon !== a.lastDay) return { kind: 'soon', lastDay: a.lastDay, daysLeft: a.daysLeft };
  if (a.why === 'free' && a.trialEndedOn && !a.gymEnded && b.seenEnded !== a.trialEndedOn) return { kind: 'ended', lastDay: a.trialEndedOn };
  return null;
}

/**
 * QA builds only: mettleup://qa-plan?gate=1&day=26&bought=yearly&staff=Iron%20Temple&gym=Iron%20Temple&ends=2026-12-01
 * &lock=1&today=2026-12-15&reset=1 -> the blob it makes. `day` = which day of the free month today is (1-based;
 * 31 = ended). PURE.
 */
export function qaPlanFrom(b: PlanBlob, p: Record<string, string | undefined>, realToday: string): PlanBlob {
  let out: PlanBlob = p.reset === '1' ? { ...EMPTY_PLAN, trialStartedOn: null } : { ...b };
  if (p.gate === '1') out.qaGateOn = true;
  if (p.gate === '0') out.qaGateOn = false;
  if (p.today !== undefined) out.qaToday = planDay(p.today);
  const today = out.qaToday ?? realToday;
  const day = p.day ? Number(p.day) : NaN;
  if (Number.isInteger(day) && day >= 1 && day <= 400) {
    out.trialStartedOn = new Date(Date.parse(`${today}T00:00:00Z`) - (day - 1) * 86_400_000).toISOString().slice(0, 10);
    out.seenSoon = null;
    out.seenEnded = null;
  }
  if (p.bought !== undefined) out.bought = (PLUS_OPTIONS as readonly string[]).includes(p.bought) ? { option: p.bought as PlusOption } : null;
  if (p.staff !== undefined) out.staff = p.staff ? { gymName: p.staff.slice(0, 80), joinCode: 'QAGYM1' } : null;
  if (p.gym !== undefined) {
    out.gym = p.gym
      ? { memberId: 'qa', gymName: p.gym.slice(0, 80), endsOn: p.ends ? planDay(p.ends) : null, lockAfterEnd: p.lock === '1' ? true : p.lock === '0' ? false : null }
      : null;
  }
  out = cleanPlan(out);
  return out;
}
