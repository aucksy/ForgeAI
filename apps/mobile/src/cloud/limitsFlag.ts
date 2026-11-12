/**
 * The free part of MettleUp Plus where it counts (F56, R-461): more than 7 exercises of your own, and charts
 * older than 3 months. Asks src/plan/memberPlanStore.ts (who gets what; the rules are packages/theme
 * memberPlan.ts). While MEMBER_PLAN_GATE_ON is false nothing is ever refused. Routines are free for everyone
 * (tracker #43's routine limit is gone). Never throws: on any doubt nothing is refused.
 */
import { chartMonthsAllowed, ownExerciseLimitReached } from '@forgeai/theme';

import { getDb } from '@/db';
import { memberAccessNow } from '@/plan/memberPlanStore';

export type CountedLimit = 'customExercises';

/** Exercises the member made in the exercise form (it stores its own muscles), never a library row. */
async function ownExercisesMade(): Promise<number> {
  const r = await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM exercises WHERE catalog_key IS NULL AND muscles IS NOT NULL');
  return r?.n ?? 0;
}

/** True when one more exercise of the member's own would go over the free part. Never throws (false). */
export async function reachedLimit(_kind: CountedLimit): Promise<boolean> {
  try {
    const a = memberAccessNow();
    if (a.all) return false;
    return ownExerciseLimitReached(a, await ownExercisesMade());
  } catch (e) {
    console.warn('[plan] own exercises check failed; nothing is limited', e);
    return false;
  }
}

/** May a chart show `months` back (null = all time)? Never throws (true). */
export async function chartAllowed(months: number | null): Promise<boolean> {
  try {
    return chartMonthsAllowed(memberAccessNow(), months);
  } catch (e) {
    console.warn('[plan] chart check failed; nothing is limited', e);
    return true;
  }
}
