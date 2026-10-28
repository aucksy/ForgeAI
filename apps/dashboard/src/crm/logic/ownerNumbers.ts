/**
 * Numbers for the gym owner (backlog "Numbers for the gym owner (analytics)", R-150 / R-168). PURE.
 *
 * Five tiles on Today, each with a small trend line, each opening the list behind it:
 *  - Renewals due    members whose plan runs out inside the window and is not renewed back-to-back
 *  - Money owed      what members still owe the gym (OWNER ONLY: a money total, permissions.ts)
 *  - Stopped coming  members with a running plan who stopped visiting (the Visits "Losing the habit" rule)
 *  - New members     members who joined inside the range
 *  - Busy hours      check-ins by hour of the day (attendance.hourHistogram, so a register row imported
 *                    with no real time never votes for 5 am)
 *
 * Every number reuses the rule the rest of the panel already uses, so a tile can never disagree with
 * the screen it sits beside: the dues ledger (collections.ts), the at-risk list (attendance.ts), the
 * coverage chain (membership.ts) and gym terms only (pt.ts: a PT pack never decides gym status).
 * Nothing here writes anything or needs a server change: it reads the rows the panel already holds.
 *
 * THE RANGE. One picker for the whole section: 7, 30 or 90 days, or two dates. The look-back tiles
 * (owed, stopped coming, new, busy) read the days up to today. Renewals are about what is COMING, so a
 * preset looks AHEAD the same number of days (today to today + n, the same 0..7 days the "Ending in"
 * tiles use for a week). Two picked dates are read exactly as picked, by every tile.
 *
 * THE TREND LINE. Up to 31 days: one point a day. Longer: a point a week (a month over half a year),
 * so a 90-day line stays a line and not a comb. For a count of things that HAPPENED (new members,
 * renewals falling due) a point is the count in its days; for a figure that STANDS on a day (money
 * owed, members away) a point is that figure on the last day of its days, read from the records as
 * they are today (a payment taken late is counted on the day it was dated).
 */

import type { Member, Membership, MemberState, Payment, Visit } from '../types';
import { atRiskList, hourHistogram, isRegisterInUse, type AtRiskRow } from './attendance';
import { duesByMember, duesLedger, type MemberDueRow } from './collections';
import { addDays, dateISOFromEpoch, diffDays, formatDay, formatDayShort, isValidDateISO, type DateISO } from './dates';
import { sumPaise, type Paise } from './money';
import { gymTerms } from './pt';

// ---------------------------------------------------------------- the tiles

export type NumberId = 'renewals' | 'owed' | 'stopped' | 'new' | 'busy';

/** Their order on the screen: money back first (renewals, owed), then the people, then the hours. */
export const NUMBER_IDS: readonly NumberId[] = ['renewals', 'owed', 'stopped', 'new', 'busy'];

export function isNumberId(v: string | undefined): v is NumberId {
  return v !== undefined && (NUMBER_IDS as readonly string[]).includes(v);
}

/** Money totals are the owner's (permissions.ts `seeTotals`): the front desk never sees this tile. */
export function isMoneyNumber(id: NumberId): boolean {
  return id === 'owed';
}

/** The tiles this person may see, in screen order. */
export function numbersFor(seeTotals: boolean): NumberId[] {
  return NUMBER_IDS.filter((id) => seeTotals || !isMoneyNumber(id));
}

export function numberLabel(id: NumberId): string {
  switch (id) {
    case 'renewals':
      return 'Renewals due';
    case 'owed':
      return 'Money owed';
    case 'stopped':
      return 'Stopped coming';
    case 'new':
      return 'New members';
    case 'busy':
      return 'Busy hours';
  }
}

// ---------------------------------------------------------------- the range

export type RangePreset = '7' | '30' | '90';
export const RANGE_PRESET_IDS: readonly RangePreset[] = ['7', '30', '90'];

/** The picker's value: a preset length, or two dates read exactly as picked. */
export type NumbersRange = { kind: RangePreset } | { kind: 'custom'; from: DateISO; to: DateISO };

export interface DayWindow {
  from: DateISO;
  to: DateISO;
}

export const DEFAULT_RANGE: NumbersRange = { kind: '30' };

/** The longest two-date range read (a year and a day): beyond it the lines would be all weeks of nothing. */
export const MAX_RANGE_DAYS = 366;

/**
 * A range as one address segment (`30`, or `2026-10-01_2026-10-29`), so the list a tile opens can be
 * bookmarked and the back button returns to the same range.
 */
export function rangeParam(range: NumbersRange): string {
  return range.kind === 'custom' ? `${range.from}_${range.to}` : range.kind;
}

/**
 * Read a segment back. Anything unreadable is the default (30 days), never an error page. Dates the
 * wrong way round are turned round; a span longer than a year keeps its last year.
 */
export function parseRange(param: string | undefined | null): NumbersRange {
  if (param === '7' || param === '30' || param === '90') return { kind: param };
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(param ?? '');
  if (!m || !isValidDateISO(m[1]) || !isValidDateISO(m[2])) return DEFAULT_RANGE;
  return customRange(m[1], m[2]);
}

/** Two picked dates as a range: put the right way round, and at most `MAX_RANGE_DAYS` long. */
export function customRange(a: DateISO, b: DateISO): NumbersRange {
  const from = a <= b ? a : b;
  const to = a <= b ? b : a;
  const capped = diffDays(from, to) >= MAX_RANGE_DAYS ? addDays(to, -(MAX_RANGE_DAYS - 1)) : from;
  return { kind: 'custom', from: capped, to };
}

/** The days the look-back tiles read: the last n days up to today, or the two picked dates. */
export function backWindow(range: NumbersRange, today: DateISO): DayWindow {
  if (range.kind === 'custom') return { from: range.from, to: range.to };
  return { from: addDays(today, -(Number(range.kind) - 1)), to: today };
}

/**
 * The days Renewals reads: today and the next n days (a week is 0..7 days away, like the "Ending in"
 * tiles), or the two picked dates.
 */
export function aheadWindow(range: NumbersRange, today: DateISO): DayWindow {
  if (range.kind === 'custom') return { from: range.from, to: range.to };
  return { from: today, to: addDays(today, Number(range.kind)) };
}

export function windowFor(id: NumberId, range: NumbersRange, today: DateISO): DayWindow {
  return id === 'renewals' ? aheadWindow(range, today) : backWindow(range, today);
}

/** The picker's chip words. */
export function rangeChipLabel(kind: NumbersRange['kind']): string {
  return kind === 'custom' ? 'Pick dates' : `${kind} days`;
}

/** The days a tile covers, in words: "Last 30 days", "Next 7 days", or "1 Oct – 29 Oct". */
export function windowWords(id: NumberId, range: NumbersRange, today: DateISO): string {
  if (range.kind !== 'custom') return id === 'renewals' ? `Next ${range.kind} days` : `Last ${range.kind} days`;
  const w = windowFor(id, range, today);
  if (w.from === w.to) return formatDay(w.from);
  const sameYear = w.from.slice(0, 4) === w.to.slice(0, 4);
  return `${sameYear ? formatDayShort(w.from) : formatDay(w.from)} – ${formatDay(w.to)}`;
}

// ---------------------------------------------------------------- the trend line

export interface TrendPoint {
  /** The days this point stands for, both ends included. */
  from: DateISO;
  to: DateISO;
  value: number;
}

/** How many days one point of the line covers for a window this long. */
export function stepDays(days: number): number {
  if (days <= 31) return 1;
  if (days <= 186) return 7;
  return 30;
}

/**
 * The window cut into the points' day spans, oldest first. Cut from the END, so the newest point is
 * always a whole span and a short one (if any) is the oldest, where it matters least.
 */
export function trendSpans(w: DayWindow): DayWindow[] {
  const days = diffDays(w.from, w.to) + 1;
  if (days <= 0) return [];
  const step = stepDays(days);
  const out: DayWindow[] = [];
  let to = w.to;
  while (to >= w.from) {
    const from = maxDay(w.from, addDays(to, -(step - 1)));
    out.push({ from, to });
    to = addDays(from, -1);
  }
  return out.reverse();
}

function maxDay(a: DateISO, b: DateISO): DateISO {
  return a > b ? a : b;
}

/** A count of things that happened: the days each one fell on, totalled per point. */
export function countTrend(days: readonly DateISO[], w: DayWindow): TrendPoint[] {
  return trendSpans(w).map((s) => ({ ...s, value: days.filter((d) => d >= s.from && d <= s.to).length }));
}

/** A figure that stands on a day: read on the last day of each point. */
export function standingTrend(w: DayWindow, valueOn: (day: DateISO) => number): TrendPoint[] {
  return trendSpans(w).map((s) => ({ ...s, value: valueOn(s.to) }));
}

// ---------------------------------------------------------------- renewals due

export interface RenewalRow {
  member: Member;
  /** The last day their plan covers (the end of the run of back-to-back terms). */
  endsOn: DateISO;
  planName: string;
  /** Days from today to `endsOn`: 0 = today is the last day, negative = already ended. */
  daysLeft: number;
}

/**
 * Members whose plan runs out inside the window without a renewal starting the next day. A member who
 * already renewed early is not "due" (the coverage-chain rule of membership.ts): calling someone who
 * has paid is the most annoying thing a gym can do. One row per member: if their plan ran out twice in
 * a long window, the later time is the one that counts. Archived members are left out, like the
 * roster. Soonest first.
 */
export function renewalsDue(
  members: readonly Member[],
  memberships: readonly Membership[],
  w: DayWindow,
  today: DateISO,
): RenewalRow[] {
  const byMember = groupBy(memberships, (m) => m.memberId);
  const rows: RenewalRow[] = [];
  for (const member of members) {
    if (member.archived) continue;
    const live = gymTerms(byMember.get(member.id) ?? []).filter((m) => !m.cancelled);
    let pick: Membership | null = null;
    for (const t of live) {
      if (t.endsOn < w.from || t.endsOn > w.to) continue;
      const next = addDays(t.endsOn, 1);
      const renewed = live.some((o) => o !== t && o.startsOn <= next && o.endsOn > t.endsOn);
      if (renewed) continue;
      if (pick === null || t.endsOn > pick.endsOn) pick = t;
    }
    if (pick) rows.push({ member, endsOn: pick.endsOn, planName: pick.planName, daysLeft: diffDays(today, pick.endsOn) });
  }
  return rows.sort((a, b) => (a.endsOn < b.endsOn ? -1 : a.endsOn > b.endsOn ? 1 : a.member.fullName.localeCompare(b.member.fullName)));
}

// ---------------------------------------------------------------- money owed

/** The day a term was first owed: its start, or the day it was written down if that came first. */
function owedFrom(m: Membership): DateISO {
  const recorded = m.createdAt > 0 ? dateISOFromEpoch(m.createdAt) : m.startsOn;
  return recorded < m.startsOn ? recorded : m.startsOn;
}

/**
 * Who owed the gym at the end of `day`, oldest debt first: the Money -> Dues list (duesLedger, one row
 * per member, archived members included: archiving someone does not cancel what they owe), read with
 * only the terms that existed by then and the receipts dated on or before it. On today it IS the dues
 * list, so the tile, its list and the "Fees due" tile always agree.
 */
export function owedListOn(
  members: readonly Member[],
  memberships: readonly Membership[],
  payments: readonly Payment[],
  day: DateISO,
): MemberDueRow[] {
  return duesByMember(
    duesLedger(
      members,
      memberships.filter((m) => owedFrom(m) <= day),
      payments.filter((p) => p.paidOn <= day),
      day,
    ),
  );
}

/** What members owed the gym at the end of `day` (the total of `owedListOn`). */
export function owedOn(
  members: readonly Member[],
  memberships: readonly Membership[],
  payments: readonly Payment[],
  day: DateISO,
): Paise {
  return sumPaise(owedListOn(members, memberships, payments, day).map((r) => r.totalP));
}

// ---------------------------------------------------------------- stopped coming

/**
 * Members with a running plan who have stopped coming, as of `day`: the same rule and the same list
 * as Visits -> Losing the habit (atRiskList), read with only the check-ins up to that day.
 */
export function stoppedComingOn(
  members: readonly Member[],
  memberships: readonly Membership[],
  visits: readonly Visit[],
  day: DateISO,
): AtRiskRow[] {
  return atRiskList(members, memberships, visits.filter((v) => v.visitedOn <= day), day);
}

// ---------------------------------------------------------------- new members

/** Members who joined inside the window (archived ones left out, like the roster), newest first. */
export function newMembers(members: readonly Member[], w: DayWindow): Member[] {
  return members
    .filter((m) => !m.archived && m.joinedOn >= w.from && m.joinedOn <= w.to)
    .sort((a, b) => (a.joinedOn > b.joinedOn ? -1 : a.joinedOn < b.joinedOn ? 1 : a.fullName.localeCompare(b.fullName)));
}

/** The same number of days just before the window, for "3 more than the 30 days before". */
export function previousWindow(w: DayWindow): DayWindow {
  const days = diffDays(w.from, w.to) + 1;
  return { from: addDays(w.from, -days), to: addDays(w.from, -1) };
}

// ---------------------------------------------------------------- busy hours

export interface HourRow {
  hour: number;
  visitsN: number;
  /** Check-ins in this hour on an average day of the window (days with no check-ins included). */
  perDay: number;
}

export interface BusyHours {
  /** All 24 hours, in order. */
  hours: HourRow[];
  /** The hour with the most check-ins (ties: the earlier one), or null when no check-in has a real time. */
  busiest: number | null;
  /** Check-ins with a time that can be believed (an imported paper-register row has none). */
  timedN: number;
}

export function busyHours(visits: readonly Visit[], w: DayWindow): BusyHours {
  const days = Math.max(1, diffDays(w.from, w.to) + 1);
  const hist = hourHistogram(visits.filter((v) => v.visitedOn >= w.from && v.visitedOn <= w.to));
  let busiest: number | null = null;
  for (const h of hist) if (h.countN > 0 && (busiest === null || h.countN > hist[busiest].countN)) busiest = h.hour;
  return {
    hours: hist.map((h) => ({ hour: h.hour, visitsN: h.countN, perDay: h.countN / days })),
    busiest,
    timedN: hist.reduce((n, h) => n + h.countN, 0),
  };
}

/**
 * The hours worth drawing: from the first hour anyone came to the last, at least 6am-10pm so a quiet
 * week still reads as a day. Never wraps past midnight.
 */
export function drawnHours(b: BusyHours): HourRow[] {
  const used = b.hours.filter((h) => h.visitsN > 0).map((h) => h.hour);
  const first = Math.min(6, ...used);
  const last = Math.max(21, ...used);
  return b.hours.filter((h) => h.hour >= first && h.hour <= last);
}

// ---------------------------------------------------------------- everything for the home tiles

export interface NumbersSnapshot {
  members: readonly Member[];
  memberships: readonly Membership[];
  payments: readonly Payment[];
  visits: readonly Visit[];
}

export interface TileFigures {
  renewals: { count: number; trend: TrendPoint[] };
  /** Standing on the window's last day (today for a preset); `people` = members owing then. */
  owed: { totalP: Paise; people: number; trend: TrendPoint[]; beforeP: Paise };
  stopped: { count: number; trend: TrendPoint[]; before: number; registerUsed: boolean };
  newcomers: { count: number; trend: TrendPoint[]; before: number };
  busy: BusyHours;
}

/**
 * Every tile's figure and line in one pass. `seeTotals` false skips the money maths entirely (the
 * front desk's screen never draws it). Standing figures (owed, stopped coming) are read on the
 * window's last day, which is today for a preset, so the headline is the newest point of its own
 * line. The "before" figures are each tile's own number on the day before the window (standing
 * figures) or over the same number of days just before it (counts).
 */
export function tileFigures(s: NumbersSnapshot, range: NumbersRange, today: DateISO, seeTotals: boolean): TileFigures {
  const back = backWindow(range, today);
  const ahead = aheadWindow(range, today);
  const dayBefore = addDays(back.from, -1);

  const due = renewalsDue(s.members, s.memberships, ahead, today);
  const joined = newMembers(s.members, back);

  let owed: TileFigures['owed'] = { totalP: 0, people: 0, trend: [], beforeP: 0 };
  if (seeTotals) {
    const trend = standingTrend(back, (d) => owedOn(s.members, s.memberships, s.payments, d));
    const owing = owedListOn(s.members, s.memberships, s.payments, back.to);
    owed = {
      totalP: sumPaise(owing.map((r) => r.totalP)),
      people: owing.length,
      trend,
      beforeP: owedOn(s.members, s.memberships, s.payments, dayBefore),
    };
  }

  const stoppedTrend = standingTrend(back, (d) => stoppedComingOn(s.members, s.memberships, s.visits, d).length);
  return {
    renewals: { count: due.length, trend: countTrend(due.map((r) => r.endsOn), ahead) },
    owed,
    stopped: {
      count: stoppedTrend.length > 0 ? stoppedTrend[stoppedTrend.length - 1].value : 0,
      trend: stoppedTrend,
      before: stoppedComingOn(s.members, s.memberships, s.visits, dayBefore).length,
      registerUsed: isRegisterInUse(s.visits.filter((v) => v.visitedOn <= back.to), back.to),
    },
    newcomers: {
      count: joined.length,
      trend: countTrend(joined.map((m) => m.joinedOn), back),
      before: newMembers(s.members, previousWindow(back)).length,
    },
    busy: busyHours(s.visits, back),
  };
}

// ---------------------------------------------------------------- words

/** "6–7 pm" style, from attendance.hourLabel's rule but shorter: "6 pm" when the tile is narrow. */
export function hourShort(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

/** "about 9 a day", "about 1 a day", "less than 1 a day". */
export function perDayWords(perDay: number): string {
  if (perDay <= 0) return 'none';
  if (perDay < 1) return 'less than 1 a day';
  return `about ${Math.round(perDay)} a day`;
}

/**
 * How a count moved, in words: "3 more than the 30 days before", "2 fewer than ...", "Same as ...".
 * `since` names the comparison ("the 30 days before", "on 29 Sep").
 */
export function countChangeWords(now: number, before: number, since: string): string {
  if (now === before) return `Same as ${since}`;
  const d = Math.abs(now - before);
  return `${d} ${now > before ? 'more' : 'fewer'} than ${since}`;
}

/** The state shown beside a new member: their plan today, in the roster's words. */
export function newMemberPlanWords(state: MemberState | undefined, planName: string | null): string {
  if (!state || state === 'never') return 'No plan yet';
  if (state === 'upcoming') return planName ? `${planName} · starts soon` : 'Plan starts soon';
  if (state === 'expired') return planName ? `${planName} · ended` : 'Plan ended';
  if (state === 'cancelled') return 'Plan cancelled';
  return planName ?? 'Plan running';
}

// ---------------------------------------------------------------- helpers

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}
