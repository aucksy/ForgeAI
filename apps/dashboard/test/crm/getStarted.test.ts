/** Launch I5: the five first steps tick themselves from the records where they can. */
import { describe, expect, it } from 'vitest';

import { getStartedSteps, stepsLine } from '../../src/crm/logic/getStarted';

const m = (archived = false, appUserId: string | null = null) => ({ archived, appUserId }) as never;

describe('Get started (I5)', () => {
  it('an empty gym: nothing done, in the order an owner needs', () => {
    const steps = getStartedSteps({ plans: [], members: [] }, new Set());
    expect(steps.map((s) => s.key)).toEqual(['plans', 'members', 'brand', 'staff', 'poster', 'app']);
    expect(stepsLine(steps)).toBe('0 of 6 done');
  });

  it('plans, members and the app tick from the records; staff and poster only when ticked', () => {
    const steps = getStartedSteps({ plans: [{ active: true } as never], members: [m(), m(false, 'u1')] }, new Set(['staff']));
    expect(steps.filter((s) => s.done).map((s) => s.key)).toEqual(['plans', 'members', 'staff', 'app']);
  });

  it('logo and colours: ticked by the owner or the Branding screen, opens Branding', () => {
    const brand = getStartedSteps({ plans: [], members: [] }, new Set(['brand'])).find((s) => s.key === 'brand')!;
    expect(brand).toMatchObject({ done: true, manual: true, path: '/settings/branding' });
  });

  it('a stopped plan or an archived member does not count', () => {
    const steps = getStartedSteps({ plans: [{ active: false } as never], members: [m(true, 'u1')] }, new Set());
    expect(stepsLine(steps)).toBe('0 of 6 done');
  });
});
