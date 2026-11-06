/**
 * Billing step 1 (R-384/R-385): what happens when a gym stops paying, in words for the owner and the
 * desk. The server decides the state from the dates (gym_state, 0062_plan_features.sql; the same rule
 * as gymStateAt in packages/theme/src/plans.ts):
 *   grace     -> 7 extra days, everything on
 *   basic     -> 30 days: check-in, fees and the member list work; no new members; Pro extras off
 *   read_only -> look and download only
 * Paying reopens everything; data is never deleted. The banner shows ONLY while PLAN_GATE_ON is on
 * (and the server says its switch is on too). PURE: no React, no network.
 */
import type { GymState } from '@forgeai/theme';

import { trialDate } from './trial';

/** owner_gym_state's answer (0062). */
export interface GymStateInfo {
  gateOn: boolean;
  state: GymState;
  /** null while the gym is on its free trial. */
  plan: 'starter' | 'pro' | 'ai' | null;
  endsAt: string | null;
  graceUntil: string | null;
  basicUntil: string | null;
}

const STATES: readonly GymState[] = ['active', 'grace', 'basic', 'read_only'];
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v)) ? v : null);

/** The server's answer checked field by field; null for anything it does not understand. PURE. */
export function gymStateFromRow(raw: unknown): GymStateInfo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const state = STATES.find((s) => s === r.state);
  if (!state) return null;
  const plan = r.plan === 'starter' || r.plan === 'pro' || r.plan === 'ai' ? r.plan : null;
  return {
    gateOn: r.gateOn === true,
    state,
    plan,
    endsAt: str(r.endsAt),
    graceUntil: str(r.graceUntil),
    basicUntil: str(r.basicUntil),
  };
}

export interface LapseWords {
  state: Exclude<GymState, 'active'>;
  text: string;
  /** The owner gets "Pay now" (Settings -> Pay MettleUp); the desk is told to ask the owner. */
  payLink: boolean;
}

export const PAY_NOW = 'Pay now';

/** The banner's words, or null for no banner (active, switch off, or nothing known). PURE. */
export function lapseBanner(info: GymStateInfo | null, isOwner: boolean, gateOn: boolean): LapseWords | null {
  if (!gateOn || !info || !info.gateOn || info.state === 'active' || !info.endsAt) return null;
  const ended = info.plan ? `Your MettleUp plan ended on ${trialDate(info.endsAt)}.` : `Your free trial ended on ${trialDate(info.endsAt)}.`;
  const ask = isOwner ? '' : ' Ask the gym owner to pay MettleUp.';
  if (info.state === 'grace') {
    const until = info.graceUntil ? trialDate(info.graceUntil) : '';
    return {
      state: 'grace',
      text: `${ended} Everything still works until ${until}. Pay to keep it that way.${ask}`,
      payLink: isOwner,
    };
  }
  if (info.state === 'basic') {
    const until = info.basicUntil ? trialDate(info.basicUntil) : '';
    return {
      state: 'basic',
      text: `${ended} Until ${until} only check-in, fees and the member list work. You can’t add new members, and the Pro extras are off. After that, nothing can be changed. Pay to switch everything back on.${ask}`,
      payLink: isOwner,
    };
  }
  return {
    state: 'read_only',
    text: `${ended} You can still look at everything and download your data, but nothing can be changed or added. Your data is safe. Pay to switch everything back on.${ask}`,
    payLink: isOwner,
  };
}
