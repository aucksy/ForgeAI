/**
 * Launch audit, 3 Nov 2026: the Workout tab's "Your plan ends on Friday. Renew at the front desk."
 * Only within a week of the end (membership.ts RENEW_SOON_DAYS), only with the gym's plan known and
 * no renewal on record; never once the plan has ended (the Gym tab says that).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { usesBannedWord } from '@/lib/words';
import { NOTICE_ORDER, pickNotice } from '@/lib/workoutNotices';
import { RENEW_SOON_DAYS, type MembershipAnswer, type PlanSpan } from '@/shop/membership';
import { planEndsInDays, planEndsWords } from '@/shop/planEnds';

// Tuesday 3 Nov 2026.
const TODAY = '2026-11-03';
const answer = (endsOn: string, next: PlanSpan | null = null): MembershipAnswer => ({
  ok: true,
  gymName: 'Iron Temple',
  memberName: 'Uma',
  day: TODAY,
  current: { planName: 'Monthly', startsOn: '2026-10-07', endsOn, ptSessions: null, ptUsed: 0, trainer: null },
  next,
  lastEndedOn: null,
  visitsThisMonth: 2,
});

describe('when the card shows', () => {
  it('within a week of the end, the same window as the Gym tab card', () => {
    expect(RENEW_SOON_DAYS).toBe(7);
    expect(planEndsInDays(answer('2026-11-03'), TODAY)).toBe(0);
    expect(planEndsInDays(answer('2026-11-06'), TODAY)).toBe(3);
    expect(planEndsInDays(answer('2026-11-10'), TODAY)).toBe(7);
    expect(planEndsInDays(answer('2026-11-11'), TODAY)).toBeNull();
  });
  it('never once the plan has ended, with a renewal on record, or with no plan known', () => {
    expect(planEndsInDays(answer('2026-11-02'), TODAY)).toBeNull();
    expect(planEndsInDays(answer('2026-11-06', { planName: 'Monthly', startsOn: '2026-11-07', endsOn: '2026-12-06' }), TODAY)).toBeNull();
    expect(planEndsInDays(null, TODAY)).toBeNull();
    expect(planEndsInDays({ ok: false, problem: 'NO_PHONE', gymName: 'Iron Temple' }, TODAY)).toBeNull();
    expect(planEndsInDays({ ...answer('2026-11-06'), current: null } as MembershipAnswer, TODAY)).toBeNull();
  });
});

describe('the words', () => {
  it('say the day plainly, in complete sentences', () => {
    expect(planEndsWords('2026-11-03', 0)).toBe('Your plan ends today. Renew at the front desk.');
    expect(planEndsWords('2026-11-04', 1)).toBe('Your plan ends tomorrow. Renew at the front desk.');
    expect(planEndsWords('2026-11-06', 3)).toBe('Your plan ends on Friday, 6 Nov. Renew at the front desk.');
    expect(planEndsWords('2026-11-10', 7)).toBe('Your plan ends on Tuesday, 10 Nov. Renew at the front desk.');
  });
  it('use no banned word, dash or tick', () => {
    for (const n of [0, 1, 3, 7]) {
      const w = planEndsWords('2026-11-10', n);
      expect(usesBannedWord(w)).toBe(false);
      expect(w).not.toMatch(/—|✓|\b(volume|PR|session|last)\b/i);
    }
  });
});

describe('on the Workout tab', () => {
  it('is a notice after the watch offer, and never waits a day after another notice was closed', () => {
    expect(NOTICE_ORDER.indexOf('planEnds')).toBe(NOTICE_ORDER.indexOf('watch') + 1);
    expect(pickNotice({ planEnds: true, backup: true, safekeep: true }, null, TODAY)).toBe('planEnds');
    expect(pickNotice({ planEnds: true }, TODAY, TODAY)).toBe('planEnds');
    expect(pickNotice({ backup: true }, TODAY, TODAY)).toBeNull();
  });
  it('the tab draws it in the notice slot', () => {
    const tab = readFileSync(join(__dirname, '..', '..', 'src', 'app', '(tabs)', 'workout.tsx'), 'utf8');
    expect(tab).toMatch(/<PlanEndsCard hidden=\{notice !== 'planEnds'\} onWant=\{want\('planEnds'\)\} \/>/);
  });
});
