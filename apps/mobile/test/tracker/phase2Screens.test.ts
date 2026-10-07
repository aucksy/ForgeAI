/**
 * Phase 2 — the reads behind the screens: search over 400+ exercises, the History /
 * Progress shading, Home's volume and insight, the exercise page for non-weight types,
 * which records are worth showing, and the Hevy import of timed / assisted rows.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { getsTarget, isTimedCardio } from '@/tracker/engine/logTypes';
import { filterExercises, matchRank } from '@/tracker/services/exerciseSearch';
import { bestSetSeriesFor, typedOverview } from '@/tracker/services/exerciseStats';
import { isMeaningfulPr } from '@/tracker/services/finishSummary';
import { importCounting, importedWeight, inferLogType, parseHevyBase64 } from '@/tracker/services/hevyImport';
import { consistencyLevels, withPhase2Volume } from '@/tracker/services/volumeService';
import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';
import type { DashboardData } from '@/types/models';

describe('search ranks the obvious match first (400+ exercises)', () => {
  const mk = (name: string, aliases: string[] = []) => ({
    name,
    aliases,
    equipment: 'barbell' as const,
    muscles: { primary: ['chest' as const], secondary: [] },
  });
  const all = [mk('Incline Dumbbell Press'), mk('Press-Up Hold'), mk('Barbell Bench Press', ['bench']), mk('Overhead Press', ['ohp']), mk('Leg Press')];
  it('starts-with beats word-start beats contains beats alias', () => {
    expect(matchRank(mk('Press-Up Hold'), 'press')).toBe(0);
    expect(matchRank(mk('Leg Press'), 'press')).toBe(1);
    expect(matchRank(mk('Barbell Bench Press', ['bench']), 'ench')).toBe(2);
    expect(matchRank(mk('Overhead Press', ['ohp']), 'ohp')).toBe(3);
    expect(filterExercises(all, { query: 'press', muscle: null, equipment: null }).map((e) => e.name)).toEqual([
      'Press-Up Hold',
      'Barbell Bench Press',
      'Incline Dumbbell Press',
      'Leg Press',
      'Overhead Press',
    ]);
  });
  it('a finer muscle filter matches the MAIN muscle only', () => {
    const lat = { ...mk('Lateral Raise'), muscles: { primary: ['side_delts' as const], secondary: [] } };
    const press = { ...mk('Overhead Press'), muscles: { primary: ['front_delts' as const], secondary: ['side_delts' as const] } };
    expect(filterExercises([lat, press], { query: '', muscle: 'side_delts', equipment: null }).map((e) => e.name)).toEqual(['Lateral Raise']);
  });
});

describe('the History / Progress calendar', () => {
  it('a plank-only or run-only day is still a workout day (before Phase 2: volume 0 → shown as rest)', () => {
    const cells = consistencyLevels('2026-10-01', 3, new Set(['2026-10-02']), new Map([['2026-10-02', 0]]));
    expect(cells.map((c) => c.level)).toEqual([0, 1, 0]);
  });
  it('volume days still split into quartiles', () => {
    const v = new Map([
      ['2026-10-01', 1000],
      ['2026-10-02', 4000],
    ]);
    const cells = consistencyLevels('2026-10-01', 2, new Set(v.keys()), v);
    expect(cells.map((c) => c.level)).toEqual([2, 4]);
  });
});

describe('Home: volume by the one rule, and the insight that talks about it', () => {
  const raw = (insight: string): DashboardData =>
    ({
      insight,
      streakDays: 3,
      weeklyVolumeKg: 9000,
      weeklyVolumeDeltaPct: 0,
      lastWorkout: { dateISO: '2026-10-05', dayType: 'pull', volumeKg: 2000 },
    }) as unknown as DashboardData;
  it('replaces the weekly volume, its change and the last workout volume', () => {
    const d = withPhase2Volume(raw('3-day streak and counting — consistency is what builds physiques.'), [{ volumeKg: 10000 }, { volumeKg: 12000 }], 2800, '2026-10-06');
    expect(d.weeklyVolumeKg).toBe(12000);
    expect(d.weeklyVolumeDeltaPct).toBe(20);
    expect(d.lastWorkout?.volumeKg).toBe(2800);
    expect(d.insight).toContain('up 20%');
  });
  it('keeps a PR or protein insight (they outrank volume), even though the volume line mentions protein', () => {
    const pr = 'New PR this week — your strength curve is pointing exactly where we want it.';
    expect(withPhase2Volume(raw(pr), [{ volumeKg: 1 }, { volumeKg: 5 }], null, '2026-10-06').insight).toBe(pr);
    const protein = "You're only 20 g away from your protein goal — one scoop of whey closes it.";
    expect(withPhase2Volume(raw(protein), [{ volumeKg: 1 }, { volumeKg: 5 }], null, '2026-10-06').insight).toBe(protein);
    const volumeLine = 'Weekly volume is up 12% on last week — earn it back with sleep and protein.';
    expect(withPhase2Volume(raw(volumeLine), [{ volumeKg: 100 }, { volumeKg: 100 }], null, '2026-10-06').insight).not.toBe(volumeLine);
  });
  it('review: "New PR this week" only counts records a member would recognise', () => {
    // The frozen insight counted a first plank ("0 kg") as a PR.
    const pr = 'New PR this week — your strength curve is pointing exactly where we want it.';
    const base = { ...raw(pr), proteinTargetG: 120, proteinTodayG: 120 } as DashboardData;
    const d = withPhase2Volume(base, [{ volumeKg: 100 }, { volumeKg: 100 }], null, '2026-10-06', { recentPrCount: 0 });
    expect(d.insight).not.toContain('PR');
    expect(withPhase2Volume(base, [{ volumeKg: 100 }, { volumeKg: 100 }], null, '2026-10-06', { recentPrCount: 2 }).insight).toContain('2 new PRs');
    const kept = 'Bench Press has been flat for three weeks — time to deload and build back stronger.';
    expect(withPhase2Volume({ ...base, insight: kept }, [{ volumeKg: 1 }, { volumeKg: 1 }], null, '2026-10-06', { recentPrCount: 0 }).insight).toBe(kept);
  });
  it('review: recovery counts body weight on pull-ups and marks the muscles of a plank as worked', () => {
    const sess = (dateISO: string, ex: { muscleGroup: string; volumeKg: number; sets: number }[]) =>
      ({
        id: dateISO,
        dateISO,
        dayType: 'pull',
        totalVolumeKg: ex.reduce((n, e) => n + e.volumeKg, 0),
        exercises: ex.map((e, i) => ({
          exercise: { id: `e${i}`, muscleGroup: e.muscleGroup, secondaryMuscles: [] },
          volumeKg: e.volumeKg,
          sets: Array.from({ length: e.sets }, () => ({ isWarmup: false })),
        })),
      }) as never;
    const d = withPhase2Volume(
      raw('x') as DashboardData,
      [{ volumeKg: 5000 }, { volumeKg: 5000 }, { volumeKg: 3000 }],
      null,
      '2026-10-06',
      { recentDetails: [sess('2026-10-05', [{ muscleGroup: 'back', volumeKg: 2400, sets: 3 }, { muscleGroup: 'core', volumeKg: 0, sets: 3 }])] },
    );
    const worked = d.recovery.muscleFreshness.map((m) => m.muscleGroup).sort();
    expect(worked).toEqual(['back', 'core']); // pull-ups (body weight) and a plank (0 kg) both count as worked
  });
});

describe('the exercise page for non-weight types', () => {
  const h = (dateISO: string, sets: Partial<ExerciseHistoryEntry['sets'][number]>[]): ExerciseHistoryEntry => ({
    sessionId: dateISO,
    dateISO,
    volumeKg: 0,
    sets: sets.map((s, i) => ({ id: `${dateISO}-${i}`, sessionId: dateISO, exerciseId: 'e', setNumber: i + 1, weightKg: 0, reps: 0, isWarmup: false, ...s })),
  });
  it('timed: longest hold and the most in one workout', () => {
    const o = typedOverview('time', [h('2026-10-03', [{ durationSec: 50 }, { durationSec: 45 }]), h('2026-09-30', [{ durationSec: 40 }])], 'km');
    expect(o.tiles.map((t) => [t.label, t.value])).toEqual([
      ['Longest hold', '0:50'],
      ['Most in a workout', '1:35'],
      ['Workouts', '2'],
    ]);
    expect(o.series?.points).toEqual([
      { x: '2026-09-30', y: 40 },
      { x: '2026-10-03', y: 50 },
    ]);
  });
  it('timed cardio (stair climber, jump rope) is not a "hold"', () => {
    const o = typedOverview('time', [h('2026-10-03', [{ durationSec: 1200 }])], 'km', { cardio: true });
    expect(o.tiles[0]).toEqual({ label: 'Longest', value: '20:00' });
    expect(o.series?.title).toBe('Longest');
  });
  it('review: "Best set" uses the same volume rule as the Volume chart', () => {
    const db = bestSetSeriesFor([h('2026-10-03', [{ weightKg: 25, reps: 10 }])], { logType: 'weight_reps', loadMode: 'both', bwShare: 0 }, []);
    expect(db).toEqual([{ dateISO: '2026-10-03', bestSetVolumeKg: 500 }]); // two 25 kg dumbbells, not 250
    const wp = bestSetSeriesFor([h('2026-10-03', [{ weightKg: 10, reps: 8 }])], { logType: 'weighted', loadMode: 'one', bwShare: 1 }, [{ dateISO: '2026-09-01', weightKg: 80 }]);
    expect(wp[0].bestSetVolumeKg).toBe(720); // (80 kg body + 10 kg) × 8, not 80
  });
  it('assisted: least help is the best', () => {
    const o = typedOverview('assisted', [h('2026-10-03', [{ weightKg: -15, reps: 8 }]), h('2026-09-30', [{ weightKg: -25, reps: 10 }])], 'km');
    expect(o.tiles[0]).toEqual({ label: 'Least help', value: '15 kg × 8' });
  });
  it('runs: longest distance and all-time distance (v0.25.1: best pace is a record now)', () => {
    const o = typedOverview('time_distance', [h('2026-10-03', [{ distanceM: 5000, durationSec: 1650 }]), h('2026-09-30', [{ distanceM: 2400, durationSec: 720 }])], 'km');
    expect(o.tiles[0]).toEqual({ label: 'Longest', value: '5 km' });
    expect(o.tiles[1]).toEqual({ label: 'All time', value: '7.4 km' });
    expect(o.tiles.map((t) => t.label)).not.toContain('Best pace');
  });
});

describe('records worth showing', () => {
  it('"0 kg" records from bodyweight / timed sets and an assisted move\'s "heaviest" help are hidden', () => {
    expect(isMeaningfulPr(0, 'reps')).toBe(false);
    expect(isMeaningfulPr(0, null)).toBe(false);
    expect(isMeaningfulPr(-10, 'assisted')).toBe(false);
    expect(isMeaningfulPr(20, 'time')).toBe(false);
    expect(isMeaningfulPr(100, null)).toBe(true);
    expect(isMeaningfulPr(10, 'weighted')).toBe(true);
  });
});

describe('Hevy import: timed, distance, assisted and weighted rows (Phase 2)', () => {
  const set = (o: Partial<{ weightKg: number; reps: number; durationSec: number | null; distanceM: number | null }>) => ({
    weightKg: 0,
    reps: 0,
    durationSec: null,
    distanceM: null,
    ...o,
  });
  it('reads the type from the title and the rows', () => {
    expect(inferLogType('Plank', [set({ durationSec: 45 })])).toBe('time');
    expect(inferLogType('Treadmill', [set({ durationSec: 1800, distanceM: 2400 })])).toBe('time_distance');
    expect(inferLogType('Pull Up (Assisted)', [set({ weightKg: 9, reps: 8 })])).toBe('assisted');
    expect(inferLogType('Chin Up (Weighted)', [set({ weightKg: 30, reps: 4 })])).toBe('weighted');
    expect(inferLogType('Pull Up', [set({ reps: 10 })])).toBe('reps');
    expect(inferLogType('Bench Press (Barbell)', [set({ weightKg: 60, reps: 8 })])).toBe('weight_reps');
  });
  it('keeps the owner\'s Plank and Treadmill rows (before Phase 2 all 5 were skipped)', () => {
    // The exact shape of the owner's export rows (Resources/Hevy Data.csv, 2022).
    const rows = [
      { title: 'Legs 1', start_time: '23 May 2022, 07:51', end_time: '23 May 2022, 10:01', description: null, exercise_title: 'Plank', superset_id: null, exercise_notes: null, set_index: 0, set_type: 'normal', weight_kg: null, reps: null, distance_km: null, duration_seconds: 45, rpe: null },
      { title: 'Legs 1', start_time: '23 May 2022, 07:51', end_time: '23 May 2022, 10:01', description: null, exercise_title: 'Plank', superset_id: null, exercise_notes: null, set_index: 1, set_type: 'normal', weight_kg: null, reps: null, distance_km: null, duration_seconds: 40, rpe: null },
      { title: 'Legs 1', start_time: '17 Jun 2022, 08:17', end_time: '17 Jun 2022, 09:40', description: null, exercise_title: 'Treadmill', superset_id: null, exercise_notes: null, set_index: 0, set_type: 'normal', weight_kg: null, reps: null, distance_km: 2.4, duration_seconds: 1800, rpe: null },
      { title: 'Legs 1', start_time: '17 Jun 2022, 08:17', end_time: '17 Jun 2022, 09:40', description: null, exercise_title: 'Squat (Bodyweight)', superset_id: null, exercise_notes: null, set_index: 0, set_type: 'normal', weight_kg: null, reps: 20, distance_km: null, duration_seconds: null, rpe: null },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Workouts');
    const parsed = parseHevyBase64(XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string);
    expect(parsed.skippedRows).toBe(0);
    expect(parsed.timedRows).toBe(3);
    const plank = parsed.workouts[0].exercises.find((e) => e.title === 'Plank');
    expect(plank?.sets.map((s) => s.durationSec)).toEqual([45, 40]);
    const tread = parsed.workouts[1].exercises.find((e) => e.title === 'Treadmill');
    expect(tread?.sets[0]).toMatchObject({ reps: 0, durationSec: 1800, distanceM: 2400 });
  });

  it('stores Hevy\'s positive help as negative; time rows carry no weight', () => {
    expect(importedWeight('assisted', 9)).toBe(-9);
    expect(importedWeight('assisted', -9)).toBe(-9); // some exports already write it negative
    expect(importedWeight('weighted', 30)).toBe(30);
    // Review: a carried weight on a timed / distance row (farmer's walk) is kept, not zeroed.
    expect(importedWeight('time', 5)).toBe(5);
    expect(importedWeight('time_distance', 40)).toBe(40);
  });
});

describe('which exercises get a Target line', () => {
  it('holds and lifts do; distance work and timed cardio do not ("Hold 20 min · +5 s" on a stair climber)', () => {
    expect(getsTarget('time', ['abs'])).toBe(true); // plank: +5 s rule
    expect(getsTarget('weight_reps', ['chest'])).toBe(true);
    expect(getsTarget('reps', ['lats'])).toBe(true);
    expect(getsTarget('time', ['cardio'])).toBe(false); // stair climber, jump rope
    expect(getsTarget('time_distance', ['cardio'])).toBe(false);
    expect(getsTarget('distance', ['quads'])).toBe(false);
    expect(isTimedCardio('time', ['cardio', 'calves'])).toBe(true);
    expect(isTimedCardio('time_distance', ['cardio'])).toBe(false);
  });
});

describe('a Hevy import reads dumbbell weights as typed (review finding: doubled volume)', () => {
  it('fresh phone: a library dumbbell exercise nobody has logged takes "weight as typed" for good', () => {
    // Lateral Raise counts "each" in the library; the owner typed both dumbbells as one number in Hevy.
    expect(importCounting({ loadMode: null, catalogKey: 'lateral_raise' }, false)).toEqual({ freeze: true, setMode: null });
  });
  it('an exercise already logged "each" in ForgeAI keeps it; only the imported sets read as typed', () => {
    expect(importCounting({ loadMode: null, catalogKey: 'lateral_raise' }, true)).toEqual({ freeze: false, setMode: 'one' });
    expect(importCounting({ loadMode: 'both', catalogKey: 'lateral_raise' }, false)).toEqual({ freeze: false, setMode: 'one' });
  });
  it('a barbell or an exercise already "as typed" needs nothing', () => {
    expect(importCounting({ loadMode: null, catalogKey: 'barbell_bench_press' }, false)).toEqual({ freeze: false, setMode: null });
    expect(importCounting({ loadMode: 'one', catalogKey: 'lateral_raise' }, false)).toEqual({ freeze: false, setMode: null });
    expect(importCounting({ loadMode: null, catalogKey: null }, false)).toEqual({ freeze: false, setMode: null });
  });
});

describe('chat logging follows the exercise type (review finding)', () => {
  it('"assisted pull up 20kg x 8" stores 20 kg of HELP (−20), not 20 kg added', async () => {
    const { chatSets } = await import('@/ai/tools');
    expect(chatSets('assisted', [{ weightKg: 20, reps: 8 }])).toEqual([{ weightKg: -20, reps: 8 }]);
    expect(chatSets('weight_reps', [{ weightKg: 60, reps: 8 }])).toEqual([{ weightKg: 60, reps: 8 }]);
  });
  it('"plank 3x45" logs nothing on a timed exercise, and the reply says where to log it', async () => {
    const { chatSets, skippedNote } = await import('@/ai/tools');
    expect(chatSets('time', [{ weightKg: 3, reps: 45 }])).toBeNull();
    expect(chatSets('time_distance', [{ weightKg: 0, reps: 1 }])).toBeNull();
    expect(skippedNote(['Plank'])).toBe('Plank is logged by time or distance — log it from the workout screen.');
    expect(skippedNote([])).toBe('');
  });
});

describe('records a member would recognise (review finding)', () => {
  it('drops "Plank 0 kg" and negative assisted records; keeps real lifts', async () => {
    const { keepMeaningful, recentPrCount } = await import('@/tracker/services/records');
    const prs = [
      { exerciseId: 'bench', value: 100, dateISO: '2026-10-05' },
      { exerciseId: 'plank', value: 0, dateISO: '2026-10-05' },
      { exerciseId: 'assist', value: -24, dateISO: '2026-10-05' },
      { exerciseId: 'run', value: 20, dateISO: '2026-10-04' },
    ];
    const types = new Map([['bench', 'weight_reps'], ['plank', 'time'], ['assist', 'assisted'], ['run', 'time_distance']]);
    expect(keepMeaningful(prs, types).map((p) => p.exerciseId)).toEqual(['bench']);
    expect(recentPrCount(keepMeaningful(prs, types), '2026-10-06')).toBe(1);
    expect(recentPrCount([{ exerciseId: 'a', dateISO: '2026-09-29' }], '2026-10-06')).toBe(0); // 8 days ago
  });
});

describe('your own exercise video (review finding)', () => {
  it('a gallery clip over 30 s or over the size cap is refused; photos and short clips are fine', async () => {
    const { mediaProblem } = await import('@/tracker/services/exerciseMedia');
    expect(mediaProblem({ type: 'video', duration: 95_000, fileSize: 40e6 })).toBe('video-too-long'); // a 95 s film
    expect(mediaProblem({ type: 'video', duration: 20_000, fileSize: 300e6 })).toBe('video-too-big'); // 20 s of 4K
    expect(mediaProblem({ type: 'video', duration: 30_400, fileSize: 30e6 })).toBeNull();
    expect(mediaProblem({ type: 'image', fileSize: 300e6 })).toBeNull();
  });
});
