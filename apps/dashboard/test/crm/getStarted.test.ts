/** Launch I5: the five first steps tick themselves from the records where they can. */
import { describe, expect, it } from 'vitest';

import { getStartedSteps, isAlsoPath, onlineDone, stepForPath, stepsLine } from '../../src/crm/logic/getStarted';

const m = (archived = false, appUserId: string | null = null) => ({ archived, appUserId }) as never;

describe('Get started (I5)', () => {
  it('an empty gym: nothing done, in the order an owner needs', () => {
    const steps = getStartedSteps({ plans: [], members: [] }, new Set());
    expect(steps.map((s) => s.key)).toEqual(['plans', 'members', 'brand', 'staff', 'timings', 'poster', 'app']);
    expect(stepsLine(steps)).toBe('0 of 7 done');
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
    expect(stepsLine(steps)).toBe('0 of 7 done');
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

  it('R-571: one journey "Let people find and join your gym online" for an online gym; none without one (the demo)', () => {
    const none = { plans: [], members: [] };
    expect(getStartedSteps(none, new Set()).some((s) => s.key === 'online')).toBe(false);
    const base = { pagePart: true, published: false, takenDown: false, pageNotNow: false, linkShared: false };
    const steps = getStartedSteps(none, new Set(), base);
    expect(steps.map((s) => s.key)).toEqual(['plans', 'members', 'brand', 'staff', 'timings', 'online', 'poster', 'app']);
    expect(stepsLine(steps)).toBe('0 of 8 done');
    const step = steps.find((s) => s.key === 'online')!;
    expect(step).toMatchObject({ title: 'Let people find and join your gym online', path: '/setup/online', manual: false, done: false });
    expect(step.hint).toMatch(/^[A-Z].*\.$/);
    expect(step.hint).not.toMatch(/\bAI\b/);
    // Plans and timings say the page shows them only while the page part is here.
    expect(steps.find((s) => s.key === 'plans')!.hint).toMatch(/web page/);
    expect(steps.find((s) => s.key === 'timings')!.hint).toMatch(/web page/);
    // Gym web pages off (or HQ switched this gym's page off): the same step, about the join link only.
    const join = getStartedSteps(none, new Set(), { ...base, pagePart: false });
    const j = join.find((s) => s.key === 'online')!;
    expect(j.title).toBe('Let people join your gym online');
    expect(j.hint).not.toMatch(/web page/);
    for (const s of join) expect(s.hint).not.toMatch(/web page/);
  });

  it('R-571: done when the page is published, or after "Not now" and sharing the link', () => {
    const base = { pagePart: true, published: false, takenDown: false, pageNotNow: false, linkShared: false };
    expect(onlineDone(base)).toBe(false);
    expect(onlineDone({ ...base, published: true })).toBe(true);
    expect(onlineDone({ ...base, linkShared: true })).toBe(false);
    expect(onlineDone({ ...base, pageNotNow: true })).toBe(false);
    expect(onlineDone({ ...base, pageNotNow: true, linkShared: true })).toBe(true);
    // Taken down by MettleUp, or no page part: sharing the join link is the step.
    expect(onlineDone({ ...base, takenDown: true, linkShared: true })).toBe(true);
    expect(onlineDone({ ...base, pagePart: false })).toBe(false);
    expect(onlineDone({ ...base, pagePart: false, linkShared: true })).toBe(true);
  });

  it('R-571: the screens the journey sends the owner to offer "Back to" it (exact paths only)', () => {
    const steps = getStartedSteps({ plans: [], members: [] }, new Set(), { pagePart: true, published: false, takenDown: false, pageNotNow: false, linkShared: false });
    const online = steps.find((s) => s.key === 'online')!;
    for (const p of ['/settings/web-page', '/settings/payments', '/settings']) {
      expect(stepForPath(steps, p)?.key).toBe('online');
      expect(isAlsoPath(online, p)).toBe(true);
    }
    expect(stepForPath(steps, '/setup/online')?.key).toBe('online');
    expect(isAlsoPath(online, '/setup/online')).toBe(false);
    // Other Settings screens keep their own step (or none).
    expect(stepForPath(steps, '/settings/invite')?.key).toBe('app');
    expect(stepForPath(steps, '/settings/branding')?.key).toBe('brand');
    expect(stepForPath(steps, '/settings/machines')).toBeNull();
  });

  it('R-525: gym timings ticks itself (never by hand), opens Gym timings; no hint names the web page while it is hidden', () => {
    const steps = getStartedSteps({ plans: [], members: [] }, new Set());
    expect(steps.find((s) => s.key === 'timings')).toMatchObject({ done: false, manual: false, path: '/settings/timings', title: 'Set your gym timings' });
    expect(getStartedSteps({ plans: [], members: [] }, new Set(['timings'])).find((s) => s.key === 'timings')!.done).toBe(true);
    for (const s of steps) expect(s.hint).not.toMatch(/web page/);
  });
});
