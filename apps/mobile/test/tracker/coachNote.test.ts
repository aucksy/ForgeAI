import { describe, expect, it } from 'vitest';

import { buildSessionNote } from '@/tracker/services/coachNote';
import type { SessionPr, SessionSummaryData } from '@/tracker/services/finishSummary';
import type { SessionDetail } from '@/types/models';

// buildSessionNote reads only a handful of fields; build minimal fixtures and cast
// so we don't have to hand-craft a full SessionDetail row.
function data(over: Partial<SessionSummaryData> = {}): SessionSummaryData {
  return {
    session: { dayType: 'push', dateISO: '2026-07-20' },
    durationSec: 0,
    totalVolumeKg: 0,
    workingSetCount: 12,
    exerciseCount: 4,
    prs: [],
    muscles: [],
    setMeta: {},
    ...over,
  } as unknown as SessionSummaryData;
}

const prev = (totalVolumeKg: number): SessionDetail =>
  ({ totalVolumeKg } as unknown as SessionDetail);

const weightPr = (exerciseName: string, weightKg: number, reps: number): SessionPr => ({
  exerciseName,
  kind: 'weight',
  value: weightKg,
  weightKg,
  reps,
});

describe('buildSessionNote', () => {
  it('Phase 4: an easy week is lighter on purpose, not "down on last time"', () => {
    const note = buildSessionNote(data({ easyWeek: true, totalVolumeKg: 1500, workingSetCount: 7 }), prev(7500));
    expect(note).toBe('Easy week done — 7 working sets at your usual weights. Lighter on purpose: next week you come back stronger.');
    expect(buildSessionNote(data({ totalVolumeKg: 1500 }), prev(7500))).toContain('80% down on last time');
  });

  it('leads with a single weight PR', () => {
    const note = buildSessionNote(data({ prs: [weightPr('Bench Press', 100, 5)] }), null);
    expect(note).toContain('New PR on Bench Press');
    expect(note).toContain('100 kg × 5');
  });

  it('summarises multiple weight PRs', () => {
    const note = buildSessionNote(
      data({ prs: [weightPr('Bench Press', 100, 5), weightPr('Squat', 140, 3)] }),
      null,
    );
    expect(note).toContain('2 weight PRs today');
    expect(note).toContain('Bench Press');
  });

  it('prefers a weight PR over an e1RM PR when both are present', () => {
    const note = buildSessionNote(
      data({
        prs: [
          weightPr('Bench Press', 100, 5),
          { exerciseName: 'Bench Press', kind: 'e1rm', value: 116, weightKg: 100, reps: 5 },
        ],
      }),
      null,
    );
    expect(note).toContain('New PR on Bench Press');
    expect(note).not.toContain('Estimated-1RM');
  });

  it('falls to an e1RM PR when there is no heavier top set', () => {
    const note = buildSessionNote(
      data({ prs: [{ exerciseName: 'Deadlift', kind: 'e1rm', value: 205, weightKg: 180, reps: 3 }] }),
      null,
    );
    expect(note).toContain('Estimated-1RM PR on Deadlift');
  });

  it('Phase 3: celebrates a new kind of record when there is no heavier set or 1RM', () => {
    const note = buildSessionNote(
      data({
        records: [
          {
            kind: 'reps',
            value: 15,
            previous: 12,
            sessionId: 's',
            dateISO: '2026-07-20',
            set: { weightKg: 0, reps: 15 },
            exerciseId: 'pu',
            exerciseName: 'Pull Up',
            info: { logType: 'reps', loadMode: 'one', distUnit: 'km' },
          },
        ],
      }),
      prev(10000),
    );
    expect(note).toBe("Most reps on Pull Up: 15 reps. That's a new record — keep stacking them.");
  });

  it('reports a volume gain vs the last same day-type', () => {
    const note = buildSessionNote(data({ totalVolumeKg: 10500 }), prev(10000));
    expect(note).toContain('10,500 kg moved');
    expect(note).toContain('5% more than your last Push Day');
  });

  it('reports a volume drop vs the last same day-type', () => {
    const note = buildSessionNote(data({ totalVolumeKg: 9000 }), prev(10000));
    expect(note).toContain('10% down');
    expect(note).toContain('Push Day');
  });

  it('says "on pace" when volume is within 5%', () => {
    const note = buildSessionNote(data({ totalVolumeKg: 10200 }), prev(10000));
    expect(note).toContain('Right on pace with your last Push Day');
  });

  it('gives a recovery cue on the first time training a day type', () => {
    const note = buildSessionNote(
      // Phase 2: the split is working sets per finer muscle.
      data({ workingSetCount: 14, muscles: [{ muscle: 'chest', sets: 6 }] }),
      null,
    );
    expect(note).toContain('Push Day done');
    expect(note).toContain('14 working sets');
    expect(note).toContain('Chest took the brunt');
  });
});
