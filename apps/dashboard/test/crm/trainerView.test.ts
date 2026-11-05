/**
 * F109 "Training progress": the server's answers read defensively, the one line per member, who comes first, the two
 * WhatsApp messages, the refusal words, and everything staying hidden until the server has 0050.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.fn();
vi.mock('../../src/crm/shop/api', () => ({ call: (...a: unknown[]) => callMock(...a) }));
vi.mock('../../src/lib/demoLock', () => ({ isDemoLocked: () => false }));

import {
  howIsItGoingMessage,
  memberLine,
  setText,
  sortMembers,
  summaryFrom,
  trainerErrorWords,
  trainerMembersFrom,
  trainerSetupFrom,
  weekBars,
  weekLine,
  wellDoneMessage,
  type TrainerMember,
  type TrainerSummary,
} from '../../src/crm/logic/trainerView';
import { getTrainerMembers, getTrainerSetup, resetTrainerApiForTest, trainerAccess } from '../../src/crm/shop/trainerApi';

// A Wednesday.
const TODAY = '2026-11-04';

function summary(p: Partial<TrainerSummary> = {}): TrainerSummary {
  return { weeks: [{ w: '2026-11-02', n: 2, kg: 12480 }], best: [], records: [], last: '2026-11-03', ...p };
}

function member(name: string, p: Partial<TrainerMember> = {}): TrainerMember {
  return {
    appId: `app-${name}`,
    memberId: `m-${name}`,
    name,
    phone: '+919829012345',
    trainerId: null,
    trainerName: null,
    summary: summary(),
    updatedAt: 0,
    helpAt: null,
    ...p,
  };
}

afterEach(() => {
  callMock.mockReset();
  resetTrainerApiForTest();
});

describe('reading the server', () => {
  it('members: tidy, defensive, unknown fields dropped', () => {
    const r = trainerMembersFrom({
      ok: true,
      role: 'trainer',
      members: [
        {
          appId: 'a1',
          memberId: 'm-asha',
          name: ' Asha Verma ',
          phone: '+919829012345',
          trainerName: 'Rohit',
          summary: {
            weeks: [{ w: '2026-10-26', n: 1, kg: 100 }, { w: '2026-11-02', n: 3, kg: 900 }, { w: 'bad' }],
            best: [{ n: 'Leg press', w: 120, r: 10, t: 8 }, { n: '', w: 1, r: 1 }],
            records: [{ n: 'Leg press', w: 120, r: 10, d: '2026-11-03' }],
            last: '2026-11-03',
            bodyWeight: 80,
          },
          updatedAt: 5,
          helpAt: null,
        },
        { name: 'no id' },
      ],
    });
    expect(r?.role).toBe('trainer');
    expect(r?.members).toHaveLength(1);
    const m = r!.members[0]!;
    expect(m.name).toBe('Asha Verma');
    expect(m.summary.weeks.map((w) => w.w)).toEqual(['2026-11-02', '2026-10-26']);
    expect(m.summary.best).toEqual([{ n: 'Leg press', w: 120, r: 10, t: 8 }]);
    expect(Object.keys(m.summary).sort()).toEqual(['best', 'last', 'records', 'weeks']);
    expect(trainerMembersFrom({ ok: false })).toBeNull();
    expect(summaryFrom(null)).toEqual({ weeks: [], best: [], records: [], last: null });
  });

  it('setup: people with their tick, and who trains whom', () => {
    const s = trainerSetupFrom({
      people: [{ id: 's1', name: 'Rohit', role: 'staff', trainer: true }, { id: 's2', name: 'Owner', role: 'owner', trainer: false }, { name: 'x' }],
      assigned: [{ memberId: 'm-asha', trainerId: 's1' }, { memberId: '', trainerId: 's1' }],
    });
    expect(s.people.map((p) => `${p.name}:${p.trainer}`)).toEqual(['Rohit:true', 'Owner:false']);
    expect(s.assigned).toEqual({ 'm-asha': 's1' });
  });
});

describe('the one line', () => {
  it('help first, then quiet, then a new best, then this week', () => {
    const helpAt = Date.parse('2026-11-04T05:00:00Z');
    expect(memberLine(member('A', { helpAt }), TODAY)).toEqual({ kind: 'help', text: 'Asked for help today' });
    expect(memberLine(member('A', { helpAt: Date.parse('2026-11-01T05:00:00Z') }), TODAY).text).toBe('Asked for help on 1 Nov');
    expect(memberLine(member('A', { helpAt: Date.parse('2026-10-20T05:00:00Z') }), TODAY).kind).toBe('steady');
    expect(memberLine(member('A', { summary: summary({ last: '2026-10-26' }) }), TODAY)).toEqual({ kind: 'quiet', text: 'No workout for 9 days' });
    expect(memberLine(member('A', { summary: summary({ records: [{ n: 'Leg press', w: 120, r: 10, d: '2026-11-01' }] }) }), TODAY)).toEqual({
      kind: 'best',
      text: 'New best: Leg press 120 kg × 10',
    });
    expect(memberLine(member('A'), TODAY)).toEqual({ kind: 'steady', text: '2 workouts this week' });
    expect(memberLine(member('A', { summary: summary({ last: null, weeks: [] }) }), TODAY)).toEqual({ kind: 'none', text: 'No workouts logged yet' });
  });

  it('a body-weight move and half kilos read right', () => {
    expect(setText({ n: 'Pull-up', w: 0, r: 12 })).toBe('Pull-up × 12');
    expect(setText({ n: 'Curl', w: 12.5, r: 8 })).toBe('Curl 12.5 kg × 8');
  });

  it('who to talk to first', () => {
    const list = [
      member('Steady'),
      member('Best', { summary: summary({ records: [{ n: 'Squat', w: 100, r: 5, d: '2026-11-02' }] }) }),
      member('Quiet9', { summary: summary({ last: '2026-10-26' }) }),
      member('Quiet20', { summary: summary({ last: '2026-10-15' }) }),
      member('Help', { helpAt: Date.parse('2026-11-04T05:00:00Z') }),
    ];
    expect(sortMembers(list, TODAY).map((m) => m.name)).toEqual(['Help', 'Quiet20', 'Quiet9', 'Best', 'Steady']);
  });

  it('this week and the 12 bars', () => {
    expect(weekLine(summary(), TODAY)).toBe('This week: 2 workouts · 12,480 kg lifted');
    expect(weekLine(summary({ weeks: [{ w: '2026-10-26', n: 4, kg: 1 }] }), TODAY)).toBe('This week: 0 workouts · 0 kg lifted');
    const bars = weekBars(summary({ weeks: [{ w: '2026-11-02', n: 2, kg: 1 }, { w: '2026-10-19', n: 3, kg: 1 }] }), TODAY);
    expect(bars).toHaveLength(12);
    expect(bars.slice(-3)).toEqual([3, 0, 2]);
  });
});

describe('WhatsApp messages', () => {
  const BANNED = /\b(volume|sessions?|PRs?|renew|fees?|offer)\b/i;
  it('well done names the new best; how is it going names the quiet days; never money', () => {
    const best = member('Asha Verma', { summary: summary({ records: [{ n: 'Leg press', w: 120, r: 10, d: '2026-11-03' }] }) });
    expect(wellDoneMessage(best, TODAY, 'Rohit')).toBe('Hi Asha, well done on your new best: Leg press 120 kg × 10! Keep it up.\n– Rohit');
    expect(wellDoneMessage(member('Bilal Khan'), TODAY, null)).toBe('Hi Bilal, well done on your 2 workouts this week! Keep it up.');
    const quiet = member('Chand', { summary: summary({ last: '2026-10-26' }) });
    expect(howIsItGoingMessage(quiet, TODAY, null)).toBe("Hi Chand, how's it going? Haven't seen a workout from you for 9 days. Can I help with your plan?");
    expect(howIsItGoingMessage(member('Dev'), TODAY, null)).toBe("Hi Dev, how's it going? Anything I can help you with?");
    for (const t of [wellDoneMessage(best, TODAY, null), howIsItGoingMessage(quiet, TODAY, null), wellDoneMessage(member('E', { summary: summary({ weeks: [] }) }), TODAY, null)]) {
      expect(t).not.toMatch(BANNED);
    }
  });
});

describe('refusals', () => {
  it('plain words', () => {
    expect(trainerErrorWords(new Error('TRAINER_ONLY'))).toMatch(/Only trainers and the owner/);
    expect(trainerErrorWords({ message: 'NOT_TRAINER' })).toMatch(/not ticked/);
    expect(trainerErrorWords(new Error('something else'))).toBeNull();
  });
});

describe('hidden until the server has 0050', () => {
  it('no such function: missing, remembered for the page, no second call', async () => {
    callMock.mockRejectedValue({ code: 'PGRST202', message: 'Could not find the function' });
    expect(await getTrainerMembers('k')).toBe('missing');
    expect(trainerAccess('k')).toBe('no');
    expect(await getTrainerMembers('k')).toBe('missing');
    expect(await getTrainerSetup('k')).toBe('missing');
    expect(callMock).toHaveBeenCalledTimes(1);
  });

  it('the desk without the tick: refused and hidden', async () => {
    callMock.mockRejectedValue(new Error('TRAINER_ONLY'));
    expect(await getTrainerMembers('desk')).toBe('refused');
    expect(trainerAccess('desk')).toBe('no');
  });

  it('a trainer and an owner are told apart; another error is not remembered', async () => {
    callMock.mockResolvedValueOnce({ ok: true, role: 'trainer', members: [] });
    expect(await getTrainerMembers('t')).toEqual({ role: 'trainer', members: [] });
    expect(trainerAccess('t')).toBe('trainer');
    expect(trainerAccess('other')).toBe('unknown');
    callMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    await expect(getTrainerMembers('o')).rejects.toThrow('Failed to fetch');
    expect(trainerAccess('o')).toBe('unknown');
  });
});
