/**
 * R-147 (owner, 27 Oct 2026): the workout-complete screen's headline — today's kg lifted against
 * the same workout the comparison line uses, "+45 kg more than last time" in green, a kind line when
 * lower, today's total alone with no last time, reps for a no-weight workout; the share picture
 * adds "+45 kg more than last time" only when it fits its line whole.
 */
import { describe, expect, it } from 'vitest';

import { usesBannedWord } from '@/lib/words';
import { kgHero, workingReps } from '@/tracker/services/kgHero';
import { completeLine, workoutShareScene, type WorkoutShareInput } from '@/tracker/share/workoutCard';

describe('R-147: kgHero', () => {
  it('his Triceps day: 1,925 kg vs 1,880 kg → "+45 kg more than last time"', () => {
    const h = kgHero({ kg: 1925, reps: 45 }, { kg: 1880, reps: 44, against: 'Push 2 on 13 Oct' }, 'metric')!;
    expect(h.mode).toBe('kg');
    expect(h.label).toBe('Kg lifted today');
    expect(h.big).toBe('1,925 kg');
    expect(h.tone).toBe('up');
    expect(h.line).toBe('+45 kg more than last time');
    expect(h.lastLine).toBe('Last time: 1,880 kg in Push 2 on 13 Oct');
    expect(h.shareLine).toBe('+45 kg more than last time');
  });

  it('lower: a kind line, nothing for the picture', () => {
    const h = kgHero({ kg: 1500, reps: 40 }, { kg: 1880, reps: 44, against: null }, 'metric')!;
    expect(h.tone).toBe('down');
    expect(h.line).toBe('Lighter than last time. Every workout counts.');
    expect(h.lastLine).toBe('Last time: 1,880 kg');
    expect(h.shareLine).toBeNull();
  });

  it('a no-weight workout with fewer reps says fewer reps, not lighter', () => {
    expect(kgHero({ kg: 0, reps: 30 }, { kg: 0, reps: 40, against: null }, 'metric')!.line).toBe('Fewer reps than last time. Every workout counts.');
  });

  it('an easy week lower: lighter on purpose', () => {
    expect(kgHero({ kg: 900, reps: 20 }, { kg: 1880, reps: 44, against: null }, 'metric', true)!.line).toBe('Easy week: lighter on purpose.');
  });

  it('the same (under 1 kg apart)', () => {
    const h = kgHero({ kg: 1880.4, reps: 44 }, { kg: 1880, reps: 44, against: null }, 'metric')!;
    expect(h.tone).toBe('same');
    expect(h.line).toBe('Same as last time');
  });

  it('first workout: today alone, no made-up last time', () => {
    const h = kgHero({ kg: 1200, reps: 30 }, null, 'metric')!;
    expect(h.tone).toBe('first');
    expect(h.big).toBe('1,200 kg');
    expect(h.lastLine).toBeNull();
    expect(h.shareLine).toBeNull();
    expect(h.line).toBe('Your number to beat next time.');
  });

  it('last time lifted nothing (a run): no comparison in kilos', () => {
    expect(kgHero({ kg: 1200, reps: 30 }, { kg: 0, reps: 0, against: null }, 'metric')!.tone).toBe('first');
  });

  it('a no-weight workout counts reps, and compares only with another no-weight one', () => {
    const h = kgHero({ kg: 0, reps: 60 }, { kg: 0, reps: 52, against: null }, 'metric')!;
    expect(h.mode).toBe('reps');
    expect(h.label).toBe('Reps today');
    expect(h.big).toBe('60 reps');
    expect(h.line).toBe('+8 reps more than last time');
    expect(kgHero({ kg: 0, reps: 60 }, { kg: 1500, reps: 40, against: null }, 'metric')!.tone).toBe('first');
  });

  it('pounds for a member on lb', () => {
    const h = kgHero({ kg: 1000, reps: 30 }, { kg: 900, reps: 30, against: null }, 'imperial')!;
    expect(h.label).toBe('Lb lifted today');
    expect(h.big).toMatch(/ lb$/);
    expect(h.line).toMatch(/^\+\d+ lb more than last time$/);
  });

  it('nothing lifted and no reps (cardio only): no card', () => {
    expect(kgHero({ kg: 0, reps: 0 }, null, 'metric')).toBeNull();
  });

  it('member words only', () => {
    const all = [
      kgHero({ kg: 1925, reps: 45 }, { kg: 1880, reps: 44, against: 'Push 2 on 13 Oct' }, 'metric')!,
      kgHero({ kg: 1500, reps: 45 }, { kg: 1880, reps: 44, against: null }, 'metric')!,
      kgHero({ kg: 1500, reps: 45 }, null, 'metric')!,
      kgHero({ kg: 0, reps: 45 }, null, 'metric')!,
    ];
    for (const h of all) for (const t of [h.label, h.line, h.lastLine ?? '']) expect(usesBannedWord(t)).toBe(false);
  });

  it('workingReps leaves warm-ups out', () => {
    expect(workingReps({ exercises: [{ sets: [{ reps: 20, isWarmup: true }, { reps: 10, isWarmup: false }, { reps: 8, isWarmup: false }] }] })).toBe(18);
  });
});

describe('R-147: the share picture', () => {
  const input: WorkoutShareInput = {
    title: 'Push 2',
    dateText: 'Tue, 27 Oct 2026',
    durationText: '1h 04m',
    volumeText: '1,925',
    sets: 3,
    exercises: [],
    records: [],
    muscles: [],
  };
  const lines = (i: WorkoutShareInput) =>
    workoutShareScene(i)
      .nodes.filter((n) => n.t === 'text')
      .map((n) => (n as { text: string }).text);

  it('adds "+45 kg more than last time" after "Workout complete" when today beat last time', () => {
    expect(completeLine('+45 kg more than last time')).toBe('Workout complete · +45 kg more than last time');
    expect(lines({ ...input, beatLast: '+45 kg more than last time' })).toContain('Workout complete · +45 kg more than last time');
  });

  it('without it the picture is as before', () => {
    expect(lines(input)).toContain('Workout complete');
  });

  it('a line too long to fit whole is dropped, never cut', () => {
    expect(completeLine(`+${'9'.repeat(80)} kg more than last time`)).toBe('Workout complete');
  });
});

describe('UAT A-06: a much shorter workout is not compared', () => {
  it('2 sets against a full workout: no "lighter", no last-time line', () => {
    const h = kgHero({ kg: 1875, reps: 10 }, { kg: 7463, reps: 60, against: null }, 'metric')!;
    expect(h.tone).toBe('first');
    expect(h.line).toBe('A shorter workout than last time. Every workout counts.');
    expect(h.lastLine).toBeNull();
  });
  it('fewer reps but far more kilos is a win, not "shorter"', () => {
    const h = kgHero({ kg: 2500, reps: 25 }, { kg: 1200, reps: 60, against: null }, 'metric')!;
    expect(h.tone).toBe('up');
  });
});
