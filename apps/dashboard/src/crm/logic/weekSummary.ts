/**
 * Launch audit 3 Nov 2026 (owner side, revenue ideas): "Monday WhatsApp summary". On a Monday the
 * owner's Today screen offers last week's numbers as one WhatsApp message, to send to himself or a
 * partner. Nothing is sent by the panel: the owner's own WhatsApp opens with the words typed. PURE.
 */

import { addDays, dateISOFromEpoch, diffDays, formatDayShort, type DateISO } from './dates';
import { weekdayOf } from './messageWords';
import { formatINR, sumPaise } from './money';
import type { MemberView } from '../types';
import type { CrmSnapshot } from '../data/adapter';

/** Monday: the day the card shows. */
export function isMonday(day: DateISO): boolean {
  return weekdayOf(day) === 1;
}

/** Last week, Monday to Sunday, before the week `today` is in. PURE. */
export function lastWeek(today: DateISO): { from: DateISO; to: DateISO } {
  const back = (weekdayOf(today) + 6) % 7; // days since this week's Monday
  const monday = addDays(today, -back);
  return { from: addDays(monday, -7), to: addDays(monday, -1) };
}

export interface WeekNumbers {
  from: DateISO;
  to: DateISO;
  collectedP: number;
  plansSold: number;
  newMembers: number;
  checkIns: number;
  enquiries: number;
  duesP: number;
  duesPeople: number;
  endingThisWeek: number;
}

const inRange = (d: DateISO, from: DateISO, to: DateISO) => d >= from && d <= to;

/** The numbers for last week (money, plans, members, check-ins, enquiries) and the dues today. PURE. */
export function weekNumbers(
  s: Pick<CrmSnapshot, 'payments' | 'memberships' | 'members' | 'visits' | 'enquiries'>,
  allViews: readonly MemberView[],
  today: DateISO,
): WeekNumbers {
  const { from, to } = lastWeek(today);
  const dues = allViews.filter((v) => v.outstandingP > 0);
  return {
    from,
    to,
    collectedP: sumPaise(s.payments.filter((p) => !p.voided && inRange(p.paidOn, from, to)).map((p) => p.amountP)),
    plansSold: s.memberships.filter((m) => !m.cancelled && !m.importId && m.createdAt > 0 && inRange(dateISOFromEpoch(m.createdAt), from, to)).length,
    newMembers: s.members.filter((m) => m.joinedOn && inRange(m.joinedOn, from, to)).length,
    checkIns: s.visits.filter((v) => inRange(v.visitedOn, from, to)).length,
    enquiries: (s.enquiries ?? []).filter((e) => e.createdAt > 0 && inRange(dateISOFromEpoch(e.createdAt), from, to)).length,
    duesP: sumPaise(dues.map((v) => v.outstandingP)),
    duesPeople: dues.length,
    endingThisWeek: allViews.filter(
      (v) => !v.member.archived && v.coversUntil !== null && diffDays(today, v.coversUntil) >= 0 && diffDays(today, v.coversUntil) <= 6,
    ).length,
  };
}

/** The message, one number a line, in plain words. PURE. */
export function weekSummaryText(gymName: string, n: WeekNumbers): string {
  const name = gymName.trim() && gymName.trim().toLowerCase() !== 'my gym' ? gymName.trim() : 'My gym';
  const people = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return [
    `${name}: last week (${formatDayShort(n.from)} to ${formatDayShort(n.to)})`,
    `Money collected: ${formatINR(n.collectedP)}`,
    `Plans sold: ${n.plansSold}`,
    `New members: ${n.newMembers}`,
    `Check-ins: ${n.checkIns}`,
    `New enquiries: ${n.enquiries}`,
    n.duesP > 0 ? `Fees still due today: ${formatINR(n.duesP)} from ${people(n.duesPeople, 'member', 'members')}` : 'Fees still due today: none',
    `Plans ending this week: ${n.endingThisWeek}`,
    '– from MettleUp',
  ].join('\n');
}
