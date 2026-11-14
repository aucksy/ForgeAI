/**
 * R-505 (owner, 14 Nov 2026): may this member ask a trainer? Read from the gym's own list ("My membership",
 * member_membership), the same answer the server checks before it takes a question (0074). The rule itself is
 * askTrainer.ts askAccess (PURE, tested); this file only asks the server. A QA build reads the device UAT's
 * stand-in pass the way the "My membership" card does (membership.ts withQaPassStandIn).
 */
import Constants from 'expo-constants';

import { askAccess, type AskAccess } from './askTrainer';
import { apiMembership } from './gymApi';
import { hasQaPassStandIn, withQaPassStandIn } from './membership';
import type { GymLink } from './types';

/** null = not known (offline, or an answer it cannot read). Never throws. */
export async function readAskAccess(link: GymLink): Promise<AskAccess | null> {
  try {
    const r = await apiMembership(link.memberKey);
    if (r.ok) return askAccess(withQaPassStandIn(r.data, hasQaPassStandIn(Constants.expoConfig?.extra)));
    // No "My membership" on the server at all: no plan can be known, so nobody may ask (0074 refuses too).
    if ('missing' in r) return { kind: 'hidden' };
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ask] could not read the plan', r.error.kind);
    return null;
  } catch (e) {
    console.warn('[ask] reading the plan failed', e);
    return null;
  }
}
