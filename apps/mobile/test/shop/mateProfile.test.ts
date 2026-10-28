/**
 * R-164 gym mate profiles, the pure half: what leaves the phone (and what never does), the gym's
 * answers read defensively, and the member's words.
 */
import { describe, expect, it } from 'vitest';

import {
  MATE_WORDS,
  bestSet,
  exerciseLine,
  initialsOf,
  mateBoardFrom,
  mateProfileFrom,
  mateShareFrom,
  profileFor,
  type LocalWorkout,
} from '@/shop/mateProfile';

const TODAY = '2026-10-28';
const set = (weightKg: number, reps: number, isWarmup = false) => ({ weightKg, reps, isWarmup });
const ex = (id: string, name: string, sets: ReturnType<typeof set>[]) => ({ exercise: { id, name }, sets });

function workout(id: string, dateISO: string, exercises: LocalWorkout['exercises'], title = 'Push 1'): LocalWorkout {
  return { id, dateISO, title, exercises };
}

describe('bestSet', () => {
  it('takes the heaviest working set, most reps on a tie, and skips warm-ups', () => {
    expect(bestSet([set(100, 3, true), set(60, 8), set(70, 5), set(70, 6)])).toEqual({ w: 70, r: 6 });
  });
  it('with no weight on any set: the most reps', () => {
    expect(bestSet([set(0, 10), set(0, 12)])).toEqual({ w: 0, r: 12 });
  });
  it('nothing to show for a plank or a run', () => {
    expect(bestSet([set(0, 0)])).toBeNull();
  });
});

describe('mateShareFrom: what leaves the phone', () => {
  const totals = [
    { sessionId: 'w1', durationSec: 52 * 60 + 20, volumeKg: 3611.4 },
    { sessionId: 'w2', durationSec: 0, volumeKg: 0 },
  ];
  const keys = new Map<string, string | null>([['bench', 'bench_press'], ['pull', 'bad key!']]);

  it('name, minutes, kg lifted and each exercise best set; no sets list', () => {
    const s = mateShareFrom(
      '  Leg day   lover ',
      [workout('w1', TODAY, [ex('bench', 'Bench Press', [set(40, 12, true), set(60, 8), set(60, 6)]), ex('pull', 'Pull Up', [set(0, 12)])])],
      totals,
      keys,
      TODAY,
    );
    expect(s).toEqual({
      bio: 'Leg day lover',
      workouts: [
        {
          id: 'w1',
          d: TODAY,
          name: 'Push 1',
          min: 52,
          // Bar weight only: 60x8 + 60x6 = 840 (the 3611 total includes body weight on the pull-ups).
          kg: 840,
          ex: [
            { n: 'Bench Press', k: 'bench_press', w: 60, r: 8 },
            { n: 'Pull Up', k: null, w: 0, r: 12 },
          ],
        },
      ],
    });
    // Nothing else rides along: no sets, notes, photos or body weight keys anywhere.
    expect(JSON.stringify(s)).not.toMatch(/sets|note|photo|body|weight|phone/i);
  });

  it('a body-weight-only workout shares 0 kg, so kg / reps can never give away body weight', () => {
    const s = mateShareFrom(null, [workout('w1', TODAY, [ex('pull', 'Pull Up', [set(0, 10), set(0, 8)])])], [{ sessionId: 'w1', durationSec: 600, volumeKg: 1440 }], new Map(), TODAY);
    expect(s.workouts[0]!.kg).toBe(0);
    expect(s.workouts[0]!.ex[0]).toEqual({ n: 'Pull Up', k: null, w: 0, r: 10 });
  });

  it('only the last 60 days, at most 30 workouts and 8 exercises each', () => {
    const many = Array.from({ length: 40 }, (_, i) => workout(`w${i}`, TODAY, Array.from({ length: 10 }, (_, j) => ex(`e${j}`, `Ex ${j}`, [set(10, 10)]))));
    const s = mateShareFrom(null, [workout('old', '2026-08-29', []), workout('edge', '2026-08-30', []), ...many], [], new Map(), TODAY);
    expect(s.workouts.map((w) => w.id)).not.toContain('old');
    expect(s.workouts[0]!.id).toBe('edge');
    expect(s.workouts).toHaveLength(30);
    expect(s.workouts[1]!.ex).toHaveLength(8);
    expect(s.bio).toBeNull();
  });

  it('a workout with no name says Workout; long names are cut to what the gym keeps', () => {
    const s = mateShareFrom(null, [workout('w1', TODAY, [ex('x', 'A'.repeat(70), [set(5, 5)])], '   ')], [], new Map(), TODAY);
    expect(s.workouts[0]!.name).toBe('Workout');
    expect(s.workouts[0]!.ex[0]!.n).toHaveLength(40);
  });

  it('an id the gym would refuse is left out instead of failing the whole share', () => {
    const s = mateShareFrom(null, [workout('bad id', TODAY, []), workout('ok-1', TODAY, [])], [], new Map(), TODAY);
    expect(s.workouts.map((w) => w.id)).toEqual(['ok-1']);
  });

  it('the bio is cut to 160 characters', () => {
    expect(mateShareFrom('b'.repeat(200), [], [], new Map(), TODAY).bio).toHaveLength(160);
  });
});

describe('the gym answers', () => {
  const P = '0b6f1e9c-3a52-4c1e-9a0e-5d7c2b1a9f00';
  it('member_mate_board: profile ids only when they look like one', () => {
    const b = mateBoardFrom({ ok: true, workouts: [{ rank: 1, name: 'Asha R.', profile: P }, { rank: 2, name: 'A member', profile: null }], kg: [{ rank: 1, name: 'X', profile: 'drop table' }] });
    expect(b?.workouts).toEqual([
      { rank: 1, name: 'Asha R.', profile: P },
      { rank: 2, name: 'A member', profile: null },
    ]);
    expect(b?.kg[0]!.profile).toBeNull();
    expect(mateBoardFrom({ ok: false })).toBeNull();
    expect(mateBoardFrom('nope')).toBeNull();
  });

  it('a row opens only when the gym row at the same place matches', () => {
    const rows = [{ rank: 1, name: 'Asha R.', profile: P }];
    expect(profileFor(rows, 0, 1, 'Asha R.')).toBe(P);
    expect(profileFor(rows, 0, 1, 'Bina S.')).toBeNull();
    expect(profileFor(rows, 1, 2, 'Asha R.')).toBeNull();
    expect(profileFor(undefined, 0, 1, 'Asha R.')).toBeNull();
  });

  it('member_mate_profile', () => {
    const p = mateProfileFrom([{ ok: true, name: 'Asha R.', bio: null, workouts: [{ id: 'w1', d: TODAY, name: 'Legs', min: 40, kg: '5000', ex: [{ n: 'Squat', k: 'squat', w: 100, r: 5 }, 'junk'] }, { d: 'bad' }] }]);
    expect(p).toEqual({ name: 'Asha R.', bio: null, workouts: [{ id: 'w1', d: TODAY, name: 'Legs', min: 40, kg: 5000, ex: [{ n: 'Squat', k: 'squat', w: 100, r: 5 }] }] });
    expect(mateProfileFrom(null)).toBeNull();
  });
});

describe('words', () => {
  const BANNED = /\b(volume|sessions?|PRs?|sync(ing|ed)?)\b/i;
  it('no banned word anywhere a member reads', () => {
    const lines = [
      MATE_WORDS.shareSwitch,
      MATE_WORDS.shareCaption,
      MATE_WORDS.needsName,
      MATE_WORDS.openHint,
      MATE_WORDS.title,
      MATE_WORDS.from('Asha R.'),
      MATE_WORDS.empty,
      MATE_WORDS.closed,
      MATE_WORDS.failed,
      ...Object.values(MATE_WORDS.stats),
      exerciseLine({ n: 'Bench Press', k: null, w: 60, r: 8 }, 'metric'),
    ];
    for (const l of lines) expect(l, l).not.toMatch(BANNED);
    expect(MATE_WORDS.shareCaption).toMatch(/kg lifted/);
  });

  it('best set lines', () => {
    expect(exerciseLine({ n: 'Bench Press', k: null, w: 60, r: 8 }, 'metric')).toBe('Bench Press · best 60 kg × 8');
    expect(exerciseLine({ n: 'Pull Up', k: null, w: 0, r: 12 }, 'metric')).toBe('Pull Up · best 12 reps');
    expect(exerciseLine({ n: 'Pull Up', k: null, w: 0, r: 1 }, 'metric')).toBe('Pull Up · best 1 rep');
  });

  it('initials', () => {
    expect(initialsOf('Asha R.')).toBe('AR');
    expect(initialsOf('Asha')).toBe('A');
    expect(initialsOf('')).toBe('?');
  });
});
