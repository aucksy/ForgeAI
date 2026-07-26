/**
 * Attendance + at-risk logic.
 *
 * `vitest.config.ts` pins `TZ=Asia/Kolkata` and the hour tests depend on it: CI runs
 * UTC, where a check-in recorded at 6:15am local is 00:45 UTC, so a peak-hour report
 * built on `getUTCHours` would pass every assertion written in UTC and tell an Indian
 * gym owner their busiest hour is half past midnight.
 */

import { describe, expect, it } from 'vitest';

import {
  absenceThreshold,
  atRiskList,
  attendanceProfile,
  attendanceSummary,
  BAND_TONE,
  compareByRisk,
  coveredDaysInWindow,
  dailyVisitCounts,
  DEFAULT_ABSENCE_DAYS,
  expectedSettlingVisits,
  GONE_QUIET_DAYS,
  goneQuietThreshold,
  hourHistogram,
  hourLabel,
  isRegisterInUse,
  median,
  MIN_ABSENCE_DAYS,
  MIN_REGISTER_DAYS,
  patternSummary,
  registerFor,
  RHYTHM_MAX_AGE_DAYS,
  RHYTHM_SAMPLE_VISITS,
  RHYTHM_WINDOW_DAYS,
  rhythmGap,
  riskBandFor,
  riskReason,
  riskTotals,
  RISK_LABEL,
  usualHourOf,
  visitDays,
  type AttendanceProfile,
} from '../../src/crm/logic/attendance';
import { addDays, hourOfEpoch } from '../../src/crm/logic/dates';
import {
  buildMemberView,
  EXPIRING_WINDOW_DAYS,
  needsAttentionToday,
} from '../../src/crm/logic/membership';
import type { Member, Membership, Visit } from '../../src/crm/types';
import { makeMember, makeMembership, makeVisit } from './fixtures';

const TODAY = '2026-07-26';

/** Epoch ms for a LOCAL wall-clock time, the way a real check-in is stamped. */
function at(day: string, hour: number, minute = 0): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0).getTime();
}

/** A visit `daysAgo` before TODAY, stamped at a believable hour. */
function visitDaysAgo(daysAgo: number, over: Partial<Visit> = {}): Visit {
  const day = addDays(TODAY, -daysAgo);
  return makeVisit({ visitedOn: day, checkedInAt: at(day, 18, 30), ...over });
}

/** A term covering today, long enough that coverage is never the reason for a band. */
function coveringTerm(over: Partial<Membership> = {}): Membership {
  return makeMembership({ startsOn: addDays(TODAY, -200), endsOn: addDays(TODAY, 200), ...over });
}

/**
 * Enough register activity that the gym counts as using it, recorded against
 * somebody who is not under test. `atRiskList` says nothing at all about a gym with
 * no attendance data, so every list test has to establish that the register is live
 * before it can assert anything about who is on the list.
 */
function registerUse(today: string): Visit[] {
  return Array.from({ length: MIN_REGISTER_DAYS }, (_, i) =>
    makeVisit({
      memberId: 'register_filler',
      visitedOn: addDays(today, -i),
      checkedInAt: at(addDays(today, -i), 18, 0),
    }),
  );
}

function profileOf(
  visits: Visit[],
  over: { member?: Partial<Member>; memberships?: Membership[] } = {},
): AttendanceProfile {
  const member = makeMember({ joinedOn: addDays(TODAY, -365), ...over.member });
  return attendanceProfile(member, over.memberships ?? [coveringTerm()], visits, TODAY);
}

// ---------------------------------------------------------------- primitives

describe('visitDays', () => {
  it('collapses repeat scans on one day and puts the newest first', () => {
    const days = visitDays([
      makeVisit({ visitedOn: '2026-07-20' }),
      makeVisit({ visitedOn: '2026-07-24' }),
      makeVisit({ visitedOn: '2026-07-20' }),
      makeVisit({ visitedOn: '2026-07-22' }),
    ]);
    expect(days).toEqual(['2026-07-24', '2026-07-22', '2026-07-20']);
  });

  it('is empty for a member who has never been in', () => {
    expect(visitDays([])).toEqual([]);
  });
});

describe('median', () => {
  it('takes the middle of an odd-length list', () => {
    expect(median([7, 1, 3])).toBe(3);
  });

  it('averages the two middles of an even-length list', () => {
    expect(median([1, 2, 4, 9])).toBe(3);
  });

  it('is null for nothing at all, rather than 0 — no data is not a gap of zero days', () => {
    expect(median([])).toBeNull();
  });
});

describe('hourOfEpoch', () => {
  it('reads the LOCAL hour, not the UTC one', () => {
    // 6:15am in Kolkata is 00:45 the same day in UTC. A gym is busy at 6, never at 0.
    expect(hourOfEpoch(at('2026-07-26', 6, 15))).toBe(6);
    expect(hourOfEpoch(at('2026-07-26', 21, 5))).toBe(21);
  });

  it('is null for a timestamp that is not an instant', () => {
    expect(hourOfEpoch(Number.NaN)).toBeNull();
  });
});

describe('usualHourOf', () => {
  it('picks the hour they actually train', () => {
    expect(
      usualHourOf([
        visitDaysAgo(1, { checkedInAt: at(addDays(TODAY, -1), 6, 10) }),
        visitDaysAgo(2, { checkedInAt: at(addDays(TODAY, -2), 6, 55) }),
        visitDaysAgo(3, { checkedInAt: at(addDays(TODAY, -3), 19, 0) }),
      ]),
    ).toBe(6);
  });

  it('ignores a timestamp that does not belong to the day it is recorded against', () => {
    // The default for an imported row is `checkedInAt: 0` — 1 Jan 1970, which is
    // 5:30am in Kolkata. Trusting it would have every paper register in the country
    // voting for a 5am rush.
    const imported = makeVisit({ visitedOn: '2026-07-20', checkedInAt: 0, source: 'import' });
    expect(usualHourOf([imported])).toBeNull();

    const real = visitDaysAgo(1, { checkedInAt: at(addDays(TODAY, -1), 19, 0) });
    expect(usualHourOf([imported, real])).toBe(19);
  });

  it('breaks a tie to the earlier hour, so the answer does not flip between renders', () => {
    const morning = [1, 2].map((d) =>
      visitDaysAgo(d, { checkedInAt: at(addDays(TODAY, -d), 6, 0) }),
    );
    const evening = [3, 4].map((d) =>
      visitDaysAgo(d, { checkedInAt: at(addDays(TODAY, -d), 19, 0) }),
    );
    expect(usualHourOf([...morning, ...evening])).toBe(6);
    expect(usualHourOf([...evening, ...morning])).toBe(6);
  });

  it('is null when nobody has a believable timestamp', () => {
    expect(usualHourOf([])).toBeNull();
  });
});

describe('hourLabel', () => {
  it('reads as a span in 12-hour time, and wraps at midnight', () => {
    expect(hourLabel(6)).toBe('6 am–7 am');
    expect(hourLabel(0)).toBe('12 am–1 am');
    expect(hourLabel(12)).toBe('12 pm–1 pm');
    expect(hourLabel(23)).toBe('11 pm–12 am');
  });
});

describe('rhythmGap', () => {
  const daysAgo = (list: number[]) => list.map((d) => addDays(TODAY, -d));

  it('is null below four visits — three points are a coincidence, not a habit', () => {
    expect(rhythmGap(daysAgo([1, 4, 7]), TODAY)).toBeNull();
    expect(rhythmGap(daysAgo([1, 4, 7, 10]), TODAY)).toBe(3);
  });

  it('takes the median, so one holiday does not redefine a regular member', () => {
    // Weekly, with a single three-week break in the middle.
    expect(rhythmGap(daysAgo([1, 8, 15, 36, 43]), TODAY)).toBe(7);
  });

  it('looks at their most recent visits only', () => {
    // Every-other-day for the last fortnight, monthly before that. Enough monthly
    // visits that including them would drag the median from 2 days to 30 — which is
    // what "sample the last few visits" has to actually mean.
    const recent = Array.from({ length: RHYTHM_SAMPLE_VISITS }, (_, i) => (i + 1) * 2);
    const older = Array.from({ length: 16 }, (_, i) => 30 + i * 10);
    expect(older.every((d) => d <= RHYTHM_MAX_AGE_DAYS)).toBe(true);

    // Enough older visits that including them would outvote the recent ones.
    expect(rhythmGap(daysAgo(older), TODAY)).toBe(10);
    expect(rhythmGap(daysAgo([...recent, ...older]), TODAY)).toBe(2);
  });

  it('discards visits older than the cut-off entirely', () => {
    expect(rhythmGap(daysAgo([RHYTHM_MAX_AGE_DAYS + 1, RHYTHM_MAX_AGE_DAYS + 8, 400, 410]), TODAY)).toBeNull();
  });
});

// ---------------------------------------------------------------- coverage

describe('coveredDaysInWindow', () => {
  const from = '2026-07-01';
  const to = '2026-07-10'; // 10 days inclusive

  it('counts a term that sits inside the window', () => {
    expect(coveredDaysInWindow([makeMembership({ startsOn: '2026-07-03', endsOn: '2026-07-05' })], from, to)).toBe(3);
  });

  it('clips a term that overhangs both ends', () => {
    expect(coveredDaysInWindow([makeMembership({ startsOn: '2026-06-01', endsOn: '2026-08-01' })], from, to)).toBe(10);
  });

  it('MERGES overlapping terms instead of adding them up', () => {
    // An early renewal sold before the old term ended covers the same days twice.
    // Summing lengths would give this member 8 covered days out of a 10-day window
    // that only contains 6 — and make a regular trainer look half as regular.
    const rows = [
      makeMembership({ startsOn: '2026-07-01', endsOn: '2026-07-05' }),
      makeMembership({ startsOn: '2026-07-03', endsOn: '2026-07-06' }),
    ];
    expect(coveredDaysInWindow(rows, from, to)).toBe(6);
  });

  it('adds two terms that do not touch', () => {
    const rows = [
      makeMembership({ startsOn: '2026-07-01', endsOn: '2026-07-02' }),
      makeMembership({ startsOn: '2026-07-09', endsOn: '2026-07-10' }),
    ];
    expect(coveredDaysInWindow(rows, from, to)).toBe(4);
  });

  it('ignores a cancelled term — the gym stopped selling them those days', () => {
    const rows = [makeMembership({ startsOn: '2026-07-01', endsOn: '2026-07-10', cancelled: true })];
    expect(coveredDaysInWindow(rows, from, to)).toBe(0);
  });

  it('is 0 with no terms at all, and 0 for a backwards window', () => {
    expect(coveredDaysInWindow([], from, to)).toBe(0);
    expect(coveredDaysInWindow([makeMembership({ startsOn: '2026-01-01', endsOn: '2027-01-01' })], to, from)).toBe(0);
  });

  it('counts a term entirely outside the window as nothing', () => {
    expect(coveredDaysInWindow([makeMembership({ startsOn: '2025-01-01', endsOn: '2025-02-01' })], from, to)).toBe(0);
  });
});

// ---------------------------------------------------------------- profile

describe('attendanceProfile', () => {
  it('counts only visits inside the rhythm window, but dates the last visit from all of them', () => {
    const old = visitDaysAgo(RHYTHM_WINDOW_DAYS + 40);
    const edgeIn = visitDaysAgo(RHYTHM_WINDOW_DAYS - 1);
    const edgeOut = visitDaysAgo(RHYTHM_WINDOW_DAYS);

    const p = profileOf([old, edgeIn, edgeOut]);
    expect(p.visitsInWindowN).toBe(1);
    expect(p.totalVisitsN).toBe(3);
    expect(p.lastVisitOn).toBe(addDays(TODAY, -(RHYTHM_WINDOW_DAYS - 1)));
    expect(p.daysSinceVisit).toBe(RHYTHM_WINDOW_DAYS - 1);
  });

  it('has no rhythm below four visits, and one above', () => {
    expect(profileOf([visitDaysAgo(2), visitDaysAgo(5), visitDaysAgo(8)]).medianGapDays).toBeNull();
    expect(
      profileOf([visitDaysAgo(2), visitDaysAgo(5), visitDaysAgo(8), visitDaysAgo(11)]).medianGapDays,
    ).toBe(3);
  });

  it('EXCLUDES the open absence from the rhythm', () => {
    // Counting "days since the last visit" as a gap would stretch a member's own
    // threshold every day they stayed away, so somebody who stopped entirely would
    // never cross it. Four visits three days apart, then thirty days of silence:
    // the rhythm is still three days.
    const p = profileOf([visitDaysAgo(30), visitDaysAgo(33), visitDaysAgo(36), visitDaysAgo(39)]);
    expect(p.medianGapDays).toBe(3);
    expect(p.daysSinceVisit).toBe(30);
  });

  it('keeps the rhythm alive once the absence pushes older visits out of the recent window', () => {
    // THE BUG THIS EXISTS TO PREVENT. A fortnightly member needs four visits across
    // six weeks to have a rhythm, so an eight-week window anchored on TODAY holds
    // that history for at most a fortnight of absence. Measured that way their
    // baseline evaporates the moment they start drifting, dropping them onto the
    // generic threshold and flagging somebody who is one day late. Counted back from
    // their last visit instead, the pattern survives.
    const fortnightly = [20, 34, 48, 62, 76].map((d) => visitDaysAgo(d));
    const p = profileOf(fortnightly);

    expect(p.visitsInWindowN).toBe(3); // only three fall inside the recent window
    expect(p.medianGapDays).toBe(14); // ...but the rhythm is still fortnightly
    expect(riskBandFor(p)).toBe('ok');
  });

  it('will not let a habit from last year vouch for anybody', () => {
    const ancient = [200, 214, 228, 242].map((d) => visitDaysAgo(d));
    expect(profileOf(ancient).medianGapDays).toBeNull();
  });

  it('samples only their most recent visits, so a changed routine is the one that counts', () => {
    // Daily for the last fortnight, weekly before that. The rhythm should describe
    // who they are now, not who they were in the spring.
    const nowDaily = Array.from({ length: 10 }, (_, i) => visitDaysAgo(i + 1));
    const thenWeekly = [40, 47, 54, 61, 68, 75].map((d) => visitDaysAgo(d));
    expect(profileOf([...nowDaily, ...thenWeekly]).medianGapDays).toBe(1);
  });

  it('reports a weekly rate against covered days, not calendar days', () => {
    // 14 covered days out of the window, 4 visits -> 2 a week.
    const term = makeMembership({ startsOn: addDays(TODAY, -13), endsOn: addDays(TODAY, 30) });
    const p = profileOf([visitDaysAgo(1), visitDaysAgo(4), visitDaysAgo(8), visitDaysAgo(11)], {
      memberships: [term],
    });
    expect(p.coveredDaysN).toBe(14);
    expect(p.weeklyRate).toBeCloseTo(2, 5);
  });

  it('counts the rate over covered days on BOTH sides of the division', () => {
    // Found by review. The numerator counted every visit in the window while the
    // denominator counted only covered days, so a member who kept training through
    // a lapse and renewed six days ago scored 20 visits against 7 covered days and
    // was reported as training twenty times a week — printed directly beneath
    // "20 visits in the last 56 days", two numbers that cannot both be true.
    const renewed = makeMembership({ startsOn: addDays(TODAY, -6), endsOn: addDays(TODAY, 30) });
    const trainedThroughout = Array.from({ length: 20 }, (_, i) => visitDaysAgo(i + 1));
    const p = profileOf(trainedThroughout, { memberships: [renewed] });

    expect(p.visitsInWindowN).toBe(20);
    expect(p.coveredDaysN).toBe(7);
    expect(p.coveredVisitsN).toBe(6); // days -1..-6 are covered; -7 and older are not
    expect(p.weeklyRate).toBeCloseTo(6, 5);
    // Never more than seven sessions in a seven-day week.
    expect(p.weeklyRate).toBeLessThanOrEqual(7);
  });

  it('does not count visits made under a CANCELLED term as covered training', () => {
    // A cancelled term covers nothing — `coveredDaysInWindow` already knows that, so
    // if the numerator disagreed the rate would be computed over two different
    // populations and read high for anybody who trained during a reversed sale.
    const live = makeMembership({ startsOn: addDays(TODAY, -6), endsOn: addDays(TODAY, 30) });
    const reversed = makeMembership({
      startsOn: addDays(TODAY, -30),
      endsOn: addDays(TODAY, -20),
      cancelled: true,
    });
    const p = profileOf([visitDaysAgo(1), visitDaysAgo(3), visitDaysAgo(5), visitDaysAgo(21), visitDaysAgo(22)], {
      memberships: [live, reversed],
    });

    expect(p.visitsInWindowN).toBe(5);
    expect(p.coveredDaysN).toBe(7);
    expect(p.coveredVisitsN).toBe(3);
    expect(p.weeklyRate).toBeCloseTo(3, 5);
  });

  it('knows a long-absent member’s usual hour, which the recent window cannot', () => {
    // The rhythm is sampled from their last visits; the usual hour must come from
    // the same sample, or the "usually trains at 6am" note is missing for exactly
    // the gone-quiet members it is most useful for.
    const longAgo = [70, 84, 98, 112].map((d) =>
      visitDaysAgo(d, { checkedInAt: at(addDays(TODAY, -d), 6, 20) }),
    );
    const p = profileOf(longAgo);
    expect(p.visitsInWindowN).toBe(0);
    expect(p.usualHour).toBe(6);
  });

  it('has a null last visit and no rate for someone who has never been in', () => {
    const p = profileOf([]);
    expect(p.lastVisitOn).toBeNull();
    expect(p.daysSinceVisit).toBeNull();
    expect(p.weeklyRate).toBe(0);
  });

  it('measures tenure from the joining date, never negative', () => {
    expect(profileOf([], { member: { joinedOn: addDays(TODAY, -10) } }).tenureDays).toBe(10);
    // A joining date typed in the future must not make tenure negative and drag a
    // member into the settling-in band by arithmetic accident.
    expect(profileOf([], { member: { joinedOn: addDays(TODAY, 5) } }).tenureDays).toBe(0);
  });
});

// ---------------------------------------------------------------- thresholds

describe('expectedSettlingVisits', () => {
  it('expects nothing before the member has had a week', () => {
    expect(expectedSettlingVisits(0)).toBe(0);
    expect(expectedSettlingVisits(6)).toBe(0);
  });

  it('rises about one a week and stops at the researched bar of four', () => {
    expect(expectedSettlingVisits(7)).toBe(1);
    expect(expectedSettlingVisits(14)).toBe(2);
    expect(expectedSettlingVisits(21)).toBe(3);
    expect(expectedSettlingVisits(28)).toBe(4);
    expect(expectedSettlingVisits(56)).toBe(4);
  });
});

describe('absenceThreshold', () => {
  const withGap = (medianGapDays: number | null): AttendanceProfile =>
    ({ medianGapDays }) as AttendanceProfile;

  it('falls back to a fixed threshold when there is no rhythm to compare against', () => {
    expect(absenceThreshold(withGap(null))).toBe(DEFAULT_ABSENCE_DAYS);
  });

  it('never fires sooner than the floor, however tight the rhythm', () => {
    // A daily trainer has a median gap of 1. Without the floor, a long weekend
    // would put them on the owner's call list — which is how an owner learns to
    // ignore the list.
    expect(absenceThreshold(withGap(1))).toBe(MIN_ABSENCE_DAYS);
    expect(absenceThreshold(withGap(3))).toBe(MIN_ABSENCE_DAYS);
  });

  it('scales with a slower member so a fortnightly regular is left alone', () => {
    expect(absenceThreshold(withGap(14))).toBe(35);
    expect(absenceThreshold(withGap(7))).toBe(18);
  });
});

describe('goneQuietThreshold', () => {
  it('is three weeks for an ordinary member', () => {
    expect(goneQuietThreshold({ medianGapDays: 2 } as AttendanceProfile)).toBe(GONE_QUIET_DAYS);
  });

  it('is twice their own gap once that is longer than three weeks', () => {
    expect(goneQuietThreshold({ medianGapDays: 14 } as AttendanceProfile)).toBe(70);
  });

  it('is never below the slipping threshold, so the bands cannot invert', () => {
    for (const gap of [null, 1, 3, 7, 14, 30]) {
      const p = { medianGapDays: gap } as AttendanceProfile;
      expect(goneQuietThreshold(p)).toBeGreaterThanOrEqual(absenceThreshold(p));
    }
  });
});

// ---------------------------------------------------------------- bands

describe('riskBandFor', () => {
  it('leaves alone a member who has not yet had a week in which to come', () => {
    // Joined on Friday; it is Sunday. Flagging them would be flagging the calendar.
    const term = makeMembership({ startsOn: addDays(TODAY, -2), endsOn: addDays(TODAY, 30) });
    const p = profileOf([], { member: { joinedOn: addDays(TODAY, -2) }, memberships: [term] });
    expect(p.coveredDaysN).toBe(3);
    expect(riskBandFor(p)).toBe('ok');
  });

  it('flags a new member who has had a fortnight and been in once', () => {
    const term = makeMembership({ startsOn: addDays(TODAY, -14), endsOn: addDays(TODAY, 30) });
    const p = profileOf([visitDaysAgo(13)], {
      member: { joinedOn: addDays(TODAY, -14) },
      memberships: [term],
    });
    expect(p.coveredDaysN).toBe(15);
    expect(riskBandFor(p)).toBe('settling_in');
  });

  it('does NOT flag a new member who is turning up', () => {
    const term = makeMembership({ startsOn: addDays(TODAY, -14), endsOn: addDays(TODAY, 30) });
    const p = profileOf([visitDaysAgo(1), visitDaysAgo(4), visitDaysAgo(9)], {
      member: { joinedOn: addDays(TODAY, -14) },
      memberships: [term],
    });
    expect(riskBandFor(p)).toBe('ok');
  });

  it('never flags anybody who trained today or yesterday', () => {
    // FOUND IN THE BROWSER, not by a test. A member three weeks in with exactly one
    // visit was flagged as not settling in — on the day that visit happened. The
    // card read "Only 1 visit since joining 22 days ago" directly above "last in:
    // today", which is two true facts making one absurd suggestion: they are in the
    // building. They come back on the list in a day or two if it really was a one-off.
    const term = makeMembership({ startsOn: addDays(TODAY, -22), endsOn: addDays(TODAY, 60) });
    const joined = { joinedOn: addDays(TODAY, -22) };

    for (const daysAgo of [0, 1]) {
      const p = profileOf([visitDaysAgo(daysAgo)], { member: joined, memberships: [term] });
      expect(p.totalVisitsN).toBe(1);
      expect(riskBandFor(p)).toBe('ok');
    }

    // ...and the day after that, the rate problem is worth raising again.
    const stale = profileOf([visitDaysAgo(2)], { member: joined, memberships: [term] });
    expect(riskBandFor(stale)).toBe('settling_in');
  });

  it('stops using the settling-in rule once the first month is over', () => {
    // Same two visits, but they joined 40 days ago: this is now an absence
    // question, not an onboarding one.
    const p = profileOf([visitDaysAgo(1), visitDaysAgo(3)], {
      member: { joinedOn: addDays(TODAY, -40) },
    });
    expect(riskBandFor(p)).toBe('ok');
  });

  it('calls a long-standing member who has never once come in gone quiet', () => {
    const p = profileOf([], { member: { joinedOn: addDays(TODAY, -400) } });
    expect(riskBandFor(p)).toBe('gone_quiet');
  });

  it('flips to slipping exactly at the threshold and not a day before', () => {
    const rhythm = [3, 6, 9, 12]; // gaps of 3 -> threshold is the 10-day floor
    const justInside = profileOf(rhythm.map((d) => visitDaysAgo(d + 6)));
    expect(justInside.daysSinceVisit).toBe(9);
    expect(riskBandFor(justInside)).toBe('ok');

    const justOver = profileOf(rhythm.map((d) => visitDaysAgo(d + 7)));
    expect(justOver.daysSinceVisit).toBe(10);
    expect(riskBandFor(justOver)).toBe('slipping');
  });

  it('leaves a fortnightly regular alone at thirteen days — the whole point of a personal baseline', () => {
    const p = profileOf([13, 27, 41, 55, 69].map((d) => visitDaysAgo(d)));
    expect(p.medianGapDays).toBe(14);
    expect(riskBandFor(p)).toBe('ok');
    // A single global "flag at 12 days" rule would have called this member at risk.
    expect(p.daysSinceVisit).toBeGreaterThan(DEFAULT_ABSENCE_DAYS);
  });

  it('escalates the same fortnightly member once they are genuinely gone', () => {
    // Their own gap is 14, so slipping starts at 35 days and gone-quiet at 70 — not
    // at the 12 and 21 a member with no rhythm would get.
    const slipping = profileOf([40, 54, 68, 82, 96].map((d) => visitDaysAgo(d)));
    expect(slipping.medianGapDays).toBe(14);
    expect(riskBandFor(slipping)).toBe('slipping');

    const gone = profileOf([75, 89, 103, 117, 131].map((d) => visitDaysAgo(d)));
    expect(riskBandFor(gone)).toBe('gone_quiet');
  });

  it('escalates a member with no measurable rhythm at twice the default threshold', () => {
    // No rhythm means the generic thresholds apply: slipping at 12 days, gone quiet
    // at 24. Not `GONE_QUIET_DAYS` — that floor only binds for a member whose own
    // gap is short enough that twice it would be sooner than three weeks.
    const slipping = profileOf([visitDaysAgo(23)]);
    expect(slipping.medianGapDays).toBeNull();
    expect(riskBandFor(slipping)).toBe('slipping');

    expect(riskBandFor(profileOf([visitDaysAgo(24)]))).toBe('gone_quiet');
    expect(goneQuietThreshold(slipping)).toBe(2 * DEFAULT_ABSENCE_DAYS);
  });
});

describe('patternSummary', () => {
  it('does not call somebody with no plan and no visits "Training"', () => {
    // Found by review. `riskBandFor` returns `ok` for three different situations and
    // only one of them is good news: a member who lapsed two months ago and never
    // once checked in was given a green "Training" pill directly above the line
    // "0 visits in the last 56 days".
    const lapsed = profileOf([], {
      memberships: [makeMembership({ startsOn: addDays(TODAY, -120), endsOn: addDays(TODAY, -60) })],
    });
    expect(lapsed.coveredDaysN).toBe(0);
    expect(riskBandFor(lapsed)).toBe('ok');
    expect(patternSummary(lapsed, 'ok')).toEqual({ label: 'No plan running', tone: 'muted' });

    const walkIn = profileOf([], { memberships: [] });
    expect(patternSummary(walkIn, riskBandFor(walkIn))).toEqual({
      label: 'No plan running',
      tone: 'muted',
    });
  });

  it('separates "too new to judge" from "training"', () => {
    const term = makeMembership({ startsOn: addDays(TODAY, -3), endsOn: addDays(TODAY, 60) });
    const brandNew = profileOf([], { member: { joinedOn: addDays(TODAY, -3) }, memberships: [term] });
    expect(riskBandFor(brandNew)).toBe('ok');
    expect(patternSummary(brandNew, 'ok').label).toBe('Never checked in');
    expect(patternSummary(brandNew, 'ok').tone).not.toBe('good');
  });

  it('says Training, in green, only for somebody actually training', () => {
    const regular = profileOf([1, 3, 5, 8].map((d) => visitDaysAgo(d)));
    expect(patternSummary(regular, riskBandFor(regular))).toEqual({ label: 'Training', tone: 'good' });
  });

  it('passes a real band straight through, with the one shared tone', () => {
    const quiet = profileOf([visitDaysAgo(40)]);
    expect(patternSummary(quiet, 'gone_quiet')).toEqual({
      label: RISK_LABEL.gone_quiet,
      tone: BAND_TONE.gone_quiet,
    });
    // Gone-quiet used to be grey on one screen and orange on two others — the same
    // fact in three colours teaches an owner that the colours mean nothing.
    expect(BAND_TONE.gone_quiet).not.toBe('muted');
  });
});

// ---------------------------------------------------------------- the list

describe('atRiskList', () => {
  const term = (memberId: string, over: Partial<Membership> = {}) =>
    coveringTerm({ memberId, ...over });

  it('includes a paying member who has stopped coming', () => {
    const m = makeMember({ fullName: 'Quiet Kumar', joinedOn: addDays(TODAY, -300) });
    const rows = atRiskList([m], [term(m.id)], [visitDaysAgo(30, { memberId: m.id }), ...registerUse(TODAY)], TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].band).toBe('gone_quiet');
  });

  it('says NOTHING about a gym that has never used the register', () => {
    // THE WORST BUG THIS PHASE COULD HAVE SHIPPED. Until now the only way to check
    // anybody in was a button buried on their profile, so every gym already running
    // P1 and P2 has an empty visits table. Judged on that, 79 of 83 covered members
    // came back flagged and the owner's first sight of the feature was a red tile
    // saying most of their gym had stopped coming — when the gym had not started.
    // No attendance is an ABSENT signal, not a negative one.
    const members = Array.from({ length: 20 }, (_, i) =>
      makeMember({ fullName: `Member ${i}`, phone: `+9198765${String(43000 + i)}`, joinedOn: addDays(TODAY, -300) }),
    );
    const terms = members.map((m) => coveringTerm({ memberId: m.id }));

    expect(atRiskList(members, terms, [], TODAY)).toEqual([]);
    expect(isRegisterInUse([], TODAY)).toBe(false);

    // A gym that HAS started gets the list, and the same members are then judged.
    const someUse = Array.from({ length: MIN_REGISTER_DAYS }, (_, i) =>
      makeVisit({ memberId: members[0].id, visitedOn: addDays(TODAY, -i) }),
    );
    expect(isRegisterInUse(someUse, TODAY)).toBe(true);
    expect(atRiskList(members, terms, someUse, TODAY).length).toBeGreaterThan(0);
  });

  it('counts DAYS of register use, not visits — one busy morning is not adoption', () => {
    // Twenty check-ins on a single day is somebody trying the feature once.
    const oneDay = Array.from({ length: 20 }, (_, i) =>
      makeVisit({ memberId: `mem_${i}`, visitedOn: addDays(TODAY, -1) }),
    );
    expect(isRegisterInUse(oneDay, TODAY)).toBe(false);
  });

  it('ignores register use from before the window', () => {
    const stale = Array.from({ length: MIN_REGISTER_DAYS }, (_, i) =>
      makeVisit({ visitedOn: addDays(TODAY, -(RHYTHM_WINDOW_DAYS + i)) }),
    );
    expect(isRegisterInUse(stale, TODAY)).toBe(false);
  });

  it('leaves out a member whose plan has EXPIRED — they belong to the renewals list', () => {
    // The two lists must not print the same person twice under two different
    // headings. An expired member is a renewal conversation; this screen is for
    // people who are paid up and have quietly stopped.
    const m = makeMember({ fullName: 'Lapsed Lal', joinedOn: addDays(TODAY, -300) });
    const expired = makeMembership({
      memberId: m.id,
      startsOn: addDays(TODAY, -40),
      endsOn: addDays(TODAY, -5),
    });

    expect(atRiskList([m], [expired], registerUse(TODAY), TODAY)).toHaveLength(0);

    // ...and they really are on the other list, so nobody falls between the two.
    const view = buildMemberView(m, [expired], [], [], TODAY);
    expect(needsAttentionToday(view)).toBe(true);
  });

  it('leaves out a member whose plan is EXPIRING — the overlap the expired case missed', () => {
    // Found by review. The exclusion only dropped members with NO coverage, but
    // `needsAttentionToday` is also true for 'expiring' (cover ending within a
    // week). "Plan about to lapse AND stopped coming" is the canonical pre-churn
    // member, so the two lists overlapped on exactly the people they exist for —
    // and the owner read "ends in 3 days, renew them" and "never mention their
    // membership" one scroll apart, about the same person.
    const m = makeMember({ fullName: 'Expiring Elango', joinedOn: addDays(TODAY, -300) });
    const soon = makeMembership({
      memberId: m.id,
      startsOn: addDays(TODAY, -27),
      endsOn: addDays(TODAY, 3),
    });
    const visits = [visitDaysAgo(30, { memberId: m.id })];
    const register = registerUse(TODAY);

    const view = buildMemberView(m, [soon], [], visits, TODAY);
    expect(view.state).toBe('expiring');
    expect(needsAttentionToday(view)).toBe(true);
    expect(atRiskList([m], [soon], [...visits, ...register], TODAY)).toHaveLength(0);
  });

  it('hands over to the renewals list at exactly the week the chase list starts', () => {
    // The handover has to land on the SAME day `needsAttentionToday` starts caring,
    // or there is either a gap (a drifting member on neither list) or an overlap (on
    // both). Both members below have stopped coming; only the cover date differs.
    const drifted = (id: string) => [40, 42, 44, 46].map((d) => visitDaysAgo(d, { memberId: id }));

    const onTheEdge = makeMember({ fullName: 'Edge', phone: '+919876511111', joinedOn: addDays(TODAY, -300) });
    const justPast = makeMember({ fullName: 'Past', phone: '+919876522222', joinedOn: addDays(TODAY, -300) });
    const termEnding = (id: string, inDays: number) =>
      makeMembership({ memberId: id, startsOn: addDays(TODAY, -60), endsOn: addDays(TODAY, inDays) });

    const edgeTerm = termEnding(onTheEdge.id, EXPIRING_WINDOW_DAYS);
    const pastTerm = termEnding(justPast.id, EXPIRING_WINDOW_DAYS + 1);
    const visits = [...drifted(onTheEdge.id), ...drifted(justPast.id), ...registerUse(TODAY)];

    const rows = atRiskList([onTheEdge, justPast], [edgeTerm, pastTerm], visits, TODAY);
    expect(rows.map((r) => r.member.fullName)).toEqual(['Past']);

    // And the one left off really is picked up by the other list.
    expect(
      needsAttentionToday(buildMemberView(onTheEdge, [edgeTerm], [], drifted(onTheEdge.id), TODAY)),
    ).toBe(true);
    expect(
      needsAttentionToday(buildMemberView(justPast, [pastTerm], [], drifted(justPast.id), TODAY)),
    ).toBe(false);
  });

  it('THE INVARIANT: no member is ever on both this list and the renewals chase list', () => {
    // Stated as a property over a whole population rather than as three examples,
    // because the two lists are governed by separate thresholds that can drift
    // apart — which is exactly how the 'expiring' overlap above got in.
    const members: Member[] = [];
    const memberships: Membership[] = [];
    const visits: Visit[] = [...registerUse(TODAY)];

    // Every shape of coverage: long-running, ending today, ending in 1..10 days,
    // expired 1..10 days ago, never bought anything, cancelled.
    let n = 0;
    const add = (label: string, term: Partial<Membership> | null) => {
      n += 1;
      const m = makeMember({
        fullName: `${label} ${n}`,
        phone: `+9198760${String(10000 + n)}`,
        joinedOn: addDays(TODAY, -400),
      });
      members.push(m);
      if (term) memberships.push(makeMembership({ memberId: m.id, ...term }));
      // Half are regulars, half trained every other day and then vanished six weeks
      // ago — so both lists are genuinely non-empty and the disjointness is not
      // vacuous. (A monthly rhythm absent thirty days is ON schedule, not drifting,
      // which is the whole point of the personal baseline.)
      const gaps = n % 2 === 0 ? [1, 3, 5, 7] : [40, 42, 44, 46];
      for (const d of gaps) visits.push(visitDaysAgo(d, { memberId: m.id }));
    };

    add('LongRun', { startsOn: addDays(TODAY, -100), endsOn: addDays(TODAY, 200) });
    for (let d = 0; d <= 10; d += 1) {
      add(`EndsIn${d}`, { startsOn: addDays(TODAY, -60), endsOn: addDays(TODAY, d) });
      add(`Ended${d}`, { startsOn: addDays(TODAY, -60), endsOn: addDays(TODAY, -d - 1) });
    }
    add('NeverBought', null);
    add('Cancelled', { startsOn: addDays(TODAY, -30), endsOn: addDays(TODAY, 30), cancelled: true });

    const atRisk = new Set(atRiskList(members, memberships, visits, TODAY).map((r) => r.member.id));
    const chased = new Set(
      members
        .filter((m) =>
          needsAttentionToday(
            buildMemberView(m, memberships.filter((x) => x.memberId === m.id), [], visits.filter((v) => v.memberId === m.id), TODAY),
          ),
        )
        .map((m) => m.id),
    );

    // Both lists must actually have people on them, or the disjointness is vacuous.
    expect(atRisk.size).toBeGreaterThan(0);
    expect(chased.size).toBeGreaterThan(0);
    expect([...atRisk].filter((id) => chased.has(id))).toEqual([]);
  });

  it('leaves out an archived member — archiving is not forgiveness for money, but it is for workouts', () => {
    const m = makeMember({ archived: true, joinedOn: addDays(TODAY, -300) });
    expect(atRiskList([m], [term(m.id)], registerUse(TODAY), TODAY)).toHaveLength(0);
  });

  it('leaves out a member whose only term was cancelled', () => {
    const m = makeMember({ joinedOn: addDays(TODAY, -300) });
    expect(atRiskList([m], [term(m.id, { cancelled: true })], registerUse(TODAY), TODAY)).toHaveLength(0);
  });

  it('leaves out members who are simply training', () => {
    const m = makeMember({ joinedOn: addDays(TODAY, -300) });
    const visits = [1, 3, 5, 8].map((d) => visitDaysAgo(d, { memberId: m.id }));
    expect(atRiskList([m], [term(m.id)], [...visits, ...registerUse(TODAY)], TODAY)).toHaveLength(0);
  });

  it('does not credit one member with another member’s visits', () => {
    const quiet = makeMember({ fullName: 'Quiet', joinedOn: addDays(TODAY, -300) });
    const busy = makeMember({ fullName: 'Busy', phone: '+919876500002', joinedOn: addDays(TODAY, -300) });
    const visits = [1, 3, 5, 8].map((d) => visitDaysAgo(d, { memberId: busy.id }));

    const rows = atRiskList([quiet, busy], [term(quiet.id), term(busy.id)], [...visits, ...registerUse(TODAY)], TODAY);
    expect(rows.map((r) => r.member.fullName)).toEqual(['Quiet']);
  });

  it('orders by what the owner can still change: settling in, then slipping, then gone quiet', () => {
    const newbie = makeMember({ fullName: 'Newbie', phone: '+919876500003', joinedOn: addDays(TODAY, -20) });
    const slipping = makeMember({ fullName: 'Slipping', phone: '+919876500004', joinedOn: addDays(TODAY, -300) });
    const quiet = makeMember({ fullName: 'Quiet', phone: '+919876500005', joinedOn: addDays(TODAY, -300) });

    const memberships = [
      coveringTerm({ memberId: newbie.id, startsOn: addDays(TODAY, -20) }),
      term(slipping.id),
      term(quiet.id),
    ];
    const visits = [
      ...[10, 13, 16, 19].map((d) => visitDaysAgo(d, { memberId: slipping.id })),
      visitDaysAgo(45, { memberId: quiet.id }),
    ];

    const rows = atRiskList([quiet, slipping, newbie], memberships, [...visits, ...registerUse(TODAY)], TODAY);
    expect(rows.map((r) => r.band)).toEqual(['settling_in', 'slipping', 'gone_quiet']);
  });

  it('counts every band, including the empty ones, so the filter chips do not move', () => {
    expect(riskTotals([]).map((t) => t.band)).toEqual(['settling_in', 'slipping', 'gone_quiet']);
    expect(riskTotals([]).every((t) => t.countN === 0)).toBe(true);
  });
});

describe('compareByRisk', () => {
  const row = (band: 'settling_in' | 'slipping' | 'gone_quiet', daysSinceVisit: number | null, fullName: string) => ({
    member: makeMember({ fullName }),
    profile: { daysSinceVisit, tenureDays: 100 } as AttendanceProfile,
    band,
  });

  it('puts the longer absence first inside a band', () => {
    const rows = [row('slipping', 12, 'A'), row('slipping', 30, 'B')].sort(compareByRisk);
    expect(rows.map((r) => r.member.fullName)).toEqual(['B', 'A']);
  });

  it('breaks ties by name so the order does not jump between renders', () => {
    const rows = [row('slipping', 12, 'Zoya'), row('slipping', 12, 'Anil')].sort(compareByRisk);
    expect(rows.map((r) => r.member.fullName)).toEqual(['Anil', 'Zoya']);
  });

  it('ranks a never-visited member by how long they have been a member', () => {
    const never = row('gone_quiet', null, 'Never');
    const recent = row('gone_quiet', 30, 'Recent');
    expect([recent, never].sort(compareByRisk).map((r) => r.member.fullName)).toEqual([
      'Never',
      'Recent',
    ]);
  });
});

describe('riskReason', () => {
  const reasons = () => {
    const settling = profileOf([], { member: { joinedOn: addDays(TODAY, -14) } });
    const quiet = profileOf([visitDaysAgo(30)]);
    const rhythm = profileOf([visitDaysAgo(14), visitDaysAgo(17), visitDaysAgo(20), visitDaysAgo(23)]);
    return [
      riskReason({ profile: settling, band: 'settling_in' }),
      riskReason({ profile: quiet, band: 'gone_quiet' }),
      riskReason({ profile: rhythm, band: 'slipping' }),
      riskReason({ profile: profileOf([]), band: 'gone_quiet' }),
    ];
  };

  it('never mentions money, membership or renewal', () => {
    // Not a style rule. A randomised field experiment found proactive outreach ABOUT
    // the membership raised churn (10% vs 6% untouched); the recorded design rule is
    // to talk about training instead. This is that rule, enforced.
    for (const reason of reasons()) {
      expect(reason).not.toMatch(/renew|membership|expir|pay|due|₹/i);
    }
  });

  it('says what actually happened, in words that can be read down a phone', () => {
    const settling = profileOf([], { member: { joinedOn: addDays(TODAY, -14) } });
    expect(riskReason({ profile: settling, band: 'settling_in' })).toBe(
      'Joined 14 days ago and hasn’t trained yet.',
    );

    const oneVisit = profileOf([visitDaysAgo(12)], { member: { joinedOn: addDays(TODAY, -14) } });
    expect(riskReason({ profile: oneVisit, band: 'settling_in' })).toBe(
      'Only 1 visit since joining 14 days ago.',
    );
  });

  it('quotes the member’s own rhythm when there is one, and stays silent when there is not', () => {
    const withRhythm = profileOf([visitDaysAgo(14), visitDaysAgo(17), visitDaysAgo(20), visitDaysAgo(23)]);
    expect(riskReason({ profile: withRhythm, band: 'slipping' })).toBe(
      '14 days since their last visit — they usually train every 3 days.',
    );

    const without = profileOf([visitDaysAgo(30)]);
    expect(riskReason({ profile: without, band: 'gone_quiet' })).toBe(
      '30 days since their last visit.',
    );
  });

  it('says so plainly when they have never been in', () => {
    expect(riskReason({ profile: profileOf([]), band: 'gone_quiet' })).toBe('Has never checked in.');
  });
});

// ---------------------------------------------------------------- register

describe('registerFor', () => {
  const riya = makeMember({ fullName: 'Riya' });
  const arjun = makeMember({ fullName: 'Arjun', phone: '+919876500006' });

  const visits = [
    makeVisit({ memberId: riya.id, visitedOn: TODAY, checkedInAt: at(TODAY, 6, 30) }),
    makeVisit({ memberId: arjun.id, visitedOn: TODAY, checkedInAt: at(TODAY, 19, 15) }),
    makeVisit({ memberId: riya.id, visitedOn: addDays(TODAY, -1), checkedInAt: at(addDays(TODAY, -1), 7, 0) }),
  ];

  it('shows only the day asked for, latest check-in first', () => {
    const rows = registerFor(visits, [riya, arjun], TODAY);
    expect(rows.map((r) => r.member?.fullName)).toEqual(['Arjun', 'Riya']);
  });

  it('keeps a visit whose member row has gone, rather than hiding it', () => {
    const rows = registerFor(visits, [arjun], TODAY);
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.member === null)).toBe(true);
  });

  it('is empty for a day nobody came', () => {
    expect(registerFor(visits, [riya, arjun], '2026-01-01')).toEqual([]);
  });
});

// ---------------------------------------------------------------- reporting

describe('dailyVisitCounts', () => {
  it('includes the days nobody came, so a closed Sunday is a gap and not missing data', () => {
    const days = dailyVisitCounts(
      [makeVisit({ visitedOn: '2026-07-24' }), makeVisit({ visitedOn: '2026-07-24' })],
      '2026-07-23',
      '2026-07-25',
    );
    expect(days).toEqual([
      { day: '2026-07-23', countN: 0 },
      { day: '2026-07-24', countN: 2 },
      { day: '2026-07-25', countN: 0 },
    ]);
  });

  it('includes both ends of the range and nothing outside it', () => {
    const days = dailyVisitCounts(
      [
        makeVisit({ visitedOn: '2026-07-22' }),
        makeVisit({ visitedOn: '2026-07-23' }),
        makeVisit({ visitedOn: '2026-07-25' }),
        makeVisit({ visitedOn: '2026-07-26' }),
      ],
      '2026-07-23',
      '2026-07-25',
    );
    expect(days.map((d) => d.countN)).toEqual([1, 0, 1]);
  });

  it('crosses a month boundary without losing a day', () => {
    const days = dailyVisitCounts([], '2026-07-30', '2026-08-02');
    expect(days.map((d) => d.day)).toEqual(['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02']);
  });
});

describe('hourHistogram', () => {
  it('always returns all 24 hours in order', () => {
    const hours = hourHistogram([]);
    expect(hours).toHaveLength(24);
    expect(hours.map((h) => h.hour)).toEqual([...Array(24).keys()]);
  });

  it('buckets a check-in by local hour', () => {
    const hours = hourHistogram([
      makeVisit({ visitedOn: '2026-07-26', checkedInAt: at('2026-07-26', 6, 5) }),
      makeVisit({ visitedOn: '2026-07-26', checkedInAt: at('2026-07-26', 6, 55) }),
      makeVisit({ visitedOn: '2026-07-26', checkedInAt: at('2026-07-26', 21, 30) }),
    ]);
    expect(hours[6].countN).toBe(2);
    expect(hours[21].countN).toBe(1);
    // If this were computed in UTC, the two 6am visits would land at hour 0.
    expect(hours[0].countN).toBe(0);
  });

  it('drops a timestamp that does not belong to its own day', () => {
    const hours = hourHistogram([makeVisit({ visitedOn: '2026-07-26', checkedInAt: 0 })]);
    expect(hours.every((h) => h.countN === 0)).toBe(true);
  });
});

describe('attendanceSummary', () => {
  const visits = [
    makeVisit({ memberId: 'a', visitedOn: '2026-07-24', checkedInAt: at('2026-07-24', 7, 0) }),
    makeVisit({ memberId: 'b', visitedOn: '2026-07-24', checkedInAt: at('2026-07-24', 7, 30) }),
    makeVisit({ memberId: 'a', visitedOn: '2026-07-25', checkedInAt: at('2026-07-25', 19, 0) }),
  ];

  it('counts visits and the distinct people behind them', () => {
    const s = attendanceSummary(visits, '2026-07-23', '2026-07-26');
    expect(s.visitsN).toBe(3);
    expect(s.membersN).toBe(2);
  });

  it('averages over every day in the range, empty ones included', () => {
    // 3 visits across 4 days. Averaging over the 2 days that saw anybody would
    // report 1.5 and flatter a gym that was empty half the week.
    expect(attendanceSummary(visits, '2026-07-23', '2026-07-26').perDay).toBeCloseTo(0.75, 5);
  });

  it('names the busiest day and hour', () => {
    const s = attendanceSummary(visits, '2026-07-23', '2026-07-26');
    expect(s.busiest).toEqual({ day: '2026-07-24', countN: 2 });
    expect(s.busiestHour).toBe(7);
  });

  it('has no busiest day or hour when nothing happened', () => {
    const s = attendanceSummary([], '2026-07-23', '2026-07-26');
    expect(s.busiest).toBeNull();
    expect(s.busiestHour).toBeNull();
    expect(s.perDay).toBe(0);
  });

  it('has no busiest hour when every timestamp is untrustworthy', () => {
    const imported = [makeVisit({ visitedOn: '2026-07-24', checkedInAt: 0 })];
    const s = attendanceSummary(imported, '2026-07-23', '2026-07-26');
    expect(s.visitsN).toBe(1);
    expect(s.busiestHour).toBeNull();
  });
});
