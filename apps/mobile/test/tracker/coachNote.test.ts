import { describe, expect, it } from 'vitest';

import { FEATURES } from '@/lib/features';
import { buildSessionNote, noteAllowed } from '@/tracker/services/coachNote';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import type { RecordEventRow } from '@/tracker/services/recordsService';
import type { SessionDetail } from '@/types/models';

// buildSessionNote reads only a handful of fields; build minimal fixtures and cast
// so we don't have to hand-craft a full SessionDetail row.
function data(over: Partial<SessionSummaryData> & { dayType?: string } = {}): SessionSummaryData {
  const { dayType = 'push', ...rest } = over;
  return {
    session: { dayType, dateISO: '2026-07-20' },
    durationSec: 0,
    totalVolumeKg: 0,
    workingSetCount: 12,
    exerciseCount: 4,
    prs: [],
    records: [],
    muscles: [],
    setMeta: {},
    ...rest,
  } as unknown as SessionSummaryData;
}

const prev = (totalVolumeKg: number): SessionDetail => ({ totalVolumeKg } as unknown as SessionDetail);

function rec(exerciseName: string, kind: RecordEventRow['kind'], value: number, set: { weightKg: number; reps: number } | null = null): RecordEventRow {
  return {
    kind,
    value,
    previous: null,
    sessionId: 's',
    dateISO: '2026-07-20',
    set,
    exerciseId: exerciseName.toLowerCase().replace(/\s+/g, '-'),
    exerciseName,
    info: { logType: kind === 'reps' ? 'reps' : 'weight_reps', loadMode: 'one', distUnit: 'km' },
  } as unknown as RecordEventRow;
}

/** Words that would make the note a coach or a nutritionist. */
const COACHY = /\b(PRs?|volume|moved|protein|sleep|eat|recover|growth|keep feeding|keep stacking|progressive overload)\b/i;

describe('finish note (audit Phase 7: facts, not a coach)', () => {
  it('an easy week is lighter on purpose, not "down on last time"', () => {
    const note = buildSessionNote(data({ easyWeek: true, totalVolumeKg: 1500, workingSetCount: 7 }), prev(7500));
    expect(note).toBe('Easy week: 7 working sets at your usual weights, lighter on purpose.');
  });

  it('keeps the record line — one lift, by the one record rule', () => {
    expect(buildSessionNote(data({ records: [rec('Bench Press', 'weight', 100, { weightKg: 100, reps: 5 })] }), null)).toBe(
      'Record on Bench Press: heaviest weight 100 kg.',
    );
    expect(buildSessionNote(data({ records: [rec('Pull Up', 'reps', 15, { weightKg: 0, reps: 15 })] }), prev(10000))).toBe(
      'Record on Pull Up: most reps 15 reps.',
    );
  });

  it('several lifts with records are named, not counted twice', () => {
    const records = [
      rec('Bench Press', 'weight', 100, { weightKg: 100, reps: 5 }),
      rec('Bench Press', 'e1rm', 116),
      rec('Squat', 'weight', 140, { weightKg: 140, reps: 3 }),
    ];
    expect(buildSessionNote(data({ records }), null)).toBe('Records on Bench Press and Squat.');
    const four = [...records, rec('Row', 'weight', 80), rec('Curl', 'weight', 20)];
    expect(buildSessionNote(data({ records: four }), null)).toBe('Records on Bench Press, Squat and 2 more lifts.');
  });

  it('kg lifted against the last workout of the same kind, in plain words', () => {
    expect(buildSessionNote(data({ totalVolumeKg: 10500 }), prev(10000))).toBe('5% more kg lifted than your last push workout (10,000 kg).');
    expect(buildSessionNote(data({ totalVolumeKg: 9000 }), prev(10000))).toBe('10% less kg lifted than your last push workout (10,000 kg).');
    expect(buildSessionNote(data({ totalVolumeKg: 10200 }), prev(10000))).toBe('About the same kg lifted as your last push workout (10,000 kg).');
  });

  it('a pound user reads "lb lifted" beside a pound total — never "kg lifted" (review fix)', () => {
    const note = buildSessionNote(data({ totalVolumeKg: 10500 }), prev(10000), 'imperial');
    expect(note).toBe('5% more lb lifted than your last push workout (22,046 lb).');
    expect(note).not.toMatch(/kg/);
  });

  it('an empty workout ("full") is never compared with another — and with nothing to say there is no card', () => {
    expect(buildSessionNote(data({ dayType: 'full', totalVolumeKg: 10500 }), prev(10000))).toBeNull();
    expect(buildSessionNote(data({ workingSetCount: 14, muscles: [{ muscle: 'chest', sets: 6 }] as never }), null)).toBeNull();
  });

  it('never sounds like a coach, and never gives protein, sleep or food advice with nutrition off', () => {
    expect(FEATURES.nutrition).toBe(false);
    const cases: [SessionSummaryData, SessionDetail | null][] = [
      [data({ easyWeek: true, workingSetCount: 7 }), null],
      [data({ records: [rec('Bench Press', 'weight', 100, { weightKg: 100, reps: 5 })] }), null],
      [data({ records: [rec('Deadlift', 'e1rm', 205)] }), null],
      [data({ totalVolumeKg: 10500 }), prev(10000)],
      [data({ totalVolumeKg: 9000 }), prev(10000)],
      [data({ totalVolumeKg: 10000 }), prev(10000)],
      [data({ dayType: 'legs', workingSetCount: 14, muscles: [{ muscle: 'quads', sets: 6 }] as never }), null],
      [data({ dayType: 'full', workingSetCount: 1 }), null],
    ];
    for (const [d, p] of cases) {
      const note = buildSessionNote(d, p);
      if (note == null) continue;
      expect(note).not.toMatch(COACHY);
      expect(noteAllowed(note)).toBe(true);
    }
  });

  it('a (coach) note that strays into food or sleep is dropped while nutrition is hidden', () => {
    expect(noteAllowed('Big pull day — get protein and sleep now.', { nutrition: false })).toBe(false);
    expect(noteAllowed('Eat well tonight.', { nutrition: false })).toBe(false);
    expect(noteAllowed('Big pull day — get protein and sleep now.', { nutrition: true })).toBe(true);
    // Whole words only: "update", "repeat" and "heaviest" are not food words.
    expect(noteAllowed('Repeat this to update your heaviest weight.', { nutrition: false })).toBe(true);
  });
});
