/**
 * Phase 3 — more record types: most reps, best set, best session, longest time, longest
 * distance (plus heaviest weight and best 1-rep max). One rule (`engine/records`) feeds the
 * live pop-up, the finish screen, the exercise page, Progress, the reports and the share
 * picture.
 *
 * Before Phase 3 only heaviest weight and 1-rep max existed: 15 pull-ups after a best of 12,
 * a 1:30 plank after 1:00 or a 5 km run after 3 km raised nothing anywhere. The "before"
 * tests below fail on that code.
 */
import { describe, expect, it } from 'vitest';

import { exerciseRecords, recordKindsFor, RECORD_LABEL, type RecordSession } from '@/tracker/engine/records';
import type { VolumeRule } from '@/tracker/engine/volume';
import { tilesBesideRecords, recordSessionsFromHistory } from '@/tracker/services/exerciseStats';
import { orderSessionRecords } from '@/tracker/services/finishSummary';
import { liveRecordFlags, liveRecordHits, recordLabel, type PriorBests } from '@/tracker/services/liveRecords';
import { groupByExercise, recordDetailText, recordValueText, withMonthHeadings } from '@/tracker/services/recordText';
import { flattenEvents, groupRecordSessions, priorBestsFrom, type RecordEventRow } from '@/tracker/services/recordsService';
import type { DraftSet } from '@/tracker/store/activeWorkoutStore';
import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';

const W: VolumeRule = { logType: 'weight_reps', loadMode: 'one', bwShare: 0 };
const REPS: VolumeRule = { logType: 'reps', loadMode: 'one', bwShare: 1 };
const TIME: VolumeRule = { logType: 'time', loadMode: 'one', bwShare: 0 };
const RUN: VolumeRule = { logType: 'time_distance', loadMode: 'one', bwShare: 0 };

let n = 0;
function session(dateISO: string, sets: Partial<RecordSession['sets'][number]>[], startedAt?: number): RecordSession {
  n += 1;
  return {
    sessionId: `s${n}`,
    dateISO,
    startedAt: startedAt ?? n,
    sets: sets.map((s) => ({ weightKg: 0, reps: 0, ...s })),
  };
}

describe('which records an exercise keeps', () => {
  it('follows how it is logged', () => {
    expect(recordKindsFor('weight_reps')).toEqual(['weight', 'e1rm', 'best_set', 'best_session']);
    expect(recordKindsFor('weighted')).toEqual(['weight', 'best_set', 'reps', 'best_session']);
    expect(recordKindsFor('reps')).toEqual(['reps', 'best_session']);
    expect(recordKindsFor('assisted')).toEqual(['reps', 'best_session']);
    expect(recordKindsFor('time')).toEqual(['duration']);
    expect(recordKindsFor('distance')).toEqual(['distance']);
    expect(recordKindsFor('time_distance')).toEqual(['distance', 'duration']);
  });
  it('names them in plain words', () => {
    expect(Object.values(RECORD_LABEL)).toEqual([
      'Heaviest weight',
      'Best 1-rep max',
      'Best set',
      'Best session',
      'Most reps',
      'Longest time',
      'Longest distance',
    ]);
  });
});

describe('the record rule', () => {
  it('a first workout sets the bests but announces nothing', () => {
    const r = exerciseRecords([session('2026-09-01', [{ weightKg: 60, reps: 8 }])], W, []);
    expect(r.events).toEqual([]);
    expect(r.bests.map((b) => [b.kind, b.value])).toEqual([
      ['weight', 60],
      ['e1rm', 76],
      ['best_set', 480],
      ['best_session', 480],
    ]);
  });

  it('a heavier set, a better set and a bigger session are each their own record', () => {
    const r = exerciseRecords(
      [
        session('2026-09-01', [{ weightKg: 60, reps: 8 }, { weightKg: 60, reps: 8 }]),
        // heavier (65 > 60) but fewer reps: heaviest only (1RM 75.8 < 76)
        session('2026-09-04', [{ weightKg: 65, reps: 5 }]),
        // 62.5 × 10 = 625 > 480: best set; 3 sets of it beats the 960 session
        session('2026-09-08', [{ weightKg: 62.5, reps: 10 }, { weightKg: 62.5, reps: 10 }, { weightKg: 62.5, reps: 10 }]),
      ],
      W,
      [],
    );
    expect(r.events.map((e) => [e.dateISO, e.kind, e.value, e.previous])).toEqual([
      ['2026-09-04', 'weight', 65, 60],
      ['2026-09-08', 'e1rm', 62.5 * (1 + 10 / 30), 60 * (1 + 8 / 30)],
      ['2026-09-08', 'best_set', 625, 480],
      ['2026-09-08', 'best_session', 1875, 960],
    ]);
  });

  it('an equal best is not a record, and pounds-converted weights do not wobble', () => {
    const lb = 61.2244898;
    const r = exerciseRecords([session('2026-09-01', [{ weightKg: lb, reps: 5 }]), session('2026-09-03', [{ weightKg: lb, reps: 5 }])], W, []);
    expect(r.events).toEqual([]);
  });

  it('each workout is judged only against the ones before it, whatever order they arrive in', () => {
    const later = session('2026-09-10', [{ weightKg: 70, reps: 5 }], 300);
    const earlier = session('2026-09-01', [{ weightKg: 60, reps: 5 }], 100);
    const r = exerciseRecords([later, earlier], W, []);
    expect(r.events.filter((e) => e.kind === 'weight').map((e) => e.sessionId)).toEqual([later.sessionId]);
  });

  it('best set counts both dumbbells when the weight is "each"', () => {
    const db: VolumeRule = { logType: 'weight_reps', loadMode: 'both', bwShare: 0 };
    const r = exerciseRecords([session('2026-09-01', [{ weightKg: 25, reps: 10 }])], db, []);
    expect(r.bests.find((b) => b.kind === 'best_set')?.value).toBe(500);
  });

  it('before Phase 3: more pull-ups than ever was not a record — now "Most reps"', () => {
    const r = exerciseRecords(
      [session('2026-09-01', [{ reps: 12 }, { reps: 10 }]), session('2026-09-05', [{ reps: 15 }, { reps: 9 }])],
      REPS,
      [{ dateISO: '2026-08-01', weightKg: 80 }],
    );
    expect(r.events.map((e) => [e.kind, e.value, e.previous])).toEqual([
      ['reps', 15, 12],
      ['best_session', 24, 22],
    ]);
  });

  it('before Phase 3: a longer plank was not a record — now "Longest time"', () => {
    const r = exerciseRecords([session('2026-09-01', [{ durationSec: 60 }]), session('2026-09-03', [{ durationSec: 90 }, { durationSec: 45 }])], TIME, []);
    expect(r.events.map((e) => [e.kind, e.value])).toEqual([['duration', 90]]);
  });

  it('before Phase 3: a longer run was not a record — now "Longest distance" (and time)', () => {
    const r = exerciseRecords(
      [session('2026-09-01', [{ distanceM: 3000, durationSec: 1000 }]), session('2026-09-04', [{ distanceM: 5000, durationSec: 1650 }])],
      RUN,
      [],
    );
    expect(r.events.map((e) => [e.kind, e.value])).toEqual([
      ['distance', 5000],
      ['duration', 1650],
    ]);
  });

  it('a weighted pull-up: heaviest belt weight, most reps, best set with body weight', () => {
    const wp: VolumeRule = { logType: 'weighted', loadMode: 'one', bwShare: 1 };
    const r = exerciseRecords([session('2026-09-01', [{ weightKg: 10, reps: 8 }]), session('2026-09-03', [{ weightKg: 15, reps: 6 }])], wp, [
      { dateISO: '2026-08-01', weightKg: 80 },
    ]);
    expect(r.bests.map((b) => [b.kind, b.value])).toEqual([
      ['weight', 15],
      ['best_set', 720], // (80 + 10) × 8 beats (80 + 15) × 6 = 570
      ['reps', 8],
      ['best_session', 720],
    ]);
    expect(r.events.map((e) => e.kind)).toEqual(['weight']);
  });

  it('heaviest weight names the set with more reps when two tie', () => {
    const r = exerciseRecords([session('2026-09-01', [{ weightKg: 80, reps: 3 }, { weightKg: 80, reps: 5 }])], W, []);
    expect(r.bests[0].set?.reps).toBe(5);
  });
});

// ------------------------------------------------------------------ live pop-up
function draft(over: Partial<DraftSet>): DraftSet {
  n += 1;
  return { key: `k${n}`, weightKg: null, reps: null, isWarmup: false, done: true, ...over };
}

describe('the live pop-up knows every kind', () => {
  const pullBests: PriorBests = { weightKg: 0, e1rm: 0, by: { reps: 12, best_session: 30 }, bwShare: 1, bodyweightKg: 80 };

  it('before Phase 3: 15 pull-ups after a best of 12 said nothing — now "Most reps"', () => {
    const s = draft({ weightKg: 0, reps: 15 });
    const hits = liveRecordHits({ bests: pullBests, sets: [s], logType: 'reps' });
    expect(hits.get(s.key)?.kind).toBe('reps');
    expect(recordLabel(hits.get(s.key)!, { logType: 'reps', loadMode: 'one', distUnit: 'km' })).toBe('Most reps · 15 reps');
  });

  it('best session fires once, on the set that passes it', () => {
    const a = draft({ reps: 12 });
    const b = draft({ reps: 11 });
    const c = draft({ reps: 10 }); // 12 + 11 + 10 = 33 > 30
    const d = draft({ reps: 9 });
    const flags = liveRecordFlags({ bests: pullBests, sets: [a, b, c, d], logType: 'reps' });
    expect([...flags.entries()]).toEqual([[c.key, 'best_session']]);
  });

  it('a timed hold beats the longest time', () => {
    const s = draft({ durationSec: 95 });
    const hits = liveRecordHits({ bests: { weightKg: 0, e1rm: 0, by: { duration: 90 } }, sets: [s], logType: 'time' });
    expect(recordLabel(hits.get(s.key)!, { logType: 'time', loadMode: 'one', distUnit: 'km' })).toBe('Longest time · 1:35');
  });

  it('a kind never logged before announces nothing (first time is not news)', () => {
    const s = draft({ distanceM: 5000, durationSec: 1500 });
    const hits = liveRecordHits({ bests: { weightKg: 0, e1rm: 0, by: { duration: 1200 } }, sets: [s], logType: 'time_distance' });
    expect(hits.get(s.key)?.kind).toBe('duration');
  });

  it('a heavier set names "Heaviest weight" even when it also beats the best set', () => {
    const s = draft({ weightKg: 100, reps: 8 });
    const hits = liveRecordHits({
      bests: { weightKg: 95, e1rm: 120, by: { weight: 95, e1rm: 120, best_set: 700, best_session: 2000 } },
      sets: [s],
      logType: 'weight_reps',
    });
    expect(hits.get(s.key)?.kind).toBe('weight');
  });

  it('assisted help is typed positive and never counts as weight', () => {
    const s = draft({ weightKg: 20, reps: 10 });
    const hits = liveRecordHits({ bests: { weightKg: 0, e1rm: 0, by: { reps: 8, best_session: 30 } }, sets: [s], logType: 'assisted' });
    expect(hits.get(s.key)).toEqual({ kind: 'reps', value: 10, set: { weightKg: -20, reps: 10, durationSec: null, distanceM: null, loadMode: 'one' } });
  });

  it('the bests come from the same rule as the finish screen', () => {
    const records = exerciseRecords([session('2026-09-01', [{ reps: 12 }, { reps: 10 }])], REPS, []);
    expect(priorBestsFrom(records, { bwShare: 1 }, [{ dateISO: '2026-09-01', weightKg: 81 }], '2026-10-01')).toEqual({
      weightKg: 0,
      e1rm: 0,
      by: { reps: 12, best_session: 22 },
      bwShare: 1,
      bodyweightKg: 81,
    });
    expect(priorBestsFrom({ bests: [], events: [] }, { bwShare: 0 }, [], '2026-10-01')).toBeNull();
  });
});

// ------------------------------------------------------------------ words and lists
describe('records in words', () => {
  const w = { logType: 'weight_reps', loadMode: 'one', distUnit: 'km' } as const;
  const hit = (over: object) => ({ sessionId: 's', dateISO: '2026-09-01', set: null, ...over }) as never;
  it('reads like a member would say it', () => {
    expect(recordValueText(hit({ kind: 'weight', value: 85, set: { weightKg: 85, reps: 3 } }), w)).toBe('85 kg');
    expect(recordDetailText(hit({ kind: 'weight', value: 85, set: { weightKg: 85, reps: 3 } }), w)).toBe('3 reps');
    expect(recordValueText(hit({ kind: 'best_set', value: 680, set: { weightKg: 85, reps: 8 } }), w)).toBe('85 kg × 8');
    expect(recordDetailText(hit({ kind: 'best_set', value: 680, set: { weightKg: 85, reps: 8 } }), w)).toBe('680 kg in one set');
    expect(recordValueText(hit({ kind: 'best_session', value: 12480 }), w)).toBe('12,480 kg');
    expect(recordValueText(hit({ kind: 'best_session', value: 46 }), { ...w, logType: 'reps' })).toBe('46 reps');
    expect(recordValueText(hit({ kind: 'duration', value: 90 }), { ...w, logType: 'time' })).toBe('1:30');
    expect(recordValueText(hit({ kind: 'distance', value: 5000 }), { ...w, logType: 'distance' })).toBe('5 km');
    expect(recordValueText(hit({ kind: 'weight', value: 30, set: { weightKg: 30, reps: 8 } }), { ...w, loadMode: 'both' })).toBe('30 kg each');
    expect(recordValueText(hit({ kind: 'weight', value: 10, set: { weightKg: 10, reps: 8 } }), { ...w, logType: 'weighted' })).toBe('+10 kg');
    expect(recordDetailText(hit({ kind: 'reps', value: 10, set: { weightKg: -20, reps: 10 } }), { ...w, logType: 'assisted' })).toBe('with 20 kg of help');
  });

  it('the records list puts a heading at each new month', () => {
    const rows = [
      { dateISO: '2026-10-02', exerciseId: 'a', kind: 'reps', sessionId: '1' },
      { dateISO: '2026-10-01', exerciseId: 'b', kind: 'weight', sessionId: '2' },
      { dateISO: '2026-09-28', exerciseId: 'a', kind: 'reps', sessionId: '3' },
    ];
    expect(withMonthHeadings(rows).map((i) => (i.kind === 'month' ? i.title : i.row.sessionId))).toEqual(['October 2026', '1', '2', 'September 2026', '3']);
  });
});

describe('a workout\'s records on the finish screen', () => {
  const row = (exerciseId: string, kind: RecordEventRow['kind'], value: number, set: { weightKg: number; reps: number } | null): RecordEventRow => ({
    kind,
    value,
    previous: 1,
    sessionId: 's1',
    dateISO: '2026-10-06',
    set,
    exerciseId,
    exerciseName: exerciseId === 'b' ? 'Bench Press' : 'Pull Up',
    info: { logType: exerciseId === 'b' ? 'weight_reps' : 'reps', loadMode: 'one', distUnit: 'km' },
  });

  it('follow the workout\'s exercise order, then the record order; the coach line keeps heaviest and 1RM', () => {
    const { records, prs } = orderSessionRecords(
      [row('p', 'reps', 15, { weightKg: 0, reps: 15 }), row('b', 'best_set', 680, { weightKg: 85, reps: 8 }), row('b', 'weight', 85, { weightKg: 85, reps: 8 }), row('b', 'e1rm', 107.66, { weightKg: 85, reps: 8 })],
      ['b', 'p'],
    );
    expect(records.map((r) => `${r.exerciseId}:${r.kind}`)).toEqual(['b:weight', 'b:e1rm', 'b:best_set', 'p:reps']);
    expect(prs).toEqual([
      { exerciseName: 'Bench Press', kind: 'weight', value: 85, weightKg: 85, reps: 8 },
      { exerciseName: 'Bench Press', kind: 'e1rm', value: 107.7, weightKg: 85, reps: 8 },
    ]);
    expect(groupByExercise(records).map((g) => [g.exerciseName, g.rows.length])).toEqual([
      ['Bench Press', 3],
      ['Pull Up', 1],
    ]);
  });
});

describe('reading records from the database rows', () => {
  it('groups sets into each exercise\'s workouts, and lists events newest first', () => {
    const rows = [
      { session_id: 'a', exercise_id: 'x', weight_kg: 50, reps: 5, duration_sec: null, distance_m: null, load_mode: null, date_iso: '2026-09-01', started_at: 1 },
      { session_id: 'a', exercise_id: 'x', weight_kg: 55, reps: 5, duration_sec: null, distance_m: null, load_mode: 'both', date_iso: '2026-09-01', started_at: 1 },
      { session_id: 'b', exercise_id: 'x', weight_kg: 60, reps: 5, duration_sec: null, distance_m: null, load_mode: null, date_iso: '2026-09-05', started_at: 2 },
    ];
    const g = groupRecordSessions(rows);
    expect(g.get('x')?.map((s) => [s.sessionId, s.sets.length])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
    expect(g.get('x')?.[0].sets[1].loadMode).toBe('both');

    const info = { id: 'x', name: 'Squat', logType: 'weight_reps', loadMode: 'one', bwShare: 0, distUnit: 'km' } as never;
    const events = flattenEvents(
      new Map([
        ['x', { info, records: exerciseRecords(g.get('x') ?? [], { logType: 'weight_reps', loadMode: 'one', bwShare: 0 }, []) }],
      ]),
    );
    expect(events[0].exerciseName).toBe('Squat');
    expect(events.every((e) => e.dateISO === '2026-09-05')).toBe(true);
  });
});

describe('the exercise page', () => {
  it('reads its newest-first history in time order', () => {
    const h = (sessionId: string, dateISO: string, reps: number): ExerciseHistoryEntry => ({
      sessionId,
      dateISO,
      volumeKg: 0,
      sets: [{ id: sessionId, sessionId, exerciseId: 'p', setNumber: 1, weightKg: 0, reps, isWarmup: false }],
    });
    // newest first, as the page reads it
    const sessions = recordSessionsFromHistory([h('new', '2026-09-05', 15), h('old', '2026-09-01', 12)]);
    const r = exerciseRecords(sessions, REPS, []);
    expect(r.events.map((e) => [e.sessionId, e.kind])).toEqual([
      ['new', 'reps'],
      ['new', 'best_session'],
    ]);
  });

  it('tiles no longer repeat what the Records card shows', () => {
    const tiles = [
      { label: 'Longest hold', value: '1:30' },
      { label: 'Most in a workout', value: '3:00' },
      { label: 'Workouts', value: '4' },
    ];
    expect(tilesBesideRecords(tiles, 'time').map((t) => t.label)).toEqual(['Most in a workout', 'Workouts']);
    expect(tilesBesideRecords([{ label: 'Least help', value: '15 kg × 8' }, { label: 'Most reps', value: '10' }], 'assisted').map((t) => t.label)).toEqual([
      'Least help',
    ]);
  });
});
