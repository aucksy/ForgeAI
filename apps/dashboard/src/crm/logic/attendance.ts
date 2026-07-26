/**
 * Attendance and the at-risk list — PURE.
 *
 * WHY THIS IS THE PHASE THAT MATTERS. Days-without-attendance is the only churn
 * signal with peer-reviewed, multi-country support: it carries 35–54% of the
 * feature importance in a deployed dropout model over 5,209 members (AUC 0.86),
 * ahead of membership duration and amount billed. Everything else the category
 * sells — satisfaction scores, engagement points — has no comparable evidence.
 * (`docs/overhaul/research/R1-findings.txt`, findings 116/164/166/167.)
 *
 * THE MEASUREMENT IS PERSONAL, NOT GLOBAL. A single "14 days" rule is wrong in both
 * directions at once: a member who trains four times a week and has not come for
 * eight days has already broken their habit, while a Sunday-only member at eight
 * days is exactly on schedule. So absence is judged against the member's OWN rhythm
 * over the trailing window, and a fixed threshold is only the fallback for someone
 * with too little history to have a rhythm yet.
 *
 * THE RULE THAT SHAPES THE COPY, NOT JUST THE MATHS. In a randomised field
 * experiment, customers proactively contacted with a retention offer churned at 10%
 * against 6% for untouched controls — naive at-risk outreach can make things worse,
 * because risk and responsiveness are different things (R1 finding 173). The design
 * rule recorded there is: never contact an at-risk member about their membership or
 * their renewal; talk to them about their training. Nothing this file produces
 * mentions money, expiry or renewal, and `riskReason` is written to be read aloud.
 *
 * WHO IS DELIBERATELY NOT HERE:
 *  - Anyone whose membership does not cover today. They are a RENEWAL conversation
 *    and already sit on the chase list (`needsAttentionToday`); putting them on both
 *    turns two lists into one list printed twice.
 *  - Archived members. This is the opposite of the dues rule, on purpose: archiving
 *    does not forgive a debt, but you do not phone someone you have archived about
 *    their workouts.
 *  - Anyone who has not yet had a fair chance to come in (`MIN_COVERED_DAYS`).
 */

import type { Member, Membership, Visit } from '../types';
import {
  addDays,
  dateISOFromEpoch,
  diffDays,
  hourOfEpoch,
  maxDate,
  minDate,
  type DateISO,
} from './dates';
import { coverageEndsOn, EXPIRING_WINDOW_DAYS } from './membership';

// ---------------------------------------------------------------- constants

/**
 * How much recent activity the member's page shows and the weekly rate is measured
 * over. Eight weeks: long enough to contain a fortnightly member's pattern, short
 * enough that last winter is not "recent".
 */
export const RHYTHM_WINDOW_DAYS = 56;

/**
 * The rhythm is taken from a member's LAST FEW VISITS, not from a window anchored on
 * today — and that distinction is load-bearing rather than cosmetic.
 *
 * Anchoring on today destroys the baseline exactly when it is needed: a fortnightly
 * member needs four visits spanning six weeks to have a measurable rhythm, so an
 * eight-week window leaves room for at most a fortnight of absence before their
 * history falls out of it. Their rhythm would vanish on the very day they started
 * drifting, dropping them onto the generic twelve-day threshold and flagging a
 * member who was one day late. Counting backwards from their last visit instead
 * means the pattern survives the absence it is there to be judged against.
 */
export const RHYTHM_SAMPLE_VISITS = 8;

/** However regular they once were, a habit from six months ago vouches for nothing. */
export const RHYTHM_MAX_AGE_DAYS = 180;

/** Below this many visits there is no pattern, only noise. */
export const MIN_VISITS_FOR_RHYTHM = 4;

/**
 * The absence threshold for a member with no measurable rhythm. The research puts
 * the useful intervention at absence day 10–14 — before a cancellation request, not
 * after it (R1 finding 128) — so this sits in the middle of that window.
 */
export const DEFAULT_ABSENCE_DAYS = 12;

/**
 * No member is chased sooner than this however tight their rhythm is. A member who
 * trains daily has a median gap of one day; without a floor, missing a long weekend
 * would put them on the owner's call list. That is how an owner learns to ignore the
 * list.
 */
export const MIN_ABSENCE_DAYS = 10;

/** How many times their usual gap counts as having stopped rather than skipped. */
export const SLIP_MULTIPLIER = 2.5;

/**
 * FLOOR for "gone quiet": nobody is called gone-quiet before three weeks of silence,
 * however tight their rhythm. A member with a longer gap of their own needs longer
 * still — twice their gap — so a fortnightly member reaches it at seventy days.
 */
export const GONE_QUIET_DAYS = 21;

/**
 * Distinct days the register must have been used, inside the window, before the
 * at-risk list means anything at all.
 *
 * WITHOUT THIS THE FEATURE INSULTS EVERY EXISTING GYM ON ITS FIRST RUN. Until this
 * phase the only way to check anybody in was a button buried on their profile, so a
 * gym that has been running P1 and P2 has an empty `visits` table. Every member then
 * reads as "has never checked in" and the whole roster is flagged: the owner opens
 * the app to a red tile saying 79 people have stopped coming, when what actually
 * happened is that the gym has not started. No visits is an ABSENT signal, not a
 * negative one, and the screen says so instead of guessing.
 */
export const MIN_REGISTER_DAYS = 5;

/**
 * The first-month window. Dropout probability peaks inside the first three months
 * (63% of new members abandon before month 3), and members given a real onboarding
 * were 87% still active at six months against 60% without — the largest single
 * retention lever in the corpus. A new member who never starts coming is the
 * cheapest save this product can offer.
 */
export const SETTLING_IN_DAYS = 30;

/** Under four visits in month one predicts roughly 80% cancellation. */
export const SETTLING_IN_MIN_VISITS = 4;

/** Nobody is "absent" before they have had a week in which they could have come. */
export const MIN_COVERED_DAYS = 7;

/**
 * A member who trained today or yesterday is not on today's call list, whatever
 * else is true of them.
 *
 * Found by using it: a member who joined three weeks ago and had been in exactly
 * once was flagged — correctly, by the settling-in rule — on the very day that one
 * visit happened. The card read "Only 1 visit since joining 22 days ago" directly
 * above "last in: today". Both facts were right and the advice was absurd: they were
 * in the building. Absence bands cannot produce this (their thresholds are ten days
 * and up), so the guard exists for the settling-in rule, which measures a rate
 * rather than a gap. They reappear in a day or two if the visit was a one-off, which
 * is when the nudge is worth making.
 */
export const RECENT_VISIT_GRACE_DAYS = 1;

// ---------------------------------------------------------------- profile

export interface AttendanceProfile {
  /** Distinct visit days inside the rhythm window, most recent first. */
  recentDays: DateISO[];
  visitsInWindowN: number;
  /** Of those, the ones on a day a membership actually covered — what `weeklyRate` counts. */
  coveredVisitsN: number;
  totalVisitsN: number;
  lastVisitOn: DateISO | null;
  /** Whole days since the last visit; null when they have never checked in. */
  daysSinceVisit: number | null;
  /** Days inside the window on which a membership actually covered them. */
  coveredDaysN: number;
  /**
   * Median gap in days between their last several visits, or null when there are too
   * few to have a rhythm. Deliberately EXCLUDES the open absence since the last
   * visit: counting it would stretch a member's own threshold every day they stayed
   * away, so someone who stopped entirely would never cross it.
   */
  medianGapDays: number | null;
  /** Visits per week across the covered part of the window. */
  weeklyRate: number;
  /** Days since they joined the gym. */
  tenureDays: number;
  /** The hour they usually train (0–23), or null when unknown. */
  usualHour: number | null;
}

/** Distinct visit days, most recent first. A day is a day however many scans it saw. */
export function visitDays(visits: readonly Visit[]): DateISO[] {
  return [...new Set(visits.map((v) => v.visitedOn))].sort((a, b) => b.localeCompare(a));
}

/** Median of a list of numbers. Empty in, null out. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How many days inside the window a membership covered this member.
 *
 * Overlapping terms are MERGED rather than summed. An early renewal sold before the
 * old term ended produces two rows covering the same fortnight, and adding their
 * lengths would credit the member with more chances to come in than the calendar
 * contains — which makes a perfectly regular member look like they trained half as
 * often as they did.
 */
export function coveredDaysInWindow(
  memberships: readonly Membership[],
  from: DateISO,
  to: DateISO,
): number {
  // A backwards window needs no guard of its own: clipping every term to
  // [from, to] leaves start > end for all of them, and they are dropped below.
  const spans = memberships
    .filter((m) => !m.cancelled)
    .map((m) => ({ start: maxDate(m.startsOn, from), end: minDate(m.endsOn, to) }))
    .filter((s) => s.start <= s.end)
    .sort((a, b) => a.start.localeCompare(b.start));

  let count = 0;
  let coveredThrough: DateISO | null = null;
  for (const s of spans) {
    const start = coveredThrough !== null && s.start <= coveredThrough ? addDays(coveredThrough, 1) : s.start;
    if (start <= s.end) count += diffDays(start, s.end) + 1;
    if (coveredThrough === null || s.end > coveredThrough) coveredThrough = s.end;
  }
  return count;
}

/**
 * The hour a member usually trains, from their check-in timestamps.
 *
 * Timestamps that do not land on the day they are recorded against are ignored: a
 * row imported from a paper register carries `checkedInAt: 0`, which is 1 Jan 1970
 * and would otherwise vote for 5am in every histogram it appeared in.
 */
export function usualHourOf(visits: readonly Visit[]): number | null {
  const counts = new Map<number, number>();
  for (const v of visits) {
    const hour = trustedHour(v);
    if (hour === null) continue;
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let best = -1;
  let bestCount = 0;
  for (const [hour, count] of counts) {
    // Ties break to the earlier hour so the answer is stable between renders.
    if (count > bestCount || (count === bestCount && hour < best)) {
      best = hour;
      bestCount = count;
    }
  }
  return best;
}

/** The local hour of a check-in, or null when its timestamp cannot be believed. */
function trustedHour(visit: Visit): number | null {
  const hour = hourOfEpoch(visit.checkedInAt);
  if (hour === null) return null;
  return dateISOFromEpoch(visit.checkedInAt) === visit.visitedOn ? hour : null;
}

/**
 * The visits a member's habits are read from: their most recent few, ignoring
 * anything older than the cut-off. `days` must be newest-first.
 */
export function rhythmSampleDays(days: readonly DateISO[], today: DateISO): DateISO[] {
  return days
    .filter((d) => diffDays(d, today) <= RHYTHM_MAX_AGE_DAYS)
    .slice(0, RHYTHM_SAMPLE_VISITS);
}

/**
 * The median gap between a member's last several visits — their rhythm.
 *
 * `days` must be newest-first. Returns null when there are too few recent visits to
 * be a pattern rather than a coincidence.
 */
export function rhythmGap(days: readonly DateISO[], today: DateISO): number | null {
  const sample = rhythmSampleDays(days, today);
  if (sample.length < MIN_VISITS_FOR_RHYTHM) return null;

  const gaps: number[] = [];
  for (let i = 0; i < sample.length - 1; i += 1) {
    gaps.push(diffDays(sample[i + 1], sample[i]));
  }
  return median(gaps);
}

/** Is a membership covering this exact day? Cancelled terms cover nothing. */
export function isCoveredOn(memberships: readonly Membership[], day: DateISO): boolean {
  return memberships.some((m) => !m.cancelled && m.startsOn <= day && m.endsOn >= day);
}

/**
 * Has this gym actually been using the register?
 *
 * Asked of the GYM, not of the member. One member with no visits is a signal; a
 * whole gym with no visits is the absence of one, and the difference decides whether
 * the at-risk list is worth showing at all.
 */
export function isRegisterInUse(
  visits: readonly Visit[],
  today: DateISO,
  windowDays: number = RHYTHM_WINDOW_DAYS,
): boolean {
  const from = addDays(today, -(windowDays - 1));
  const days = new Set<DateISO>();
  for (const v of visits) {
    if (v.visitedOn >= from && v.visitedOn <= today) days.add(v.visitedOn);
    if (days.size >= MIN_REGISTER_DAYS) return true;
  }
  return false;
}

/** Everything the risk bands and the member's attendance strip are derived from. */
export function attendanceProfile(
  member: Member,
  memberships: readonly Membership[],
  visits: readonly Visit[],
  today: DateISO,
  windowDays: number = RHYTHM_WINDOW_DAYS,
): AttendanceProfile {
  const from = addDays(today, -(windowDays - 1));
  const inWindow = visits.filter((v) => v.visitedOn >= from && v.visitedOn <= today);
  const recentDays = visitDays(inWindow);
  const allDays = visitDays(visits);

  const coveredDaysN = coveredDaysInWindow(memberships, from, today);
  const lastVisitOn = allDays[0] ?? null;

  // Numerator and denominator both over COVERED days. Counting every visit in the
  // window against only the covered days mixes two populations: a member who kept
  // training through a lapse and then renewed six days ago scored twenty visits
  // against seven covered days and was reported as training twenty times a week,
  // directly beneath the line saying they had twenty visits in fifty-six days.
  const coveredRecentN = recentDays.filter((d) => isCoveredOn(memberships, d)).length;

  // Their usual hour comes from the SAME sample as their rhythm, not from the recent
  // window — otherwise the "usually trains at 6am" note is missing for exactly the
  // long-absent members it is most useful for.
  const sample = new Set(rhythmSampleDays(allDays, today));

  return {
    recentDays,
    visitsInWindowN: recentDays.length,
    coveredVisitsN: coveredRecentN,
    totalVisitsN: allDays.length,
    lastVisitOn,
    daysSinceVisit: lastVisitOn ? diffDays(lastVisitOn, today) : null,
    coveredDaysN,
    medianGapDays: rhythmGap(allDays, today),
    weeklyRate: coveredDaysN === 0 ? 0 : (coveredRecentN * 7) / coveredDaysN,
    tenureDays: Math.max(0, diffDays(member.joinedOn, today)),
    usualHour: usualHourOf(visits.filter((v) => sample.has(v.visitedOn))),
  };
}

// ---------------------------------------------------------------- risk

export type RiskBand = 'settling_in' | 'slipping' | 'gone_quiet' | 'ok';

export const RISK_LABEL: Record<RiskBand, string> = {
  settling_in: 'Not settled in',
  slipping: 'Slipping',
  gone_quiet: 'Gone quiet',
  // Only ever reached through `patternSummary`, which decides between this and
  // "we cannot tell" — see there for why the difference matters.
  ok: 'Training',
};

export type BandTone = 'good' | 'warn' | 'critical' | 'muted';

/**
 * ONE tone per band, for every surface. Gone-quiet was previously grey on the risk
 * screen, orange on the member's page and orange on Today — the same fact in three
 * colours, which teaches an owner that the colours mean nothing.
 */
export const BAND_TONE: Record<RiskBand, BandTone> = {
  settling_in: 'critical',
  slipping: 'warn',
  gone_quiet: 'warn',
  ok: 'good',
};

export interface PatternSummary {
  label: string;
  tone: BandTone;
}

/**
 * What a member's own page should say about their training — including "we cannot
 * tell", which is a different thing from "they are fine".
 *
 * `riskBandFor` returns `ok` for three different situations, and only one of them is
 * good news. A member who lapsed two months ago and has never once checked in came
 * back `ok` and was shown a green **Training** pill, sitting directly above the line
 * "0 visits in the last 56 days" — a label and a number contradicting each other
 * inside one card. Coverage and evidence are checked before the band is trusted.
 */
export function patternSummary(profile: AttendanceProfile, band: RiskBand): PatternSummary {
  if (profile.coveredDaysN === 0) return { label: 'No plan running', tone: 'muted' };
  if (band !== 'ok') return { label: RISK_LABEL[band], tone: BAND_TONE[band] };
  if (profile.totalVisitsN === 0) return { label: 'Never checked in', tone: 'muted' };
  return { label: RISK_LABEL.ok, tone: BAND_TONE.ok };
}

/**
 * Order by what the owner can still change, NOT by how bad the number is.
 *
 * A new member who has not formed the habit is the cheapest save in the research and
 * the window closes fastest, so they lead. Someone a few days past their own rhythm
 * is the documented day-10–14 intervention. Three silent weeks is still worth a
 * call, but it is the hardest of the three conversations, so it sorts last.
 */
const BAND_RANK: Record<RiskBand, number> = {
  settling_in: 0,
  slipping: 1,
  gone_quiet: 2,
  ok: 3,
};

/**
 * How many visits a member ought to have by this point in their first month.
 *
 * The evidence gives one number — four visits in month one — but waiting until day
 * 30 to use it wastes the whole window. Scaling it to roughly one visit a week means
 * the warning appears while there is still time to do something about it, and lands
 * exactly on the researched bar by the end of the month.
 */
export function expectedSettlingVisits(coveredDays: number): number {
  if (coveredDays < MIN_COVERED_DAYS) return 0;
  return Math.max(1, Math.min(SETTLING_IN_MIN_VISITS, Math.round(coveredDays / 7)));
}

/**
 * Days of absence that count as slipping for THIS member: two and a half times their
 * usual gap, never sooner than `MIN_ABSENCE_DAYS`, falling back to a fixed threshold
 * when there is no rhythm to compare against.
 */
export function absenceThreshold(profile: AttendanceProfile): number {
  if (profile.medianGapDays === null) return DEFAULT_ABSENCE_DAYS;
  return Math.max(MIN_ABSENCE_DAYS, Math.ceil(profile.medianGapDays * SLIP_MULTIPLIER));
}

/** Days of absence that count as having stopped altogether. */
export function goneQuietThreshold(profile: AttendanceProfile): number {
  return Math.max(GONE_QUIET_DAYS, absenceThreshold(profile) * 2);
}

/**
 * Which band this member is in. `ok` means "leave them alone", which is most of the
 * roster and has to stay most of the roster — a list that flags everyone is a list
 * that gets ignored.
 */
export function riskBandFor(profile: AttendanceProfile): RiskBand {
  // Not yet had a fair chance: joined on Friday, and it is Sunday.
  if (profile.coveredDaysN < MIN_COVERED_DAYS) return 'ok';

  // They were just here. Whatever their rate says, today is not the day to ring.
  if (profile.daysSinceVisit !== null && profile.daysSinceVisit <= RECENT_VISIT_GRACE_DAYS) {
    return 'ok';
  }

  if (
    profile.tenureDays <= SETTLING_IN_DAYS &&
    profile.totalVisitsN < expectedSettlingVisits(profile.coveredDaysN)
  ) {
    return 'settling_in';
  }

  // Past the first month and still never once through the door.
  if (profile.daysSinceVisit === null) return 'gone_quiet';

  if (profile.daysSinceVisit >= goneQuietThreshold(profile)) return 'gone_quiet';
  if (profile.daysSinceVisit >= absenceThreshold(profile)) return 'slipping';
  return 'ok';
}

export interface AtRiskRow {
  member: Member;
  profile: AttendanceProfile;
  /** Never `ok` — an `ok` member is not a row. */
  band: RiskBand;
}

/**
 * One sentence the owner could read down the phone, about TRAINING and nothing else.
 *
 * Not a UI concern: the screen, the member's page and the CSV export all have to say
 * the same thing about the same member, and the wording is a design constraint
 * carrying the backfire evidence rather than a label.
 */
export function riskReason(row: { profile: AttendanceProfile; band: RiskBand }): string {
  const { profile, band } = row;

  if (band === 'settling_in') {
    if (profile.totalVisitsN === 0) {
      return `Joined ${describeDays(profile.tenureDays)} ago and hasn’t trained yet.`;
    }
    return `Only ${profile.totalVisitsN} ${profile.totalVisitsN === 1 ? 'visit' : 'visits'} since joining ${describeDays(profile.tenureDays)} ago.`;
  }

  if (profile.daysSinceVisit === null) {
    return 'Has never checked in.';
  }

  const absence = `${describeDays(profile.daysSinceVisit)} since their last visit`;
  if (profile.medianGapDays !== null) {
    return `${absence} — they usually train every ${describeDays(Math.round(profile.medianGapDays))}.`;
  }
  return `${absence}.`;
}

function describeDays(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

/** Most actionable first: band, then longest absence, then name for a stable order. */
export function compareByRisk(a: AtRiskRow, b: AtRiskRow): number {
  const rank = BAND_RANK[a.band] - BAND_RANK[b.band];
  if (rank !== 0) return rank;

  // A member who has never come is ranked by how long they have been a member.
  const aGap = a.profile.daysSinceVisit ?? a.profile.tenureDays;
  const bGap = b.profile.daysSinceVisit ?? b.profile.tenureDays;
  if (aGap !== bGap) return bGap - aGap;

  return a.member.fullName.localeCompare(b.member.fullName);
}

/**
 * The daily action list: paying members who have stopped showing up.
 *
 * Only members whose membership covers TODAY are considered — see the file header
 * for why the expired are deliberately somebody else's list.
 */
export function atRiskList(
  members: readonly Member[],
  memberships: readonly Membership[],
  visits: readonly Visit[],
  today: DateISO,
  windowDays: number = RHYTHM_WINDOW_DAYS,
): AtRiskRow[] {
  // No register, no signal. Reporting an empty list here is not a guess that
  // everybody is fine — the screen says plainly that the register has not been used
  // yet, because the alternative is telling a gym that has simply never checked
  // anybody in that its entire roster has stopped coming.
  if (!isRegisterInUse(visits, today, windowDays)) return [];

  const membershipsByMember = groupBy(memberships, (m) => m.memberId);
  const visitsByMember = groupBy(visits, (v) => v.memberId);

  const rows: AtRiskRow[] = [];
  for (const member of members) {
    if (member.archived) continue;

    const theirTerms = membershipsByMember.get(member.id) ?? [];

    // Anybody the renewals chase list is already handling is left to it. Not just
    // the expired: a member whose cover ends this week is 'expiring', which
    // `needsAttentionToday` also returns true for — and "plan about to lapse AND
    // stopped coming" is the single commonest pre-churn member there is, so the two
    // lists overlapped on precisely the people they were built for. The owner then
    // read "ends in 3 days, renew them" and "never mention their membership" one
    // scroll apart, about the same person. One person, one conversation: while a
    // renewal is imminent that conversation wins, and it comes back here if they
    // renew and still do not show up.
    const coversUntil = coverageEndsOn(theirTerms, today);
    if (coversUntil === null) continue;
    if (diffDays(today, coversUntil) <= EXPIRING_WINDOW_DAYS) continue;

    const profile = attendanceProfile(
      member,
      theirTerms,
      visitsByMember.get(member.id) ?? [],
      today,
      windowDays,
    );
    const band = riskBandFor(profile);
    if (band === 'ok') continue;

    rows.push({ member, profile, band });
  }

  return rows.sort(compareByRisk);
}

export interface RiskBandTotal {
  band: RiskBand;
  countN: number;
}

/** Counts per band in list order. Empty bands are kept so the row set is stable. */
export function riskTotals(rows: readonly AtRiskRow[]): RiskBandTotal[] {
  return (['settling_in', 'slipping', 'gone_quiet'] as const).map((band) => ({
    band,
    countN: rows.filter((r) => r.band === band).length,
  }));
}

// ---------------------------------------------------------------- the register

/** One member's check-in on the day being viewed, joined to who they are. */
export interface RegisterRow {
  visit: Visit;
  /** Null only when the member row has gone — shown as unknown, never hidden. */
  member: Member | null;
}

/**
 * Who came in on `day`, most recent check-in first. A desk reads its register from
 * the top: the last person through the door is the one being asked about.
 */
export function registerFor(
  visits: readonly Visit[],
  members: readonly Member[],
  day: DateISO,
): RegisterRow[] {
  const memberById = new Map(members.map((m) => [m.id, m]));
  return visits
    .filter((v) => v.visitedOn === day)
    .sort((a, b) => b.checkedInAt - a.checkedInAt)
    .map((visit) => ({ visit, member: memberById.get(visit.memberId) ?? null }));
}

// ---------------------------------------------------------------- reporting

export interface DayCount {
  day: DateISO;
  countN: number;
}

/**
 * Check-ins per day across the range, INCLUDING the empty days.
 *
 * Dropping zero days would draw a chart with no closed Sundays in it — a trend line
 * that quietly hides the very thing an owner is looking for.
 */
export function dailyVisitCounts(
  visits: readonly Visit[],
  from: DateISO,
  to: DateISO,
): DayCount[] {
  // Days outside the range need no filter of their own: only days between `from`
  // and `to` are ever read back out of this map.
  const counts = new Map<DateISO, number>();
  for (const v of visits) {
    counts.set(v.visitedOn, (counts.get(v.visitedOn) ?? 0) + 1);
  }

  const out: DayCount[] = [];
  const span = diffDays(from, to);
  for (let i = 0; i <= span; i += 1) {
    const day = addDays(from, i);
    out.push({ day, countN: counts.get(day) ?? 0 });
  }
  return out;
}

export interface HourCount {
  hour: number;
  countN: number;
}

/** All 24 hours, in order, so the shape of the day is readable at a glance. */
export function hourHistogram(visits: readonly Visit[]): HourCount[] {
  const counts = new Array<number>(24).fill(0);
  for (const v of visits) {
    const hour = trustedHour(v);
    if (hour !== null) counts[hour] += 1;
  }
  return counts.map((countN, hour) => ({ hour, countN }));
}

/** `6–7 am`. Written as a span because a check-in at 6:55 is still the 6 o'clock hour. */
export function hourLabel(hour: number): string {
  return `${clockLabel(hour)}–${clockLabel((hour + 1) % 24)}`;
}

function clockLabel(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

export interface AttendanceSummary {
  visitsN: number;
  /** Distinct members who came in at least once. */
  membersN: number;
  busiest: DayCount | null;
  /** Mean check-ins per day across the range, empty days included. */
  perDay: number;
  /** The hour with the most check-ins, or null when no timestamp can be believed. */
  busiestHour: number | null;
}

export function attendanceSummary(
  visits: readonly Visit[],
  from: DateISO,
  to: DateISO,
): AttendanceSummary {
  const inRange = visits.filter((v) => v.visitedOn >= from && v.visitedOn <= to);
  const days = dailyVisitCounts(inRange, from, to);

  let busiest: DayCount | null = null;
  for (const d of days) {
    if (d.countN > 0 && (busiest === null || d.countN > busiest.countN)) busiest = d;
  }

  const hours = hourHistogram(inRange);
  const peak = hours.reduce((best, h) => (h.countN > best.countN ? h : best), hours[0]);

  return {
    visitsN: inRange.length,
    membersN: new Set(inRange.map((v) => v.memberId)).size,
    busiest,
    perDay: days.length === 0 ? 0 : inRange.length / days.length,
    busiestHour: peak.countN === 0 ? null : peak.hour,
  };
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
