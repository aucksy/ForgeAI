/**
 * F109 trainer view, the pure half: the weekly summary that leaves the phone (and what never does), the gym's
 * answers read defensively, and the member's words.
 */
import { describe, expect, it } from 'vitest';

import {
  TRAINER_WORDS,
  mondayOf,
  trainerFrom,
  trainerHelpFrom,
  trainerStatusFrom,
  trainerSummaryFrom,
  type TrainerSetRow,
} from '@/shop/trainerShare';

// A Wednesday.
const TODAY = '2026-11-04';
const row = (workoutId: string, dateISO: string, exerciseId: string, name: string, weightKg: number, reps: number): TrainerSetRow => ({
  workoutId,
  dateISO,
  exerciseId,
  name,
  weightKg,
  reps,
});

describe('weeks', () => {
  it('mondayOf finds the Monday; the summary starts 11 weeks before this one', () => {
    expect(mondayOf('2026-11-04')).toBe('2026-11-02');
    expect(mondayOf('2026-11-02')).toBe('2026-11-02');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
    expect(trainerFrom(TODAY)).toBe('2026-08-17');
  });

  it('12 weeks newest first, empty weeks kept, workouts counted once, kg = weight x reps', () => {
    const s = trainerSummaryFrom(
      [
        row('w1', '2026-11-02', 'lp', 'Leg press', 100, 10),
        row('w1', '2026-11-02', 'lp', 'Leg press', 100, 8),
        row('w2', '2026-11-04', 'pu', 'Pull-up', 0, 10),
        row('w3', '2026-10-20', 'lp', 'Leg press', 90, 10),
        row('old', '2026-08-10', 'lp', 'Leg press', 500, 10),
      ],
      new Map(),
      TODAY,
    );
    expect(s.weeks).toHaveLength(12);
    expect(s.weeks[0]).toEqual({ w: '2026-11-02', n: 2, kg: 1800 });
    expect(s.weeks[1]).toEqual({ w: '2026-10-26', n: 0, kg: 0 });
    expect(s.weeks[2]).toEqual({ w: '2026-10-19', n: 1, kg: 900 });
    expect(s.weeks[11]!.w).toBe('2026-08-17');
    expect(s.last).toBe('2026-11-04');
  });

  it('no workouts: every week empty and no last day', () => {
    const s = trainerSummaryFrom([], new Map(), TODAY);
    expect(s.weeks.every((w) => w.n === 0 && w.kg === 0)).toBe(true);
    expect(s).toMatchObject({ best: [], records: [], last: null });
  });
});

describe('best sets', () => {
  it('the 5 most-done exercises, each with its heaviest set (most reps on a tie)', () => {
    const rows: TrainerSetRow[] = [];
    const names = ['Squat', 'Bench press', 'Row', 'Curl', 'Dip', 'Plank'];
    names.forEach((n, i) => {
      for (let k = 0; k <= 5 - i; k++) rows.push(row(`w${k}`, '2026-10-30', n.toLowerCase(), n, 50 + k, 5));
    });
    rows.push(row('w0', '2026-10-30', 'squat', 'Squat', 55, 8));
    const s = trainerSummaryFrom(rows, new Map(), TODAY);
    expect(s.best.map((b) => b.n)).toEqual(['Squat', 'Bench press', 'Row', 'Curl', 'Dip']);
    expect(s.best[0]).toEqual({ n: 'Squat', w: 55, r: 8, t: 6 });
  });

  it('never sends an empty set or a long name', () => {
    const s = trainerSummaryFrom([row('w', '2026-11-03', 'x', '  A   very long exercise name that goes on and on forever ', 0, 0)], new Map(), TODAY);
    expect(s.best).toEqual([]);
    const t = trainerSummaryFrom([row('w', '2026-11-03', 'x', '  A   very long exercise name that goes on and on forever ', 10, 5)], new Map(), TODAY);
    expect(t.best[0]!.n.length).toBeLessThanOrEqual(40);
    expect(t.best[0]!.n.startsWith('A very long')).toBe(true);
  });
});

describe('new bests', () => {
  it('a weight heavier than ever before, in the last 30 days; the newest one per exercise', () => {
    const s = trainerSummaryFrom(
      [
        row('a', '2026-10-20', 'lp', 'Leg press', 110, 10),
        row('b', '2026-11-03', 'lp', 'Leg press', 120, 10),
        row('b', '2026-11-03', 'lp', 'Leg press', 120, 12),
        row('c', '2026-11-03', 'sq', 'Squat', 80, 5),
      ],
      new Map([
        ['lp', 100],
        ['sq', 90],
      ]),
      TODAY,
    );
    expect(s.records).toEqual([{ n: 'Leg press', w: 120, r: 12, d: '2026-11-03' }]);
  });

  it('a first-ever exercise is not a new best; an old best outside 30 days is not either', () => {
    const s = trainerSummaryFrom(
      [row('a', '2026-11-03', 'new', 'Hack squat', 100, 10), row('b', '2026-09-01', 'lp', 'Leg press', 200, 10)],
      new Map([['lp', 100]]),
      TODAY,
    );
    expect(s.records).toEqual([]);
  });
});

describe('what never leaves the phone', () => {
  it('the summary has only weeks, best sets, new bests and the last day', () => {
    const s = trainerSummaryFrom([row('a', '2026-11-03', 'lp', 'Leg press', 100, 10)], new Map(), TODAY);
    expect(Object.keys(s).sort()).toEqual(['best', 'last', 'records', 'weeks']);
    expect(JSON.stringify(s)).not.toMatch(/weight|photo|note|food|bodyWeight/i);
  });
});

describe("the gym's answers", () => {
  it('status', () => {
    expect(trainerStatusFrom({ ok: true, shared: true, trainer: ' Rohit ' })).toEqual({ shared: true, trainer: 'Rohit' });
    expect(trainerStatusFrom([{ ok: true, shared: false, trainer: null }])).toEqual({ shared: false, trainer: null });
    expect(trainerStatusFrom({ shared: true })).toBeNull();
    expect(trainerStatusFrom('nope')).toBeNull();
  });
  it('help', () => {
    expect(trainerHelpFrom({ ok: true, already: false })).toBe('sent');
    expect(trainerHelpFrom({ ok: true, already: true })).toBe('already');
    expect(trainerHelpFrom(null)).toBeNull();
  });
});

describe('member words', () => {
  const BANNED = /\b(volume|sessions?|PRs?|sync(ing|ed)?)\b/i;
  it('plain words, none of the banned ones, one short line each', () => {
    const lines = [
      TRAINER_WORDS.joinNote,
      TRAINER_WORDS.shareSwitch,
      TRAINER_WORDS.shareCaption,
      TRAINER_WORDS.yourTrainer('Rohit'),
      TRAINER_WORDS.helpButton,
      TRAINER_WORDS.helpSent,
      TRAINER_WORDS.helpAlready,
      TRAINER_WORDS.helpFailed,
    ];
    for (const l of lines) {
      expect(l, l).not.toMatch(BANNED);
      expect(l.length, l).toBeLessThanOrEqual(180);
    }
    expect(TRAINER_WORDS.joinNote).toBe("Your gym's trainers see your workouts, so they can help you progress.");
  });
});
