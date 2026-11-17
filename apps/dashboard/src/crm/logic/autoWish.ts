/**
 * R-608 (owner, 16 Nov 2026: "the birthdays are set to be automated but the AI assistant is still suggesting that"):
 * which members on the gym's list get the AUTOMATIC birthday wish on their own phone (9:30 am). PURE.
 *
 * The phone shows it only when the server gives it the member's birthday: member_auto_reminders (0029) reads it from
 * the list only when member_membership (0023, 0055) answers ok for that app member, i.e. the app member's proven
 * number (gym_members.checkin_phone) is on exactly ONE member of the list (not archived; a shared number is refused)
 * and the first names match (_first_name_key). The panel cannot see checkin_phone, but owner_app_members gives each
 * app member's `phone`, and since 0016 every server step that proves a number writes checkin_phone and phone together
 * (leaving clears both), so `phone` stands for it. The review of 16 Nov found that nothing writes a list member's
 * `appUserId` on real gyms (Crispy Curves: 2 app members, 0 linked), and the server never looks at it, so neither does
 * this (R-609: it used to be an extra "yes").
 */
import { phone10 } from './audience';
import type { MemberView } from '../types';

/**
 * The server's _first_name_key (0023), exactly: btrim (plain spaces only), the first word up to a plain space, letters
 * only, lower case; null when nothing is left. Postgres [:alpha:] keeps letters only, NOT marks: checked on the live
 * server (R-609, 17 Nov 2026), Rahul written in Devanagari loses its vowel signs (only r, h, l stay), and a name that
 * starts with a non-breaking space and then a space gives no name at all (the non-breaking space is the first word).
 */
export function firstNameKey(name: string | null | undefined): string | null {
  const first = (name ?? '').replace(/^ +| +$/g, '').split(' ')[0] ?? '';
  const key = first.replace(/[^\p{L}]/gu, '').toLowerCase();
  return key || null;
}

/**
 * The ids of the list members the automatic birthday wish reaches. `views`: the members not archived (the server
 * counts a shared number among those). `appMembers`: the gym's app members (owner_app_members, members who left are
 * not in it).
 */
export function autoWishIds(
  views: readonly Pick<MemberView, 'member'>[],
  appMembers: readonly { name: string; phone: string | null }[],
): Set<string> {
  const byPhone = new Map<string, Pick<MemberView, 'member'>[]>();
  for (const v of views) {
    const p = phone10(v.member.phone);
    if (!p) continue;
    const list = byPhone.get(p);
    if (list) list.push(v);
    else byPhone.set(p, [v]);
  }
  const out = new Set<string>();
  for (const a of appMembers) {
    const p = phone10(a.phone);
    const on = p ? byPhone.get(p) : undefined;
    if (!on || on.length !== 1) continue; // no proven number, not on the list, or a shared number
    const roster = on[0];
    const key = firstNameKey(roster.member.fullName);
    if (key !== null && key === firstNameKey(a.name)) out.add(roster.member.id);
  }
  return out;
}
