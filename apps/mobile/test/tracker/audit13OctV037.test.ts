/**
 * 13 Oct 2026 audit of v0.37.0 — the fixes, as a member would meet them:
 *  B1  a lighter high-rep set is never an "Estimated 1-rep max" record (reps above 12 count as 12);
 *  B2  the Profile chart says "No workouts yet" only to a member with no workouts at all;
 *  B3  its big number is a dash, never "0 kg", until there are bars;
 *  B4  a touch that becomes a page scroll leaves the line chart as it was;
 *  B6  holding the picked point (or bar) and letting go keeps it — only a short tap clears it;
 *  B7  Set records read "+10 kg" (weighted) and "20 kg each" (dumbbells), as the pop-up does;
 *  B8  a rep record that is heavier AND longer says so;
 *  B9  the Profile bars sit at identical gaps;
 *  B10 switching what the exercise chart shows clears the picked point even when the numbers match;
 *  B11 the Statistics range says "12 months", as Profile and the comparison line do.
 * PURE, plus a few source checks for wiring a pure test cannot reach.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { E1RM_SQL } from '@/db/repos/prRepo';
import { epleyE1rm } from '@/engine/overload';
import { E1RM_MAX_REPS, e1rmSql, estimatedOneRepMax } from '@/lib/e1rm';
import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';
import { barLayout, chartBigNumberText, chartCardBody, chartBars, tapBar, type ChartBar } from '@/tracker/engine/historyChart';
import type { LogType } from '@/tracker/engine/logTypes';
import { exerciseRecords, setRecordValue, type RecordSession } from '@/tracker/engine/records';
import { STAT_RANGES, comparisonText } from '@/tracker/engine/statistics';
import { chartDataKey, chartTap, TAP_MAX_MS } from '@/tracker/lib/chartTime';
import { metricSeries } from '@/tracker/services/exerciseChart';
import { weightStatsOf } from '@/tracker/services/exerciseStats';
import { liveRecordHits, recordLabel, toastHit, type PriorBests } from '@/tracker/services/liveRecords';
import { recordDetailText, recordValueText, recordWeightText } from '@/tracker/services/recordText';
import { priorBestsFrom } from '@/tracker/services/recordsService';
import { vsLastTimeText } from '@/tracker/services/vsLastTime';
import type { DraftSet, PrevSet } from '@/tracker/store/activeWorkoutStore';

const SRC = join(__dirname, '..', '..', 'src');
const read = (p: string): string => readFileSync(join(SRC, p), 'utf8');

// ---------------------------------------------------------------- B1

let n = 0;
const session = (sets: { weightKg: number; reps: number }[], dateISO = '2026-10-01'): RecordSession => {
  n += 1;
  return { sessionId: `s${n}`, dateISO, startedAt: n, sets };
};
const tick = (weightKg: number, reps: number): DraftSet => {
  n += 1;
  return { key: `k${n}`, weightKg, reps, isWarmup: false, done: true };
};
const W = { logType: 'weight_reps' as LogType, loadMode: 'one' as const, bwShare: 0 };
const ctx = { logType: 'weight_reps' as const, loadMode: 'one' as const, distUnit: 'km' as const, units: 'metric' as const };
/** Bench before today: 100 kg × 5 (estimated 1-rep max 116.7). */
const BENCH: PriorBests = priorBestsFrom(exerciseRecords([session([{ weightKg: 100, reps: 5 }])], W, []), { bwShare: 0 }, [], '2026-10-13')!;
const card = (sets: DraftSet[]) => ({ key: 'c', exerciseId: 'bench', bests: BENCH, sets, logType: 'weight_reps' as LogType });
const popUp = (s: DraftSet): string | null => {
  const hit = toastHit([card([s])], 'c', s.key);
  return hit ? recordLabel(hit, ctx) : null;
};

describe('B1: a lighter set doing many reps is never an estimated 1-rep max record', () => {
  it('reps above 12 count as 12 in the one shared estimate', () => {
    expect(E1RM_MAX_REPS).toBe(12);
    expect(estimatedOneRepMax(70, 25)).toBeCloseTo(98, 6);
    expect(estimatedOneRepMax(70, 12)).toBe(epleyE1rm(70, 12));
    expect(estimatedOneRepMax(100, 5)).toBe(epleyE1rm(100, 5));
    expect(estimatedOneRepMax(100, 1)).toBe(100);
  });

  it('100 × 5, then 70 × 25: no "Estimated 1-rep max · 128.3 kg" pop-up', () => {
    const s = tick(70, 25);
    // (The workout's total, 1,750 kg against 500 kg, is a "Best workout" — a different record,
    // untouched here.) No 1-rep max, heaviest weight, rep record, best set or most reps.
    expect(popUp(s)).toBe('Best workout · 1,750 kg');
    expect(liveRecordHits(card([s])).get(s.key)?.all?.map((h) => h.kind)).toEqual(['best_session']);
    expect(setRecordValue('e1rm', { weightKg: 70, reps: 25 }, W, null)).toBeCloseTo(98, 6);
  });

  it('100 × 5, then 95 × 8 is still a record (120.3 > 116.7)', () => {
    const s = tick(95, 8);
    expect(popUp(s)).toBe('Estimated 1-rep max · 120.3 kg');
  });

  it('the records list and the finish screen agree: 70 × 25 is no event, its best stays 116.7', () => {
    const r = exerciseRecords([session([{ weightKg: 100, reps: 5 }]), session([{ weightKg: 70, reps: 25 }])], W, []);
    expect(r.events.filter((e) => e.kind === 'e1rm')).toEqual([]);
    expect(r.bests.find((b) => b.kind === 'e1rm')?.value).toBeCloseTo(116.67, 1);
  });

  const hist = (sets: { weightKg: number; reps: number }[], dateISO: string, sessionId: string): ExerciseHistoryEntry => ({
    sessionId,
    dateISO,
    volumeKg: sets.reduce((a, s) => a + s.weightKg * s.reps, 0),
    sets: sets.map((s, i) => ({ id: `${sessionId}-${i}`, sessionId, exerciseId: 'bench', setNumber: i + 1, weightKg: s.weightKg, reps: s.reps, isWarmup: false, rpe: null })) as never,
  });
  // Newest first, as the page reads it.
  const HISTORY = [hist([{ weightKg: 70, reps: 25 }], '2026-10-08', 'b'), hist([{ weightKg: 100, reps: 5 }], '2026-10-01', 'a')];

  it('the exercise chart’s 1-rep-max line uses the same estimate (70 × 25 plots 98, not 128.3)', () => {
    expect(metricSeries('e1rm', HISTORY, [], 'metric', 'km').map((p) => Math.round(p.y * 10) / 10)).toEqual([116.7, 98]);
  });

  it('the exercise stats (best 1-rep max, its per-workout line) use it too', () => {
    const stats = weightStatsOf({ id: 'bench' } as never, HISTORY);
    expect(stats.prE1rmKg).toBe(116.7);
    expect(stats.progress.map((p) => p.e1rmKg)).toEqual([116.7, 98]);
  });

  it('"vs last time" compares the same estimate', () => {
    const set = (p: Partial<DraftSet>): DraftSet => ({ key: 's', weightKg: null, reps: null, isWarmup: false, done: true, ...p });
    const prev = (p: Partial<PrevSet>): PrevSet => ({ weightKg: 0, reps: 0, ...p });
    // 60 × 20 last time, 65 × 15 now: both count 12 reps → +8 % (the heavier weight), not +1 %.
    expect(vsLastTimeText(set({ weightKg: 65, reps: 15 }), prev({ weightKg: 60, reps: 20 }), 'weight_reps', 'one', 'metric')).toBe('+8% on last time');
  });

  it('the stored record log’s SQL is the same estimate (one helper, never a copy)', () => {
    expect(E1RM_SQL).toBe(e1rmSql('se'));
    expect(E1RM_SQL).toContain('MIN(se.reps, 12)');
  });

  it('every place that estimates a 1-rep max goes through the shared helper', () => {
    const callers = [
      'tracker/engine/records.ts',
      'tracker/services/exerciseChart.ts',
      'tracker/services/exerciseStats.ts',
      'tracker/services/vsLastTime.ts',
      'services/analytics.ts',
      'db/repos/prRepo.ts',
      'tracker/db/importWrite.ts',
      'tracker/db/exerciseManage.ts',
      'db/seed/history.ts',
    ];
    for (const f of callers) {
      const src = read(f);
      expect(src, f).toContain("from '@/lib/e1rm'");
      expect(src, f).not.toMatch(/\* \(1 \+ r(eps)? \/ 30\)/);
      expect(src, f).not.toMatch(/epleyE1rm\(/);
    }
    // The places that LEAVE long sets out (the year's biggest gain) share the one cap.
    for (const f of ['tracker/engine/progressTop.ts', 'tracker/services/reportsService.ts', 'tracker/services/shareText.ts']) {
      const src = read(f);
      expect(src, f).toContain('E1RM_MAX_REPS');
      expect(src, f).not.toMatch(/const MAX_E1RM_REPS = 12/);
    }
  });
});

// ---------------------------------------------------------------- B2, B3, B9 (Profile chart)

const weeksWithNothing = (): ChartBar[] => chartBars([], 'weeks', '2026-10-13', '2025-01-06');

describe('B2: "No workouts yet" only for a member with no workouts at all', () => {
  it('a member with history and an empty range sees the empty bars and the normal caption', () => {
    const bars = weeksWithNothing();
    expect(bars).toHaveLength(12);
    expect(chartCardBody(bars, 480)).toBe('bars');
    // Header still loading: draw what was read (the bars are true for the range).
    expect(chartCardBody(bars, null)).toBe('bars');
  });
  it('a member with no workouts at all sees the message', () => {
    expect(chartCardBody(weeksWithNothing(), 0)).toBe('none');
    expect(chartCardBody([], null)).toBe('none'); // All time before the first workout: no bars
  });
  it('the card no longer keys the message off the range alone', () => {
    const src = read('tracker/components/profile/HistoryChartCard.tsx');
    expect(src).not.toContain('list.every((b) => b.workouts === 0)');
    expect(src).toContain('chartCardBody(');
    expect(read('app/(tabs)/profile.tsx')).toMatch(/workoutsEver=\{/);
  });
});

describe('B3: the big number waits for the bars', () => {
  it('a dash while loading or after a failed read; the real total once there are bars', () => {
    expect(chartBigNumberText(null, null, 'volume', 'metric')).toBe('—');
    expect(chartBigNumberText(weeksWithNothing(), null, 'volume', 'metric')).toBe('0 kg');
    const bars = chartBars([{ dateISO: '2026-10-12', durationSec: 3600, volumeKg: 5000, reps: 100 }], 'weeks', '2026-10-13');
    expect(chartBigNumberText(bars, null, 'volume', 'metric')).toBe('5,000 kg');
    expect(chartBigNumberText(bars, 0, 'volume', 'metric')).toBe('0 kg');
  });
});

describe('B9: every gap between the Profile bars is the same', () => {
  for (const [plotW, count, scale] of [
    [354.5, 12, 2.625],
    [300, 45, 2.625],
    [333.33, 12, 3],
    [290, 13, 2],
  ] as const) {
    it(`${count} bars in ${plotW} dp at ${scale}×`, () => {
      const l = barLayout(plotW, count, scale);
      const devX = l.xs.map((x) => Math.round(x * scale));
      // Every bar on a whole device pixel…
      l.xs.forEach((x) => expect(Math.abs(x * scale - Math.round(x * scale))).toBeLessThan(1e-6));
      // …the slot a whole number of device pixels…
      expect(Math.abs(l.slot * scale - Math.round(l.slot * scale))).toBeLessThan(1e-6);
      // …so every step (and gap) is identical.
      const steps = new Set(devX.slice(1).map((x, i) => x - devX[i]));
      expect(steps.size).toBe(1);
      // The chart still fills its width: under one device pixel per bar left over, split evenly
      // either side.
      const used = l.slot * count;
      expect(used).toBeLessThanOrEqual(plotW + 1e-9);
      expect(plotW - used).toBeLessThan(count / scale);
      expect(Math.abs(l.left - (plotW - used) / 2)).toBeLessThanOrEqual(1 / scale);
      expect(l.barW).toBeLessThan(l.slot);
    });
  }
  it('the card places bars and tap areas from the one layout', () => {
    const src = read('tracker/components/profile/HistoryChartCard.tsx');
    expect(src).toContain('barLayout(');
    expect(src).not.toContain('plotW / list.length');
  });
});

// ---------------------------------------------------------------- B4, B6, B10 (line chart + bars)

describe('B4: a touch that turns into a page scroll leaves the chart as it was', () => {
  const t = (before: number | null, at: number | null, extra: Partial<Parameters<typeof chartTap>[0]> = {}) =>
    chartTap({ before, at, moved: false, outside: false, now: at, ...extra });
  it('taken over: back to what was picked before the touch', () => {
    expect(t(null, 4, { taken: true })).toBeNull();
    expect(t(2, 4, { taken: true })).toBe(2);
    expect(t(2, 2, { taken: true, heldMs: 30 })).toBe(2);
  });
  it('the chart restores it when the touch is taken', () => {
    const src = read('tracker/components/DateLineChart.tsx');
    expect(src).toMatch(/onResponderTerminate=\{onTaken\}/);
    expect(src).toContain('taken: true');
  });
});

describe('B6: holding the picked point and letting go keeps it', () => {
  const t = (before: number | null, at: number | null, extra: Partial<Parameters<typeof chartTap>[0]> = {}) =>
    chartTap({ before, at, moved: false, outside: false, now: at, ...extra });
  it('a short tap on the picked point clears it; a hold keeps it', () => {
    expect(TAP_MAX_MS).toBe(250);
    expect(t(3, 3, { heldMs: 120 })).toBeNull();
    expect(t(3, 3, { heldMs: 250 })).toBe(3);
    expect(t(3, 3, { heldMs: 900 })).toBe(3);
  });
  it('a hold on another point picks it, as a tap does', () => {
    expect(t(3, 5, { heldMs: 900 })).toBe(5);
  });
  it('the Profile bars: tap shows, it stays; tap again clears; a hold never clears', () => {
    expect(tapBar(null, 4, 80)).toBe(4);
    expect(tapBar(4, 4, 80)).toBeNull();
    expect(tapBar(4, 4, 600)).toBe(4);
    expect(tapBar(4, 6, 600)).toBe(6);
    const src = read('tracker/components/profile/HistoryChartCard.tsx');
    expect(src).toContain('onPressIn');
    expect(src).toMatch(/tapBar\(s, i, /);
  });
  it('the line chart times the touch', () => {
    const src = read('tracker/components/DateLineChart.tsx');
    expect(src).toContain('downAt');
    expect(src).toContain('heldMs');
  });
});

describe('B10: switching what the chart shows clears the pick even when the numbers match', () => {
  const pts = [
    { x: '2026-10-01', y: 100 },
    { x: '2026-10-05', y: 100 },
  ];
  it('the pick key includes what the chart shows', () => {
    expect(chartDataKey(pts, 'heaviest|3m')).not.toBe(chartDataKey(pts, 'e1rm|3m'));
    expect(chartDataKey(pts, 'e1rm|3m')).toBe(chartDataKey(pts.map((p) => ({ ...p })), 'e1rm|3m'));
  });
  it('the exercise chart passes its metric and range', () => {
    expect(read('tracker/components/ExerciseMetricChart.tsx')).toMatch(/resetKey=\{`\$\{metric\}\|\$\{range\}`\}/);
    expect(read('tracker/components/DateLineChart.tsx')).toContain('chartDataKey(data, resetKey)');
  });
});

// ---------------------------------------------------------------- B7, B8 (record wording)

describe('B7: Set records read the way the pop-up does', () => {
  it('weighted: "+10 kg"; dumbbells: "20 kg each"; a plain lift: "100 kg"', () => {
    expect(recordWeightText(10, { ...ctx, logType: 'weighted' })).toBe('+10 kg');
    expect(recordWeightText(20, { ...ctx, loadMode: 'both' })).toBe('20 kg each');
    expect(recordWeightText(100, ctx)).toBe('100 kg');
    expect(recordWeightText(100, { ...ctx, units: 'imperial' })).toMatch(/ lb$/);
  });
  it('the pop-up’s Heaviest weight uses the same words', () => {
    const hit = { kind: 'weight', value: 10, sessionId: 's', dateISO: 'd', set: { weightKg: 10, reps: 5 } } as never;
    expect(recordValueText(hit, { ...ctx, logType: 'weighted' })).toBe(recordWeightText(10, { ...ctx, logType: 'weighted' }));
  });
  it('the Set records rows use it (no bare "N kg")', () => {
    const src = read('tracker/components/ExercisePrRows.tsx');
    expect(src).toContain('recordWeightText(r.weightKg');
    expect(src).not.toContain('value={`${trimNum(kgToDisplay(r.weightKg, units))} ${unit}`}');
  });
});

describe('B8: a rep record that went up in weight AND reps says both', () => {
  const w = { logType: 'weight_reps', loadMode: 'one', distUnit: 'km', units: 'metric' } as const;
  it('40 × 12 before, 60 × 15 now: "more weight and more reps"', () => {
    const hit = { kind: 'rep_record', value: 60, sessionId: 's', dateISO: 'd', set: { weightKg: 60, reps: 15 }, previous: 40, previousSet: { weightKg: 40, reps: 12 } } as never;
    expect(recordDetailText(hit, w)).toBe('more weight and more reps');
  });
  it('the other two stay as they were', () => {
    const same = { kind: 'rep_record', value: 20, sessionId: 's', dateISO: 'd', set: { weightKg: 20, reps: 14 }, previous: 20, previousSet: { weightKg: 20, reps: 12 } } as never;
    expect(recordDetailText(same, w)).toBe('more reps at this weight');
    const heavier = { kind: 'rep_record', value: 22.5, sessionId: 's', dateISO: 'd', set: { weightKg: 22.5, reps: 12 }, previous: 20, previousSet: { weightKg: 20, reps: 12 } } as never;
    expect(recordDetailText(heavier, w)).toBe('more weight for these reps');
  });
  it('from the live rule: 40 × 12 then 60 × 15 is that record', () => {
    const bests = priorBestsFrom(exerciseRecords([session([{ weightKg: 40, reps: 12 }])], W, []), { bwShare: 0 }, [], '2026-10-13')!;
    const s = tick(60, 15);
    const hit = liveRecordHits({ bests, sets: [s], logType: 'weight_reps' }).get(s.key)!;
    const rep = hit.all!.find((h) => h.kind === 'rep_record')!;
    expect(recordDetailText(rep as never, w)).toBe('more weight and more reps');
  });
});

// ---------------------------------------------------------------- B11

describe('B11: the Statistics range says "12 months", as its caption does', () => {
  it('the control’s words', () => {
    expect(STAT_RANGES.map((r) => r.label)).toEqual(['30 days', '3 months', '12 months', 'All time']);
  });
  it('the caption over the tiles names the same period', () => {
    expect(comparisonText('1y', true)).toBe('Last 12 months, against the 12 months before');
  });
});
