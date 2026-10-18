import { describe, expect, it } from 'vitest';

import { planStartLine } from '@/tracker/lib/planStart';

const kg = (n: number) => `${n} kg`;
const start = { action: 'start', logType: 'weight_reps' as const };

describe('planStartLine (OWNER-INBOX #19): a routine that gives a starting weight', () => {
  it('says the weight the set rows already hint, on a first time only', () => {
    expect(planStartLine(start, { weightKg: 20, reps: 8 }, kg)).toBe('First time · start at 20 kg × 8');
    expect(planStartLine(start, { weightKg: 20 }, kg)).toBe('First time · start at 20 kg');
    expect(planStartLine({ action: 'up', logType: 'weight_reps' }, { weightKg: 20, reps: 8 }, kg)).toBeNull();
  });
  it('extra kilos on a weighted move; nothing for bodyweight, holds or no weight', () => {
    expect(planStartLine({ action: 'start', logType: 'weighted' }, { weightKg: 10, reps: 6 }, kg)).toBe('First time · start at +10 kg × 6');
    expect(planStartLine({ action: 'start', logType: 'reps' }, { weightKg: 10, reps: 6 }, kg)).toBeNull();
    expect(planStartLine({ ...start, bodyweightOnly: true }, { weightKg: 10 }, kg)).toBeNull();
    expect(planStartLine({ action: 'start', logType: 'time' }, { weightKg: 10 }, kg)).toBeNull();
    expect(planStartLine({ action: 'start', logType: 'time' }, { durationSec: 45 }, kg)).toBe('First time · hold 45 s');
    expect(planStartLine(start, { reps: 8 }, kg)).toBeNull();
    expect(planStartLine(start, { weightKg: 0, reps: 8 }, kg)).toBeNull();
    expect(planStartLine(start, undefined, kg)).toBeNull();
    expect(planStartLine(null, { weightKg: 20 }, kg)).toBeNull();
  });
});
