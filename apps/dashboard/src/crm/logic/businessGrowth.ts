/**
 * "Your growth" (owner, 30 Oct 2026): is the gym growing since it started using MettleUp? PURE.
 *
 * Month by month, six numbers, each read from the rows the admin app already holds (no server or
 * database change):
 *  - Money collected      receipts by their date; cancelled (voided) receipts never count
 *                         (the Money screen's collectionSummary rule)
 *  - Active members       members with a running plan on the month's last day (today for this month)
 *  - New members          members whose join date falls in the month
 *  - Renewal rate         of the members whose plan ended in the month, the share who started a new
 *                         plan within RENEW_GRACE_DAYS of the old one's last day
 *  - Members lost         members whose plan ended in the month and who did not renew in that time
 *  - Visits per member    check-ins in the month / active members on its last day (an imported
 *                         paper-register row with no real time still counts on its day)
 *
 * A "plan" here is a gym plan (pt.gymTerms: a PT pack never decides gym status), not cancelled, and
 * at least MIN_TERM_DAYS long (a day pass is a visit, not a member). Archived members STAY in the
 * history on purpose: they were members then, and dropping them would make the past look smaller
 * than it was, which would flatter the growth.
 *
 * THE START. The day the gym started on MettleUp: the gym's creation day, or the first record
 * typed into the app if that came earlier (a gym moved from one browser to the cloud keeps its
 * records' dates). Imported records (`importId`) never move the start: they are the old history.
 *
 * BEFORE AND SINCE. A month is "before" when it ended before the start, "since" when it began on or
 * after it; the month the gym started in is neither (it is half and half). "Before" is the monthly
 * average of up to BEFORE_MONTHS months before the start that have real history in them (a plan
 * ended in the month): a roster typed in on day one has only today's members and would make the
 * past look empty. Fewer than MIN_BEFORE_MONTHS such months = no before/since comparison at all;
 * the page then compares the gym's first months on MettleUp with its latest instead, and says so.
 * "Since" is the average of the finished months after the start (the latest SINCE_MONTHS of them).
 * Renewals and members lost use only months whose grace window is over, so a month still waiting
 * for late renewals never makes "lost" look smaller than it will be.
 */

import type { Member, Membership, Payment, Visit } from '../types';
import { paymentsInRange } from './collections';
import { addDays, addMonths, dateISOFromEpoch, diffDays, endOfMonth, formatDay, isValidDateISO, partsOf, startOfMonth, type DateISO } from './dates';
import { formatINR, paiseToRupees, sumPaise, type Paise } from './money';
import { gymTerms } from './pt';
import type { CsvValue } from './csv';

/** A plan that ends and is followed by a new one within these days counts as renewed. */
export const RENEW_GRACE_DAYS = 15;
/** The months drawn on the charts. */
export const CHART_MONTHS = 12;
/** The months before the start that "Before MettleUp" averages, at most. */
export const BEFORE_MONTHS = 6;
/** Below this many months of history before the start, there is no before/since comparison. */
export const MIN_BEFORE_MONTHS = 2;
/** The latest finished months after the start that "Since MettleUp" averages, at most. */
export const SINCE_MONTHS = 12;
/** Shorter plans (day passes, a 3-day trial) are visits, not memberships. */
export const MIN_TERM_DAYS = 7;
/** "First months vs latest months" compares this many months on each side, at most. */
export const FIRST_LATEST_MONTHS = 3;

export type GrowthMetric = 'money' | 'active' | 'joined' | 'renewal' | 'lost' | 'visits';

/** Their order on the page: money first, then the members, then how often they come. */
export const GROWTH_METRICS: readonly GrowthMetric[] = ['money', 'active', 'joined', 'renewal', 'lost', 'visits'];

/** For every number a rise is good, except members lost. */
export function higherIsBetter(metric: GrowthMetric): boolean {
  return metric !== 'lost';
}

export type MonthPhase = 'before' | 'start' | 'since';

export interface MonthRow {
  /** 'YYYY-MM'. */
  month: string;
  from: DateISO;
  /** The month's last day, or today for the month we are in. */
  to: DateISO;
  /** The month is over (it ended before today). */
  complete: boolean;
  /** Every plan that ended in the month is past its grace window: its renewals are known. */
  settled: boolean;
  phase: MonthPhase;
  moneyP: Paise;
  /** Members with a running plan on `to`. */
  active: number;
  joined: number;
  /** Members whose plan ended in the month, by what happened next. */
  renewed: number;
  lost: number;
  /** Ended inside the last RENEW_GRACE_DAYS: may still renew. */
  waiting: number;
  /** renewed / (renewed + lost), 0..1; null when no plan ended (or none is decided yet). */
  renewalRate: number | null;
  visits: number;
  /** visits / active; null when no check-in was recorded in the month (or nobody was active). */
  visitsPerMember: number | null;
  /** A month before the start with real history in it (a plan ended in it). */
  onRecord: boolean;
}

export interface GrowthSnapshot {
  gym: { createdAt: number };
  members: readonly Member[];
  memberships: readonly Membership[];
  payments: readonly Payment[];
  visits: readonly Visit[];
}

// ---------------------------------------------------------------- the start

/**
 * The day the gym started on MettleUp: the gym's creation day, or the first record typed into the
 * app (member, plan sold, receipt) if that came earlier. Imported records never count. With no
 * date at all (should not happen), today.
 */
export function mettleUpStart(s: GrowthSnapshot, today: DateISO): DateISO {
  let start: DateISO | null = null;
  const consider = (at: number | undefined | null) => {
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return;
    const day = dateISOFromEpoch(at);
    if (!isValidDateISO(day)) return;
    if (start === null || day < start) start = day;
  };
  consider(s.gym.createdAt);
  for (const m of s.members) if (!m.importId) consider(m.createdAt);
  for (const m of s.memberships) if (!m.importId) consider(m.createdAt);
  for (const p of s.payments) if (!p.importId) consider(p.createdAt);
  const found = start as DateISO | null;
  return found !== null && found <= today ? found : today;
}

// ---------------------------------------------------------------- months

/** 'YYYY-MM' of a day. */
export function monthOf(day: DateISO): string {
  return day.slice(0, 7);
}

/** 'Jun 2026'. */
export function monthLabel(month: string): string {
  return formatDay(`${month}-01`).replace(/^1 /, '');
}

/** 'Jun'. */
export function monthShort(month: string): string {
  return monthLabel(month).slice(0, 3);
}

/** 'June 2026', for sentences. */
export function monthLong(month: string): string {
  const { year, month: m } = partsOf(`${month}-01`);
  return `${LONG_MONTHS[m - 1]} ${year}`;
}

const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The months from `first` to `last` ('YYYY-MM'), oldest first. */
export function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let day = `${first}-01`;
  const end = `${last}-01`;
  for (let guard = 0; day <= end && guard < 600; guard += 1) {
    out.push(monthOf(day));
    day = addMonths(day, 1);
  }
  return out;
}

/** The earliest day anything happened at the gym (a join, a plan, a receipt, a check-in); null = nothing. */
export function firstActivityDay(s: GrowthSnapshot): DateISO | null {
  let first: DateISO | null = null;
  const consider = (d: DateISO | undefined | null) => {
    if (d && isValidDateISO(d) && (first === null || d < first)) first = d;
  };
  for (const m of s.members) consider(m.joinedOn);
  for (const m of s.memberships) if (!m.cancelled) consider(m.startsOn);
  for (const p of s.payments) if (!p.voided) consider(p.paidOn);
  for (const v of s.visits) consider(v.visitedOn);
  return first;
}

// ---------------------------------------------------------------- the plans that count

interface Term {
  startsOn: DateISO;
  endsOn: DateISO;
}

/** Each member's plans that count: gym plans, not cancelled, at least MIN_TERM_DAYS long. */
export function countedTerms(memberships: readonly Membership[]): Map<string, Term[]> {
  const byMember = new Map<string, Membership[]>();
  for (const m of memberships) {
    const list = byMember.get(m.memberId);
    if (list) list.push(m);
    else byMember.set(m.memberId, [m]);
  }
  const out = new Map<string, Term[]>();
  for (const [id, list] of byMember) {
    const terms = gymTerms(list)
      .filter((m) => !m.cancelled && isValidDateISO(m.startsOn) && isValidDateISO(m.endsOn))
      .filter((m) => diffDays(m.startsOn, m.endsOn) + 1 >= MIN_TERM_DAYS)
      .map((m) => ({ startsOn: m.startsOn, endsOn: m.endsOn }));
    if (terms.length > 0) out.set(id, terms);
  }
  return out;
}

/** Members with a plan running on `day`. */
export function activeOn(terms: ReadonlyMap<string, readonly Term[]>, day: DateISO): number {
  let n = 0;
  for (const list of terms.values()) if (list.some((t) => t.startsOn <= day && t.endsOn >= day)) n += 1;
  return n;
}

export type EndOutcome = 'renewed' | 'lost' | 'waiting';

/**
 * What happened after a plan's last day: renewed (another plan that runs past it starts no later
 * than RENEW_GRACE_DAYS after it, an early renewal included), lost (the grace window is over and
 * none did), or waiting (still inside the window).
 */
export function endOutcome(t: Term, others: readonly Term[], today: DateISO): EndOutcome {
  const latestStart = addDays(t.endsOn, RENEW_GRACE_DAYS);
  if (others.some((o) => o !== t && o.endsOn > t.endsOn && o.startsOn <= latestStart)) return 'renewed';
  return latestStart < today ? 'lost' : 'waiting';
}

/**
 * The members whose plan ended between `from` and `to` (and before today: a plan on its last day
 * has not ended), each counted once by their LATEST plan to end in those days.
 */
export function endingsIn(terms: ReadonlyMap<string, readonly Term[]>, from: DateISO, to: DateISO, today: DateISO): Record<EndOutcome, number> {
  const out: Record<EndOutcome, number> = { renewed: 0, lost: 0, waiting: 0 };
  for (const list of terms.values()) {
    let last: Term | null = null;
    for (const t of list) if (t.endsOn >= from && t.endsOn <= to && t.endsOn < today && (last === null || t.endsOn > last.endsOn)) last = t;
    if (last) out[endOutcome(last, list, today)] += 1;
  }
  return out;
}

// ---------------------------------------------------------------- the table

/** One month's row. `terms` from countedTerms (worked out once for every month). */
export function monthRow(s: GrowthSnapshot, terms: ReadonlyMap<string, readonly Term[]>, month: string, start: DateISO, today: DateISO): MonthRow {
  const from = `${month}-01`;
  const last = endOfMonth(from);
  const to = last < today ? last : today;
  const complete = last < today;
  const phase: MonthPhase = last < start ? 'before' : from >= start ? 'since' : 'start';
  const ends = endingsIn(terms, from, last, today);
  const decided = ends.renewed + ends.lost;
  const active = activeOn(terms, to);
  const visits = s.visits.filter((v) => v.visitedOn >= from && v.visitedOn <= to).length;
  return {
    month,
    from,
    to,
    complete,
    settled: complete && addDays(last, RENEW_GRACE_DAYS) < today,
    phase,
    // paymentsInRange keeps voided rows (collectionSummary drops them itself), so they are dropped here.
    moneyP: sumPaise(paymentsInRange(s.payments, { from, to }).filter((p) => !p.voided).map((p) => p.amountP)),
    active,
    joined: s.members.filter((m) => m.joinedOn >= from && m.joinedOn <= to).length,
    renewed: ends.renewed,
    lost: ends.lost,
    waiting: ends.waiting,
    renewalRate: decided > 0 ? ends.renewed / decided : null,
    visits,
    visitsPerMember: visits > 0 && active > 0 ? visits / active : null,
    onRecord: phase === 'before' && decided > 0,
  };
}

// ---------------------------------------------------------------- comparing

export type CompareMode = 'mettleup' | 'firstLatest' | 'none';

export interface MetricCompare {
  metric: GrowthMetric;
  /** The two averages (money in paise; renewal rate 0..1; the rest per month). null = no data. */
  before: number | null;
  after: number | null;
  /** How many months each side averages. */
  beforeMonths: number;
  afterMonths: number;
  /**
   * The change: for the renewal rate the difference in percentage points (61% -> 74% = 13), for the
   * rest the change in per cent of `before`. null when either side is missing or `before` is 0.
   */
  change: number | null;
  /** True when the change is good news (green), false when bad, null when there is none. */
  better: boolean | null;
}

export interface GrowthReport {
  start: DateISO;
  startMonth: string;
  mode: CompareMode;
  /** Every month worked out (the before months and the chart months), oldest first. */
  rows: MonthRow[];
  /** The months the charts draw: the latest CHART_MONTHS, fewer for a young gym. */
  chartRows: MonthRow[];
  compare: Record<GrowthMetric, MetricCompare>;
  /** Months of history before the start (on record) used for "Before MettleUp". */
  beforeMonthsOnRecord: number;
  /** Finished months since the start. */
  sinceMonthsDone: number;
  /** For 'firstLatest': the months each side covers ('YYYY-MM'). */
  firstMonths: string[];
  latestMonths: string[];
}

/** The figure a month gives for a number, or null when it has none. */
export function metricValue(row: MonthRow, metric: GrowthMetric): number | null {
  switch (metric) {
    case 'money':
      return row.moneyP;
    case 'active':
      return row.active;
    case 'joined':
      return row.joined;
    case 'renewal':
      return row.renewalRate;
    case 'lost':
      return row.lost;
    case 'visits':
      return row.visitsPerMember;
  }
}

/**
 * The figure the charts and tables draw: a month whose renewals are not known yet (its grace window
 * is not over) shows no renewal rate and no members lost, never a "100%" made of the few decided so far.
 */
export function shownValue(row: MonthRow, metric: GrowthMetric): number | null {
  if ((metric === 'renewal' || metric === 'lost') && !row.settled) return null;
  return metricValue(row, metric);
}

/** Renewals and members lost are known only once the grace window is over. */
function usable(row: MonthRow, metric: GrowthMetric): boolean {
  return metric === 'renewal' || metric === 'lost' ? row.settled : row.complete;
}

/**
 * One side's average over some months: the monthly mean; for the renewal rate the members renewed
 * over all the members whose plan ended (so a month with 2 endings does not weigh as much as one
 * with 40). null when no month has a figure.
 */
export function averageOf(rows: readonly MonthRow[], metric: GrowthMetric): { value: number | null; months: number } {
  if (metric === 'renewal') {
    const renewed = rows.reduce((n, r) => n + r.renewed, 0);
    const decided = rows.reduce((n, r) => n + r.renewed + r.lost, 0);
    return { value: decided > 0 ? renewed / decided : null, months: rows.filter((r) => r.renewed + r.lost > 0).length };
  }
  const values = rows.map((r) => metricValue(r, metric)).filter((v): v is number => v !== null);
  if (values.length === 0) return { value: null, months: 0 };
  return { value: values.reduce((a, b) => a + b, 0) / values.length, months: values.length };
}

export function compareOf(metric: GrowthMetric, before: { value: number | null; months: number }, after: { value: number | null; months: number }): MetricCompare {
  const b = before.value;
  const a = after.value;
  let change: number | null = null;
  if (a !== null && b !== null) {
    if (metric === 'renewal') change = Math.round((a - b) * 100);
    else if (b > 0) change = Math.round(((a - b) / b) * 100);
  }
  let better: boolean | null = null;
  if (a !== null && b !== null && change !== null && change !== 0) better = higherIsBetter(metric) ? a > b : a < b;
  return { metric, before: b, after: a, beforeMonths: before.months, afterMonths: after.months, change, better };
}

/** Everything the page shows, worked out in one go. */
export function growthReport(s: GrowthSnapshot, today: DateISO): GrowthReport {
  const start = mettleUpStart(s, today);
  const startMonth = monthOf(start);
  const nowMonth = monthOf(today);
  const firstData = firstActivityDay(s);
  const chartFirst = monthOf(addMonths(startOfMonth(today), -(CHART_MONTHS - 1)));
  const beforeFirst = monthOf(addMonths(`${startMonth}-01`, -BEFORE_MONTHS));
  // From the earliest month anything is on record, but never further back than both windows need.
  const wanted = beforeFirst < chartFirst ? beforeFirst : chartFirst;
  const dataFirst = firstData ? monthOf(firstData) : nowMonth;
  const first = dataFirst > wanted ? dataFirst : wanted;

  const terms = countedTerms(s.memberships);
  const rows = monthsBetween(first <= nowMonth ? first : nowMonth, nowMonth).map((m) => monthRow(s, terms, m, start, today));
  const chartRows = rows.filter((r) => r.month >= chartFirst);

  const beforeRows = rows.filter((r) => r.phase === 'before' && r.month >= beforeFirst && r.onRecord);
  const sinceAll = rows.filter((r) => r.phase === 'since');
  const sinceDone = sinceAll.filter((r) => r.complete);

  const compare = {} as Record<GrowthMetric, MetricCompare>;
  let mode: CompareMode;
  let firstMonths: string[] = [];
  let latestMonths: string[] = [];

  if (beforeRows.length >= MIN_BEFORE_MONTHS && sinceDone.length >= 1) {
    mode = 'mettleup';
    for (const metric of GROWTH_METRICS) {
      const since = sinceAll.filter((r) => usable(r, metric)).slice(-SINCE_MONTHS);
      compare[metric] = compareOf(metric, averageOf(beforeRows, metric), averageOf(since, metric));
    }
  } else {
    // Not enough history before the start: the first finished months on MettleUp against the latest.
    // The month the gym started in is half a month, so it is left out like it is above.
    mode = 'none';
    for (const metric of GROWTH_METRICS) {
      const months = sinceAll.filter((r) => usable(r, metric));
      const n = Math.min(FIRST_LATEST_MONTHS, Math.floor(months.length / 2));
      if (n < 1) {
        compare[metric] = compareOf(metric, { value: null, months: 0 }, { value: null, months: 0 });
        continue;
      }
      mode = 'firstLatest';
      const early = months.slice(0, n);
      const late = months.slice(-n);
      if (metric === 'money') {
        firstMonths = early.map((r) => r.month);
        latestMonths = late.map((r) => r.month);
      }
      compare[metric] = compareOf(metric, averageOf(early, metric), averageOf(late, metric));
    }
  }

  return {
    start,
    startMonth,
    mode,
    rows,
    chartRows,
    compare,
    beforeMonthsOnRecord: beforeRows.length,
    sinceMonthsDone: sinceDone.length,
    firstMonths,
    latestMonths,
  };
}

// ---------------------------------------------------------------- words

export function metricLabel(metric: GrowthMetric): string {
  switch (metric) {
    case 'money':
      return 'Money collected';
    case 'active':
      return 'Active members';
    case 'joined':
      return 'New members';
    case 'renewal':
      return 'Renewal rate';
    case 'lost':
      return 'Members lost';
    case 'visits':
      return 'Visits per member';
  }
}

/** One plain line under each number's name: what it counts. */
export function metricHint(metric: GrowthMetric): string {
  switch (metric) {
    case 'money':
      return 'Fees received in the month. Cancelled receipts are not counted.';
    case 'active':
      return 'Members with a running plan on the last day of the month.';
    case 'joined':
      return 'Members who joined in the month.';
    case 'renewal':
      return `Of the members whose plan ended in the month, how many took a new plan within ${RENEW_GRACE_DAYS} days.`;
    case 'lost':
      return `Members whose plan ended in the month and who did not renew within ${RENEW_GRACE_DAYS} days.`;
    case 'visits':
      return 'How often members come: check-ins in the month, divided by the active members.';
  }
}

/** A figure as the page shows it: ₹ for money, % for the renewal rate, one decimal for visits. */
export function formatMetric(metric: GrowthMetric, v: number | null): string {
  if (v === null) return '–';
  switch (metric) {
    case 'money':
      // Whole rupees: an average of ₹66,801.67 a month reads like an invoice, not a gym's takings.
      return formatINR(Math.round(v / 100) * 100);
    case 'active':
      // A head count, so a whole number (the summary says "49 to 71" too).
      return String(Math.round(v));
    case 'renewal':
      return `${Math.round(v * 100)}%`;
    case 'visits':
      return (Math.round(v * 10) / 10).toFixed(1);
    default:
      return String(Math.round(v * 10) / 10).replace(/\.0$/, '');
  }
}

/** The change as a chip says it: "18%", "13 points", or null when there is none to show. */
export function changeWords(c: MetricCompare): string | null {
  if (c.change === null) return null;
  if (c.change === 0) return 'No change';
  const n = Math.abs(c.change);
  return c.metric === 'renewal' ? `${n} ${n === 1 ? 'point' : 'points'}` : `${n}%`;
}

/**
 * The summary in plain words, one line per number that has a real comparison: money, active
 * members, renewals, visits. Never a line without both sides.
 */
export function summaryLines(r: GrowthReport): string[] {
  const lines: string[] = [];
  const c = r.compare;
  const dir = (a: number, b: number) => (a > b ? 'up' : 'down');
  const money = c.money;
  if (money.change !== null && money.after !== null && money.before !== null) {
    lines.push(money.change === 0 ? 'Money collected: about the same each month' : `Money collected: ${dir(money.after, money.before)} ${Math.abs(money.change)}% a month`);
  }
  const active = c.active;
  if (active.after !== null && active.before !== null && active.before > 0) {
    const d = Math.round(active.after) - Math.round(active.before);
    lines.push(d === 0 ? 'Active members: about the same' : `Active members: ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} (${Math.round(active.before)} to ${Math.round(active.after)})`);
  }
  const renewal = c.renewal;
  if (renewal.after !== null && renewal.before !== null) {
    const b = Math.round(renewal.before * 100);
    const a = Math.round(renewal.after * 100);
    lines.push(a === b ? `Renewals: the same, ${a}%` : `Renewals: ${a > b ? 'up' : 'down'} from ${b}% to ${a}%`);
  }
  const visits = c.visits;
  if (visits.after !== null && visits.before !== null && visits.change !== null) {
    const b = formatMetric('visits', visits.before);
    const a = formatMetric('visits', visits.after);
    lines.push(a === b ? `Visits per member: the same, ${a} a month` : `Visits per member: ${dir(visits.after, visits.before)} from ${b} to ${a} a month`);
  }
  return lines;
}

/** The summary's first line: what is compared with what. */
export function summaryLead(r: GrowthReport): string {
  if (r.mode === 'mettleup') return `Since you started MettleUp in ${monthLong(r.startMonth)}, compared with the months before:`;
  if (r.mode === 'firstLatest') {
    const n = r.latestMonths.length;
    return n === 1
      ? 'Your latest month on MettleUp, compared with your first month:'
      : `Your latest ${n} months on MettleUp, compared with your first ${n} months:`;
  }
  return `You started MettleUp in ${monthLong(r.startMonth)}.`;
}

/** The two sides' names on each number. */
export function sideNames(mode: CompareMode): { before: string; after: string } {
  return mode === 'firstLatest' ? { before: 'First months', after: 'Latest months' } : { before: 'Before MettleUp', after: 'Since MettleUp' };
}

/** When nothing can be compared yet: when it can. */
export function notYetWords(r: GrowthReport, today: DateISO): string {
  // Two finished months after the start month are needed (first vs latest).
  const ready = endOfMonth(addMonths(`${r.startMonth}-01`, 2));
  return ready >= today
    ? `Your first comparison shows after ${formatDay(addDays(ready, 1))}, once you have 2 full months on MettleUp.`
    : 'Your first comparison shows once you have 2 full months on MettleUp.';
}

// ---------------------------------------------------------------- the Excel file

export const GROWTH_CSV_HEADERS = [
  'Month',
  'Part',
  'Month finished',
  'Money collected (INR)',
  'Active members at month end',
  'New members',
  'Plans ended',
  'Renewed',
  'Members lost',
  `Still within ${RENEW_GRACE_DAYS} days`,
  'Renewal rate (%)',
  'Check-ins',
  'Visits per member',
] as const;

export function phaseWords(phase: MonthPhase): string {
  return phase === 'before' ? 'Before MettleUp' : phase === 'start' ? 'Started MettleUp' : 'Since MettleUp';
}

/** Every month worked out, oldest first, the same figures the page shows. */
export function growthCsvRows(r: GrowthReport): CsvValue[][] {
  return r.rows.map((row) => [
    monthLabel(row.month),
    phaseWords(row.phase),
    row.complete ? 'Yes' : 'No, so far',
    paiseToRupees(row.moneyP),
    row.active,
    row.joined,
    row.renewed + row.lost + row.waiting,
    row.renewed,
    row.lost,
    row.waiting,
    row.renewalRate === null ? '' : Math.round(row.renewalRate * 100),
    row.visits,
    row.visitsPerMember === null ? '' : Math.round(row.visitsPerMember * 10) / 10,
  ]);
}
