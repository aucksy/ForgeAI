/**
 * "My membership"'s last answer, kept on the phone per member ({ memberId, answer, at }), so the card
 * still shows at the gym with no signal and the gym reminders (gymReminders.ts) can be set from it.
 * Leave the gym and Erase all data remove it. Moved out of MembershipCard.tsx (R-86) unchanged.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { MEMBERSHIP_STORAGE_KEY, membershipFromRow, type MembershipAnswer } from './membership';

export async function readKeptMembership(memberId: string): Promise<{ answer: MembershipAnswer; at: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(MEMBERSHIP_STORAGE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object') return null;
    const o = v as { memberId?: unknown; answer?: unknown; at?: unknown };
    if (o.memberId !== memberId || typeof o.at !== 'number') return null;
    const answer = membershipFromRow(o.answer);
    return answer ? { answer, at: o.at } : null;
  } catch (e) {
    console.warn('[ForgeErr] membership: reading the kept answer', e);
    return null;
  }
}

export async function keepMembership(memberId: string, answer: MembershipAnswer): Promise<void> {
  try {
    // Kept in the server's own shape, so the same reader checks it when it is read back.
    const raw = answer.ok
      ? { ok: true, gymName: answer.gymName, memberName: answer.memberName, day: answer.day, current: answer.current, next: answer.next, lastEndedOn: answer.lastEndedOn, visitsThisMonth: answer.visitsThisMonth }
      : { error: answer.problem, gymName: answer.gymName };
    await AsyncStorage.setItem(MEMBERSHIP_STORAGE_KEY, JSON.stringify({ memberId, answer: raw, at: Date.now() }));
  } catch (e) {
    console.warn('[ForgeErr] membership: keeping the answer', e);
  }
}
