/**
 * 13 Oct 2026, batch 2 (owner's real-phone screenshots):
 *  - A1 the exercise page's "Last time" as the workout page's set table (W / 1 / D / F, RPE);
 *  - A2 one tap on a chart keeps its point; a second tap on it, or outside the plot, clears it;
 *    new data clears it;
 *  - A3 chart numbers grouped ("1,330 kg"); A5 the chart's metric words;
 *  - B "Create" always in the add-exercise pickers' top bar; a routine's new exercise joins it;
 *  - D1 the "Set type" sheet's ✓ shows once something changed; D2 the RPE grid is 3 × 3.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { TrackedSetEntry } from '@/tracker/db/exerciseHistory';
import { chartDataKey, chartTap } from '@/tracker/lib/chartTime';
import { RPE_CHOICES, rpeGrid } from '@/tracker/lib/rpe';
import { setChoiceChanged, setChoiceOf } from '@/tracker/lib/sheetChange';
import { chartAxisNumber, chartNumber, metricValueText } from '@/tracker/services/exerciseChart';
import { lastTimeRows } from '@/tracker/services/workoutDetail';

const read = (p: string): string => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

const s = (id: string, n: number, o: Partial<TrackedSetEntry> = {}): TrackedSetEntry => ({
  id,
  sessionId: 'w',
  exerciseId: 'e',
  setNumber: n,
  weightKg: 20,
  reps: 10,
  isWarmup: false,
  ...o,
});

describe('A1: "Last time" is the workout page’s set table', () => {
  it('warm-ups first as W, working sets numbered, drop / failure marked, RPE shown, in set order', () => {
    const working = [s('a', 3, { weightKg: 60, reps: 8, rpe: 8 }), s('b', 4, { weightKg: 60, reps: 6 }), s('c', 5, { weightKg: 40, reps: 10, setType: 'drop' }), s('d', 6, { weightKg: 50, reps: 5, setType: 'failure' })];
    const warm = [s('w2', 2, { weightKg: 40, reps: 5, isWarmup: true }), s('w1', 1, { weightKg: 20, reps: 10, isWarmup: true })];
    const rows = lastTimeRows(working, warm, { logType: 'weight_reps', loadMode: 'one', distUnit: 'km' }, 'metric');
    expect(rows.map((r) => [r.mark, r.text, r.rpe])).toEqual([
      ['W', '20 kg × 10', null],
      ['W', '40 kg × 5', null],
      ['1', '60 kg × 8', '@8'],
      ['2', '60 kg × 6', null],
      ['D', '40 kg × 10', null],
      ['F', '50 kg × 5', null],
    ]);
    expect(rows[0].warmup).toBe(true);
  });

  it('in the exercise’s own words (bodyweight reps, a timed hold)', () => {
    expect(lastTimeRows([s('a', 1, { weightKg: 0, reps: 12 })], [], { logType: 'reps', loadMode: 'one', distUnit: 'km' }, 'metric')[0].text).toBe('12 reps');
    expect(lastTimeRows([s('a', 1, { weightKg: 0, reps: 0, durationSec: 45 })], [], { logType: 'time', loadMode: 'one', distUnit: 'km' }, 'metric')[0].text).toBe('0:45');
  });

  it('the page uses the shared table, not the run-on line', () => {
    const page = read('src/app/exercise/[id].tsx');
    expect(page).toContain('<SetTable rows={last.rows} logType={shownAs} />');
    expect(page).not.toContain('lastTimeLine(');
    expect(read('src/tracker/components/WorkoutDetail.tsx')).toContain('<SetTable rows={rows} logType={lt} />');
  });
});

describe('A2: a tapped point stays', () => {
  const tap = (before: number | null, at: number | null, extra: Partial<Parameters<typeof chartTap>[0]> = {}) =>
    chartTap({ before, at, moved: false, outside: false, now: at, ...extra });

  it('one tap picks a point and keeps it after the finger lifts', () => {
    expect(tap(null, 3)).toBe(3);
  });
  it('a tap on another point moves it; a drag keeps where it ended', () => {
    expect(tap(3, 5)).toBe(5);
    expect(tap(3, 3, { moved: true, now: 7 })).toBe(7);
  });
  it('a second tap on the same point, or a tap outside the plot, clears it', () => {
    expect(tap(3, 3)).toBeNull();
    expect(tap(3, null, { outside: true })).toBeNull();
  });
  it('new data (another range or metric) is a new key; the same points rebuilt are not', () => {
    const a = [
      { x: '2026-10-01', y: 100 },
      { x: '2026-10-05', y: 102.5 },
    ];
    expect(chartDataKey(a.map((p) => ({ ...p })))).toBe(chartDataKey(a));
    expect(chartDataKey([...a, { x: '2026-10-09', y: 105 }])).not.toBe(chartDataKey(a));
    expect(chartDataKey([a[0], { ...a[1], y: 110 }])).not.toBe(chartDataKey(a));
  });
  it('the chart no longer clears on release', () => {
    const src = read('src/tracker/components/DateLineChart.tsx');
    expect(src).toContain('onResponderRelease={onUp}');
    expect(src).not.toContain('onResponderRelease={clear}');
  });
});

describe('A3: numbers grouped the phone’s way', () => {
  it('"1,330 kg" in the readout; axis labels grouped, short only from 100,000', () => {
    expect(metricValueText('workoutLifted', 1330, 'metric', 'km')).toBe('1,330 kg');
    expect(metricValueText('heaviest', 102.5, 'metric', 'km')).toBe('102.5 kg');
    expect(chartNumber(12480)).toBe('12,480');
    expect(chartAxisNumber(12500)).toBe('12,500');
    expect(chartAxisNumber(125000)).toBe('125k');
    expect(chartAxisNumber(82.5)).toBe('82.5');
  });
  it('the range control sits inside the chart’s card, under its title row', () => {
    const src = read('src/tracker/components/ExerciseMetricChart.tsx');
    expect(src.indexOf('<SegmentedControl')).toBeLessThan(src.indexOf('<DateLineChart'));
  });
});

describe('B: "Create" is always in the add-exercise pickers', () => {
  it('in a workout (not when swapping) and in a routine, prefilled with the search', () => {
    const w = read('src/app/session/add-exercise.tsx');
    expect(w).toContain('{swapKey ? null : <HeaderCreateButton onPress={() => create(typed)} />}');
    expect(w).toContain('onQueryChange={setTyped}');
    const r = read('src/app/routines/add-exercise.tsx');
    expect(r).toContain('<HeaderCreateButton onPress={() => create(typed)} />');
    expect(r).toContain("params: { for: 'routine', dayId, name: name.trim() }");
    expect(r).toContain('onCreate={create}');
  });
  it('the form adds a routine’s new exercise to that routine on Save', () => {
    const f = read('src/app/library/new.tsx');
    expect(f).toContain("params.for === 'routine'");
    expect(f).toMatch(/addExerciseToRoutine\(forRoutine, id\)/);
    expect(f).toContain("router.dismissTo({ pathname: '/routines/[id]', params: { id: forRoutine } })");
  });
});

describe('D: the "Set type" sheet', () => {
  it('✓ shows once the type or the RPE changed; back to the start = nothing changed', () => {
    const start = setChoiceOf({ isWarmup: false, setType: 'normal', rpe: null });
    expect(setChoiceChanged(start, setChoiceOf({ isWarmup: false, setType: 'normal', rpe: null }))).toBe(false);
    expect(setChoiceChanged(start, setChoiceOf({ isWarmup: false, setType: 'drop', rpe: null }))).toBe(true);
    expect(setChoiceChanged(start, setChoiceOf({ isWarmup: true, rpe: null }))).toBe(true);
    expect(setChoiceChanged(start, setChoiceOf({ isWarmup: false, rpe: 8 }))).toBe(true);
    expect(setChoiceChanged(null, start)).toBe(false);
  });
  it('the sheet passes it, and the ✓ is a 48 dp "Done" beside the ×', () => {
    expect(read('src/tracker/components/SetTypeSheet.tsx')).toContain('onDone={onClose} changed={changed}');
    const done = read('src/tracker/components/DoneSheet.tsx');
    expect(done).toContain('accessibilityLabel="Done"');
    expect(done.indexOf('accessibilityLabel="Done"')).toBeLessThan(done.indexOf('<Icon name="close"'));
    // In step with the frozen shared sheet.
    const sheet = read('src/components/ui/Sheet.tsx');
    for (const piece of ["maxHeight: '90%'", 'noteSheetClosed()', 'keyboardRoom(windowH, kb)', 'statusBarTranslucent', 'scrollEnabled={overflows}']) {
      expect(sheet, piece).toContain(piece);
      expect(done, piece).toContain(piece);
    }
  });
  it('the nine RPE choices are an even 3 × 3 grid', () => {
    const g = rpeGrid();
    expect(g).toEqual([
      [6, 6.5, 7],
      [7.5, 8, 8.5],
      [9, 9.5, 10],
    ]);
    expect(g.flat()).toEqual([...RPE_CHOICES]);
    expect(g.every((row) => row.length === 3)).toBe(true);
  });
});

describe('the Target row (13 Oct 2026, owner: the pill sat low, the ⓘ high)', () => {
  it('◎, the words, the pill and ⓘ share one vertical centre with even gaps', () => {
    const card = read('src/tracker/components/ExerciseLogCard.tsx');
    const at = card.indexOf('TG-10: the whole Target');
    const row = card.slice(at, card.indexOf('{showWhy && target.reason', at));
    expect(row).toContain("flexDirection: 'row', alignItems: 'center', gap: space.sm");
    expect(row).not.toContain("alignItems: 'flex-start'");
    expect(row).not.toContain('paddingTop');
  });
});
