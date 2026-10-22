/**
 * "Check workout code" (Messages & offers step 1, item 6; OWNER-INBOX #49): the desk types the code
 * from the member's app (claimCode.ts), and each workout day it holds is matched against this gym's
 * own check-ins. Only a day with a check-in counts, so a workout on the sofa earns nothing. PURE.
 */

import { decodeClaim } from './claimCode';
import { diffDays } from './dates';
import type { Visit } from '../types';

/** A code made more than this many days ago misses the newest workouts: ask for a new one. */
export const CODE_OLD_DAYS = 3;

export interface ClaimDay {
  day: string;
  /** How the member checked in that day, or null for no check-in. */
  checkIn: Visit['source'] | null;
}

export type ClaimCheck =
  | {
      ok: true;
      madeOn: string;
      /** Oldest first. */
      days: ClaimDay[];
      /** Workout days with a check-in. */
      matched: number;
      atDesk: number;
      inApp: number;
      /** The code is older than CODE_OLD_DAYS: the words say so. */
      old: boolean;
    }
  | { ok: false; problem: string };

const PROBLEM: Record<'length' | 'letter' | 'check', string> = {
  length: 'A workout code has 10 letters and numbers, like K3Q9P-X2M7A.',
  letter: 'That code has a letter a workout code never uses. Check it against the member’s phone.',
  check: 'That code has a typing mistake. Check it against the member’s phone.',
};

/** Reads a code and matches its days against this member's check-ins. */
export function checkClaim(code: string, visits: readonly Visit[], today: string): ClaimCheck {
  const read = decodeClaim(code, today);
  if (!read.ok) return { ok: false, problem: PROBLEM[read.problem] };
  // One check-in a day is enough; a desk check-in wins over an app one (the stronger proof).
  const byDay = new Map<string, Visit['source']>();
  for (const v of visits) {
    const had = byDay.get(v.visitedOn);
    if (!had || (had !== 'desk' && v.source === 'desk')) byDay.set(v.visitedOn, v.source);
  }
  const days = read.days.map((day) => ({ day, checkIn: byDay.get(day) ?? null }));
  const hit = days.filter((d) => d.checkIn !== null);
  return {
    ok: true,
    madeOn: read.madeOn,
    days,
    matched: hit.length,
    atDesk: hit.filter((d) => d.checkIn === 'desk').length,
    inApp: hit.filter((d) => d.checkIn === 'app').length,
    old: diffDays(read.madeOn, today) > CODE_OLD_DAYS,
  };
}

/** "8 of 9 workouts match a check-in (6 at the desk, 2 in the app)." PURE. */
export function claimSummary(c: Extract<ClaimCheck, { ok: true }>): string {
  const n = c.days.length;
  if (n === 0) return 'This code has no workouts in its 30 days.';
  const how = [c.atDesk > 0 ? `${c.atDesk} at the desk` : '', c.inApp > 0 ? `${c.inApp} in the app` : '', c.matched - c.atDesk - c.inApp > 0 ? `${c.matched - c.atDesk - c.inApp} imported` : '']
    .filter(Boolean)
    .join(', ');
  return `${c.matched} of ${n} ${n === 1 ? 'workout matches' : 'workouts match'} a check-in${how && c.matched > 0 ? ` (${how})` : ''}.`;
}
