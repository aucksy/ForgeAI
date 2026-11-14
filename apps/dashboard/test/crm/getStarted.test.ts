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

  it('UAT 1 Nov 2026: members opens Members, the poster step opens the CHECK-IN poster, not the join poster', () => {
    const steps = getStartedSteps({ plans: [], members: [] }, new Set());
    const by = (k: string) => steps.find((s) => s.key === k)!;
    expect(by('members').path).toBe('/members');
    expect(by('poster').path).toBe('/attendance/qr');
    expect(by('app').path).toBe('/settings/invite');
  });

  it('UAT 1 Nov 2026: every hint is a whole sentence', () => {
    for (const s of getStartedSteps({ plans: [], members: [] }, new Set())) expect(s.hint).toMatch(/^[A-Z].*\.$/);
  });

  it('R-523: the web page step is hidden until the page is live, then ticks itself when published', () => {
    expect(getStartedSteps({ plans: [], members: [] }, new Set()).some((s) => s.key === 'webpage')).toBe(false);
    const off = getStartedSteps({ plans: [], members: [] }, new Set(['webpage']), { published: false });
    const step = off.find((s) => s.key === 'webpage')!;
    expect(step).toMatchObject({ done: false, manual: false, path: '/settings/web-page', title: 'Make your free gym web page' });
    expect(step.hint).toMatch(/^[A-Z].*\.$/);
    // Never promise the AI helper for visitors while it is not live (F208).
    expect(step.hint).not.toMatch(/\bAI\b/);
    expect(stepsLine(off)).toBe('0 of 7 done');
    const on = getStartedSteps({ plans: [], members: [] }, new Set(), { published: true });
    expect(on.find((s) => s.key === 'webpage')!.done).toBe(true);
  });
});
