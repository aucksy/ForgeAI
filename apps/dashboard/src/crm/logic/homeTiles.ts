/**
 * The home screen's tiles in the shape Jaipur owners already know (Gym Panel step 3, 15 Oct 2026;
 * Audit/crm-research/RESEARCH.md §4.1): today's collection first, active members (a live plan), the expiry buckets
 * (ending today, in 1-3, 4-7 and 8-15 days), expired, fees due, birthdays today and who came in
 * today. Every tile opens its list: the roster filtered by the same rule (`/members/f/<id>`), so the
 * number on the tile and the length of the list it opens can never disagree. PURE.
 */

import { tr } from '../i18n';
import type { DateISO } from './dates';
import type { MemberView, Payment } from '../types';

export type TileFilter =
  | 'active'
  | 'exp-today'
  | 'exp-1-3'
  | 'exp-4-7'
  | 'exp-8-15'
  | 'expired'
  | 'birthday'
  | 'visited-today';

export const TILE_FILTERS: readonly TileFilter[] = [
  'active',
  'exp-today',
  'exp-1-3',
  'exp-4-7',
  'exp-8-15',
  'expired',
  'birthday',
  'visited-today',
];

export function isTileFilter(v: string | undefined): v is TileFilter {
  return v !== undefined && (TILE_FILTERS as readonly string[]).includes(v);
}

/** Their plan ends between `from` and `to` days from today (0 = today is the last day). */
function endsWithin(v: MemberView, from: number, to: number): boolean {
  if (v.coversUntil === null || v.daysRemaining === null) return false;
  return v.daysRemaining >= from && v.daysRemaining <= to;
}

/**
 * Born on today's day and month. A 29 February birthday is wished on 28 February in a year with no
 * 29th, so it is never skipped.
 */
export function isBirthdayToday(dateOfBirth: string | null, today: DateISO): boolean {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  const md = dateOfBirth.slice(5);
  const todayMd = today.slice(5);
  if (md === todayMd) return true;
  if (md === '02-29' && todayMd === '02-28') {
    const y = Number(today.slice(0, 4));
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return !leap;
  }
  return false;
}

export function inTile(v: MemberView, id: TileFilter, today: DateISO): boolean {
  switch (id) {
    case 'active':
      // A live plan today: running, or running and about to end.
      return v.state === 'active' || v.state === 'expiring';
    case 'exp-today':
      return endsWithin(v, 0, 0);
    case 'exp-1-3':
      return endsWithin(v, 1, 3);
    case 'exp-4-7':
      return endsWithin(v, 4, 7);
    case 'exp-8-15':
      return endsWithin(v, 8, 15);
    case 'expired':
      return v.state === 'expired';
    case 'birthday':
      return isBirthdayToday(v.member.dateOfBirth, today);
    case 'visited-today':
      return v.lastVisitOn === today;
  }
}

export function tileCounts(views: readonly MemberView[], today: DateISO): Record<TileFilter, number> {
  const out = Object.fromEntries(TILE_FILTERS.map((id) => [id, 0])) as Record<TileFilter, number>;
  for (const v of views) {
    for (const id of TILE_FILTERS) if (inTile(v, id, today)) out[id] += 1;
  }
  return out;
}

/** Money taken on `day` (voided receipts do not count). */
export function collectedOn(payments: readonly Payment[], day: DateISO): number {
  let total = 0;
  for (const p of payments) if (!p.voided && p.paidOn === day) total += p.amountP;
  return total;
}

/** The tile's words, for the chip that shows which list is open. */
export function tileLabel(id: TileFilter): string {
  switch (id) {
    case 'active':
      return tr('Active members', 'Chalu members');
    case 'exp-today':
      return tr('Ending today', 'Aaj khatam');
    case 'exp-1-3':
      return tr('Ending in 1-3 days', '1-3 din mein khatam');
    case 'exp-4-7':
      return tr('Ending in 4-7 days', '4-7 din mein khatam');
    case 'exp-8-15':
      return tr('Ending in 8-15 days', '8-15 din mein khatam');
    case 'expired':
      return tr('Expired', 'Khatam ho gaye');
    case 'birthday':
      return tr('Birthdays today', 'Aaj birthday');
    case 'visited-today':
      return tr('Came in today', 'Aaj aaye');
  }
}
