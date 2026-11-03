/**
 * Launch audit 3 Nov 2026 (owner side #5): a member whose plan has ended can still check in, at
 * the desk (by design: the desk sees the warning and decides) and by the QR poster (the server
 * records the visit and only tells the app planOk: false; supabase/migrations/0048, member_check_in).
 * Nobody told the owner. Today now lists who came in today on an ended plan, with no plan, or
 * owing money, so the desk can ask them before they leave. PURE.
 */

import type { DateISO } from './dates';
import type { MemberView, Visit } from '../types';

export interface CameInRow {
  view: MemberView;
  /** No plan covers today: ended, cancelled, never bought one, or one that starts later. */
  noPlan: boolean;
  /** What they owe, in paise (0 = nothing). */
  dueP: number;
}

/** Not covered today by any plan. */
export function coveredToday(v: Pick<MemberView, 'state'>): boolean {
  return v.state === 'active' || v.state === 'expiring';
}

/**
 * Everyone who checked in on `today` with no running plan or with money owed; no plan first, then
 * the biggest dues, then by name. One row per member however often they came in. PURE.
 */
export function cameInWithProblem(visits: readonly Visit[], views: readonly MemberView[], today: DateISO): CameInRow[] {
  const came = new Set<string>();
  for (const v of visits) if (v.visitedOn === today) came.add(v.memberId);
  const rows: CameInRow[] = [];
  for (const view of views) {
    if (!came.has(view.member.id)) continue;
    const noPlan = !coveredToday(view);
    const dueP = view.outstandingP > 0 ? view.outstandingP : 0;
    if (noPlan || dueP > 0) rows.push({ view, noPlan, dueP });
  }
  return rows.sort(
    (a, b) =>
      Number(b.noPlan) - Number(a.noPlan) || b.dueP - a.dueP || a.view.member.fullName.localeCompare(b.view.member.fullName),
  );
}
