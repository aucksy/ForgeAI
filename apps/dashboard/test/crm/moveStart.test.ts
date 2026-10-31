/**
 * R-250 (owner, 31 Oct 2026): "Change start date" for a plan that has not started yet. His test gym
 * had an Annual plan sold to start 5 Aug 2027 and no way to move it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { emptySnapshot, LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { historyLine, moveStartProblem } from '../../src/crm/logic/membership';
import type { MemberDraft, PlanDraft } from '../../src/crm/types';

const TODAY = '2026-10-31';

const memberDraft = (over: Partial<MemberDraft> = {}): MemberDraft => ({
  fullName: 'Aakash Test',
  phone: '+919876543210',
  email: null,
  gender: 'male',
  dateOfBirth: null,
  address: null,
  emergencyName: null,
  emergencyPhone: null,
  joinedOn: '2026-08-01',
  photoUri: null,
  notes: null,
  archived: false,
  ...over,
});

const planDraft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  name: 'Annual',
  durationUnit: 'month',
  durationCount: 12,
  priceP: 1_200_000,
  joiningFeeP: 0,
  description: null,
  active: true,
  sortOrder: 1,
  ...over,
});

let db: LocalCrmData;
let clock: number;

beforeEach(() => {
  clock = 1_000;
  db = new LocalCrmData({ store: memoryStore(), now: () => (clock += 1), today: () => TODAY, seed: () => emptySnapshot(0, 'Test Gym') });
});

const sell = async (memberId: string, planId: string, startsOn: string) =>
  (
    await db.sellMembership({
      memberId,
      planId,
      startsOn,
      priceP: 1_200_000,
      joiningFeeP: 0,
      notes: null,
      collectNowP: 0,
      method: 'cash',
      reference: null,
      paidOn: TODAY,
      soldBy: null,
    })
  ).membership;

describe('R-250 change the start of a plan that has not started', () => {
  it('his case: Annual 5 Aug 2027 -> 4 Aug 2028 moves to 1 Nov 2026 and keeps its length', async () => {
    const m = await db.createMember(memberDraft());
    const plan = await db.createPlan(planDraft());
    const term = await sell(m.id, plan.id, '2027-08-05');
    expect(term.endsOn).toBe('2028-08-04');
    const moved = await db.moveMembershipStart(term.id, '2026-11-01');
    expect(moved.startsOn).toBe('2026-11-01');
    expect(moved.endsOn).toBe('2027-10-31');
    expect(moved.notes).toBe('Start moved: 2027-08-05 -> 2026-11-01');
    expect(historyLine('Start moved: 2027-08-05 -> 2026-11-01')).toBe('Start date changed: 5 Aug 2027 → 1 Nov 2026');
  });

  it('can move today, or later', async () => {
    const m = await db.createMember(memberDraft());
    const plan = await db.createPlan(planDraft());
    const term = await sell(m.id, plan.id, '2026-12-01');
    expect((await db.moveMembershipStart(term.id, TODAY)).startsOn).toBe(TODAY);
  });

  it('refuses a plan that has started, a cancelled one, and the same day', async () => {
    const m = await db.createMember(memberDraft());
    const plan = await db.createPlan(planDraft());
    const running = await sell(m.id, plan.id, '2026-10-01');
    await expect(db.moveMembershipStart(running.id, '2026-11-05')).rejects.toThrow(/already started/);
    const b = await db.createMember(memberDraft({ fullName: 'Second', phone: '+919811112222' }));
    const later = await sell(b.id, plan.id, '2027-01-01');
    await expect(db.moveMembershipStart(later.id, '2027-01-01')).rejects.toThrow(/different/);
    await db.cancelMembership(later.id, null);
    await expect(db.moveMembershipStart(later.id, '2027-02-01')).rejects.toThrow(/cancelled/);
  });

  it('refuses a start more than 31 days ago, and a bad date', async () => {
    const m = await db.createMember(memberDraft());
    const plan = await db.createPlan(planDraft());
    const term = await sell(m.id, plan.id, '2027-01-01');
    await expect(db.moveMembershipStart(term.id, '2026-09-01')).rejects.toThrow(/31 days/);
    await expect(db.moveMembershipStart(term.id, '2026-02-31')).rejects.toThrow();
    expect((await db.moveMembershipStart(term.id, '2026-10-01')).startsOn).toBe('2026-10-01');
  });

  it('never onto the days of their other gym plan; a cancelled one does not count', async () => {
    const m = await db.createMember(memberDraft());
    const plan = await db.createPlan(planDraft());
    const quarterly = await db.createPlan(planDraft({ name: 'Quarterly', durationCount: 3 }));
    await sell(m.id, quarterly.id, '2026-10-01'); // runs to 31 Dec 2026
    const next = await sell(m.id, plan.id, '2027-08-05');
    await expect(db.moveMembershipStart(next.id, '2026-12-15')).rejects.toThrow(/overlap/);
    expect((await db.moveMembershipStart(next.id, '2027-01-01')).endsOn).toBe('2027-12-31');
  });

  it('a PT pack is never blocked by a gym plan', () => {
    const pt = { id: 'p', memberId: 'm', startsOn: '2027-01-01', endsOn: '2027-01-31', cancelled: false, ptSessions: 12, planName: 'PT' };
    const gym = { id: 'g', memberId: 'm', startsOn: '2026-10-01', endsOn: '2027-12-31', cancelled: false, ptSessions: null, planName: 'Annual' };
    expect(moveStartProblem(pt, '2026-11-15', TODAY, [pt, gym])).toBeNull();
  });

  it('the member page shows the button only to owners, only on a plan not started yet', () => {
    const src = readFileSync(resolve(__dirname, '../../src/crm/ui/screens/MemberDetail.tsx'), 'utf8');
    expect(src).toContain('onMoveStart={canFreeze && !m.cancelled && m.startsOn > today ? () => setMovingStart(m) : undefined}');
    expect(src).toContain('Change start date');
  });
});
