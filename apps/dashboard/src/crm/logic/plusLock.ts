/**
 * F56 MettleUp Plus, the gym owner's switch (owner R-461, 12 Nov 2026; default "A" = ON). PURE.
 *
 * A member of a MettleUp gym gets every paid feature of the member app free. When their plan ends, the app keeps
 * them free for 7 more days; after that this switch decides: ON (the default) = the paid extras lock until the
 * member renews; OFF = they stay free. The member's own workouts and history are never locked, whatever it says.
 * The 7 days and the default match the app's shared rules (packages/theme/src/memberPlan.ts:
 * GYM_UNLOCK_GRACE_DAYS, GYM_LOCK_AFTER_END_DEFAULT) and the server (supabase/migrations/0070_member_plus_lock.sql).
 */

import { GYM_LOCK_AFTER_END_DEFAULT, GYM_UNLOCK_GRACE_DAYS } from '@forgeai/theme';

export interface PlusLock {
  /** ON = the paid extras lock 7 days after a member's plan ends. */
  lockAfterEnd: boolean;
  /** The owner may change it; the front desk only reads it. */
  canEdit: boolean;
  /** When it was last changed (ms), or null when it was never changed (the default). */
  updatedAt: number | null;
  updatedByName: string | null;
}

/** The server's answer, made safe. A missing or odd value reads as the default (ON). */
export function plusLockFrom(raw: unknown): PlusLock {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const at = typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) && r.updatedAt > 0 ? r.updatedAt : null;
  const who = typeof r.updatedByName === 'string' && r.updatedByName.trim() ? r.updatedByName.trim() : null;
  return {
    lockAfterEnd: typeof r.lockAfterEnd === 'boolean' ? r.lockAfterEnd : GYM_LOCK_AFTER_END_DEFAULT,
    canEdit: r.canEdit === true,
    updatedAt: at,
    updatedByName: who,
  };
}

export const PLUS_LOCK_WORDS = {
  title: 'Free MettleUp Plus for your members',
  body:
    'Your members get every paid feature of the MettleUp app free while their plan is active: the watch app, ' +
    'charts older than 3 months, suggested weights, the calculators and more of their own exercises.',
  switchLabel: 'Lock the paid features when a member’s plan ends',
  switchHint:
    `Members keep them for ${GYM_UNLOCK_GRACE_DAYS} more days after the plan ends. Then they lock until the member ` +
    'renews. Members never lose their workouts, history or routines.',
  save: 'Save',
  savedOn: `Saved. Paid features lock ${GYM_UNLOCK_GRACE_DAYS} days after a member’s plan ends.`,
  savedOff: 'Saved. Members keep the paid features after their plan ends.',
  deskOn: `On: paid features lock ${GYM_UNLOCK_GRACE_DAYS} days after a member’s plan ends.`,
  deskOff: 'Off: members keep the paid features after their plan ends.',
  ownerOnly: 'Only the owner can change this.',
} as const;

/** "Last changed by Asha on 12 Nov 2026", or null when it was never changed. */
export function plusLockChangedLine(lock: PlusLock, dayOf: (ms: number) => string): string | null {
  if (lock.updatedAt == null) return null;
  return lock.updatedByName ? `Last changed by ${lock.updatedByName} on ${dayOf(lock.updatedAt)}.` : `Last changed on ${dayOf(lock.updatedAt)}.`;
}
