import { describe, expect, it } from 'vitest';

import { agoText, lastTrainedByMuscle, legendFor, lowSetsHint, muscleLevels, stepsFor, untrainedWithAge } from '@/tracker/engine/bodyMap';

// R-286: the body map's 7 / 30 / 90 day switch and "last trained" ages (ideas from openGym, no code).
describe('body map ranges', () => {
  it('scales the week steps by the weeks in the range', () => {
    expect(stepsFor(7)).toEqual([3, 6, 10]);
    expect(stepsFor(30)).toEqual([12, 24, 40]);
    expect(stepsFor(90)).toEqual([39, 78, 130]);
  });
  it('keeps the week legend and builds the longer ones', () => {
    expect(legendFor(7)).toEqual(['1–2 sets', '3–5', '6–9', '10+']);
    expect(legendFor(30)).toEqual(['1–11 sets', '12–23', '24–39', '40+']);
  });
  it('shades 12 month sets as level 2, not the week top', () => {
    expect(muscleLevels([{ muscle: 'chest', sets: 12 }] as never, stepsFor(30)).get('chest')).toBe(2);
    expect(muscleLevels([{ muscle: 'chest', sets: 12 }] as never, stepsFor(7)).get('chest')).toBe(4);
  });
  it('says the hint for the range', () => {
    expect(lowSetsHint(7)).toBe('Under 10 sets in the last 7 days — a good one to train next.');
    expect(lowSetsHint(20, 30)).toBe('Under 40 sets in the last 30 days — a good one to train next.');
    expect(lowSetsHint(40, 30)).toBeNull();
    expect(lowSetsHint(0, 90)).toBe('No sets in the last 90 days — a good one to train next.');
  });
});

describe('last trained', () => {
  it('takes the newest day for main muscles and helpers', () => {
    const last = lastTrainedByMuscle([
      { muscles: { primary: ['chest'], secondary: ['triceps'] }, lastISO: '2026-10-01' },
      { muscles: { primary: ['triceps'], secondary: [] }, lastISO: '2026-10-20' },
      { muscles: { primary: ['chest'], secondary: [] }, lastISO: '2026-09-01' },
    ] as never);
    expect(last.get('chest')).toBe('2026-10-01');
    expect(last.get('triceps')).toBe('2026-10-20');
    expect(last.has('calves')).toBe(false);
  });
  it('says the age in plain words', () => {
    expect(agoText('2026-11-02', '2026-11-02')).toBe('today');
    expect(agoText('2026-11-01', '2026-11-02')).toBe('yesterday');
    expect(agoText('2026-10-26', '2026-11-02')).toBe('7 days ago');
    expect(agoText('2026-10-01', '2026-11-02')).toBe('4 weeks ago');
    expect(agoText(undefined, '2026-11-02')).toBe('never');
  });
  it('lists the longest untouched first, never-trained last', () => {
    const last = new Map([
      ['calves', '2026-09-20'],
      ['hamstrings', '2026-10-25'],
    ] as const);
    expect(untrainedWithAge(['hamstrings', 'abs', 'calves'] as never, last as never, '2026-11-02', (m) => m)).toEqual([
      'calves (6 weeks ago)',
      'hamstrings (8 days ago)',
      'abs (never)',
    ]);
  });
});
