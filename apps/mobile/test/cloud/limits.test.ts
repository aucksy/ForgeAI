/**
 * The free plan's limits (tracker #43, src/cloud/limits.ts): OFF at launch; when the server switch
 * is on, a member in no gym gets 4 routines, 7 own exercises and 3 months of charts (Hevy's free
 * plan); a gym member always gets everything; anything unreadable means OFF.
 */
import { describe, expect, it } from 'vitest';

import { atLimit, chartRangeAllowed, JOIN_GYM_BUTTON, JOIN_GYM_LINE, LAUNCH_LIMITS, limitsApply, limitsFresh, LIMITS_KEEP_MS, limitTitle, monthsOfRange, parseFreeLimits } from '@/cloud/limits';
import { BANNED_MEMBER_WORDS } from '@/lib/words';

const ON = parseFreeLimits({ on: true, routines: 4, customExercises: 7, chartMonths: 3 });

describe('the switch', () => {
  it('is off at launch, with Hevy’s numbers ready', () => {
    expect(LAUNCH_LIMITS).toEqual({ on: false, routines: 4, customExercises: 7, chartMonths: 3 });
    expect(limitsApply(LAUNCH_LIMITS, false)).toBe(false);
  });

  it('anything unreadable means off (never limits anyone by mistake)', () => {
    for (const raw of [null, undefined, 'on', 1, [], { on: 'true' }, { on: 1 }, {}]) expect(parseFreeLimits(raw).on).toBe(false);
    expect(parseFreeLimits({ on: true, routines: -1, customExercises: 'x', chartMonths: 2.5 })).toEqual({ on: true, routines: 4, customExercises: 7, chartMonths: 3 });
    expect(parseFreeLimits({ on: true, routines: 10, customExercises: 20, chartMonths: 6 })).toEqual({ on: true, routines: 10, customExercises: 20, chartMonths: 6 });
  });

  it('the kept answer is used for 12 hours', () => {
    expect(limitsFresh(null, 1000)).toBe(false);
    expect(limitsFresh(1000, 1000 + LIMITS_KEEP_MS - 1)).toBe(true);
    expect(limitsFresh(1000, 1000 + LIMITS_KEEP_MS)).toBe(false);
    expect(limitsFresh(5000, 1000)).toBe(false); // a clock set back: ask again
  });
});

describe('when switched on', () => {
  it('a member in no gym: the 5th routine and the 8th own exercise are refused', () => {
    expect(atLimit(ON, false, 'routines', 3)).toBe(false);
    expect(atLimit(ON, false, 'routines', 4)).toBe(true);
    expect(atLimit(ON, false, 'customExercises', 6)).toBe(false);
    expect(atLimit(ON, false, 'customExercises', 7)).toBe(true);
  });

  it('a gym member gets everything', () => {
    expect(limitsApply(ON, true)).toBe(false);
    expect(atLimit(ON, true, 'routines', 400)).toBe(false);
    expect(chartRangeAllowed(ON, true, null)).toBe(true);
  });

  it('charts: 3 months and the Profile’s 12 weeks fit; 12 months and All time do not', () => {
    expect(chartRangeAllowed(ON, false, monthsOfRange('3m'))).toBe(true);
    expect(chartRangeAllowed(ON, false, monthsOfRange('weeks'))).toBe(true);
    expect(chartRangeAllowed(ON, false, monthsOfRange('1y'))).toBe(false);
    expect(chartRangeAllowed(ON, false, monthsOfRange('year'))).toBe(false);
    expect(chartRangeAllowed(ON, false, monthsOfRange('all'))).toBe(false);
    expect(chartRangeAllowed(LAUNCH_LIMITS, false, monthsOfRange('all'))).toBe(true);
  });
});

describe('the words', () => {
  it('the owner’s line, word for word, with a button to Your gym', () => {
    expect(JOIN_GYM_LINE).toBe('Join through your gym to unlock everything, free.');
    expect(JOIN_GYM_BUTTON).toBe('Open Your gym');
    expect(limitTitle('routines', ON)).toBe('Without a gym, you can keep 4 routines');
    expect(limitTitle('customExercises', ON)).toBe('Without a gym, you can make 7 exercises of your own');
    expect(limitTitle('charts', ON)).toBe('Without a gym, charts show the last 3 months');
  });

  it('never a banned word, a price or "upgrade"', () => {
    const all = [JOIN_GYM_LINE, JOIN_GYM_BUTTON, limitTitle('routines', ON), limitTitle('customExercises', ON), limitTitle('charts', ON)].join(' ');
    for (const b of BANNED_MEMBER_WORDS) expect(b.re.test(all), b.word).toBe(false);
    expect(all).not.toMatch(/upgrade|₹|\bpay\b|premium/i);
  });
});
