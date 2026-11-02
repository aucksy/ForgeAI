/**
 * 0048 (R-287): a finished challenge's winners wait for the owner ('confirm'), who gives or skips each
 * one's free days (owner_confirm_challenge_reward). Reading the server, the words, the call, and the
 * page showing the buttons to the owner only.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.fn();
vi.mock('../../src/crm/shop/api', () => ({ call: (...a: unknown[]) => callMock(...a) }));

import {
  challengeErrorWords,
  challengesFromAnswer,
  confirmedWords,
  giveAllLabel,
  giveLabel,
  needsConfirm,
  needsHand,
  pastSummary,
  prizeNote,
  rewardFrom,
  rewardWords,
  winnersText,
  type Challenge,
  type HitterReward,
} from '../../src/crm/logic/challenges';
import { confirmChallengeReward } from '../../src/crm/shop/challengesApi';

const confirm: HitterReward = { state: 'confirm', reason: null, days: 7, newEnd: null };
const skipped: HitterReward = { state: 'none', reason: 'skipped', days: 7, newEnd: null };
const added: HitterReward = { state: 'added', reason: null, days: 7, newEnd: '2026-12-08' };
const noPlan: HitterReward = { state: 'by_hand', reason: 'no_plan', days: 7, newEnd: null };
const h = (name: string, reward: HitterReward | null) => ({ memberId: `id-${name}`, name, phone: null, value: 16, reward });
const ended = (hitters: Challenge['hitters']): Challenge => ({
  id: 'c1', title: 'October challenge', measure: 'workouts', goal: 12, startsOn: '2026-10-01', endsOn: '2026-10-30', prizeDays: 7,
  createdByName: 'Owner', createdAt: 1, cancelledAt: null, status: 'ended', entrants: 5, hitters,
});

describe('reading the server', () => {
  it('reads confirm and skipped; the member id comes back for the call', () => {
    const a = challengesFromAnswer({
      canEdit: true,
      autoRewards: true,
      challenges: [
        {
          id: 'c1', title: 'Oct', measure: 'workouts', goal: 2, startsOn: '2026-10-01', endsOn: '2026-10-30', prizeDays: 7, status: 'ended', entrants: 3,
          hitters: [
            { memberId: 'u1', name: 'A', value: 3, reward: { state: 'confirm', reason: null, days: 7, newEnd: null } },
            { memberId: 'u2', name: 'B', value: 3, reward: { state: 'none', reason: 'skipped', days: 7, newEnd: null } },
          ],
        },
      ],
    });
    expect(a.challenges[0]!.hitters.map((x) => [x.memberId, x.reward])).toEqual([
      ['u1', confirm],
      ['u2', skipped],
    ]);
  });

  it('reads the confirm call’s answer, also wrapped in a list', () => {
    expect(rewardFrom({ state: 'added', reason: null, days: 7, newEnd: '2026-12-08' })).toEqual(added);
    expect(rewardFrom([{ state: 'none', reason: 'skipped', days: 7, newEnd: null }])).toEqual(skipped);
    expect(rewardFrom({ state: 'maybe' })).toBeNull();
    expect(rewardFrom(null)).toBeNull();
  });
});

describe('the words', () => {
  it('a waiting winner, a skipped one, and the buttons', () => {
    expect(rewardWords(h('A', confirm))).toBe('Won 7 free days. Waiting for the owner.');
    expect(rewardWords(h('A', skipped))).toBe('Skipped');
    expect(giveLabel(7)).toBe('Give 7 free days');
    expect(giveLabel(1)).toBe('Give 1 free day');
    expect(giveAllLabel(3)).toBe('Give all 3 their free days');
    expect([confirm, skipped, added, noPlan].map((r) => needsConfirm(h('x', r)))).toEqual([true, false, false, false]);
    expect(needsConfirm(h('x', { ...confirm, days: 0 }))).toBe(false);
    expect(needsHand(h('x', confirm))).toBe(false);
  });

  it('what the owner’s tap did', () => {
    expect(confirmedWords('Asha', added)).toBe('7 free days added for Asha. Plan now ends 8 Dec.');
    expect(confirmedWords('Asha', skipped)).toBe('Skipped. Asha gets no free days.');
    expect(confirmedWords('Asha', noPlan)).toBe('Asha: give the 7 free days by hand (see their line).');
    expect(confirmedWords('Asha', { ...confirm, state: 'pending' })).toBe('7 free days for Asha will be added soon.');
    expect(confirmedWords('Asha', null)).toBe('Saved.');
  });

  it('the line under the list asks the owner to check, and tells the desk who decides', () => {
    expect(prizeNote(ended([h('A', confirm), h('B', added)]), true, true)).toBe(
      'Check each winner, then tap Give 7 free days or Skip. The days go on their plan, and they get a message in the app.',
    );
    expect(prizeNote(ended([h('A', confirm)]), false, true)).toBe('The owner gives each winner the 7 free days here. Ask them to look at this list.');
    // Once all are decided, the earlier lines come back.
    expect(prizeNote(ended([h('A', added), h('B', skipped)]), true, true)).toBe(
      'The free days were added to each winner’s plan by themselves. Each winner got a message in the app.',
    );
  });

  it('a past challenge counts who is waiting', () => {
    expect(pastSummary(ended([h('A', confirm), h('B', confirm), h('C', noPlan)]))).toBe('3 reached the goal, 2 waiting for the owner, 1 to give by hand');
    expect(pastSummary(ended([h('A', skipped)]))).toBe('1 reached the goal');
  });

  it('the copied list says who is waiting or skipped', () => {
    const lines = winnersText(ended([h('Asha', confirm), h('Bilal', skipped)])).split('\n');
    expect(lines.slice(-2)).toEqual(['1. Asha, 16 workouts. Won 7 free days. Waiting for the owner.', '2. Bilal, 16 workouts. Skipped']);
  });

  it('the refusals', () => {
    expect(challengeErrorWords(new Error('NOT_OWNER'))).toBe('Only the owner can do this.');
    expect(challengeErrorWords({ message: 'GONE' })).toBe('This is no longer there. The list is up to date now.');
  });
});

describe('the call', () => {
  beforeEach(() => callMock.mockReset());

  it('sends the challenge, the member and give / skip', async () => {
    callMock.mockResolvedValueOnce({ state: 'added', reason: null, days: 7, newEnd: '2026-12-08' });
    expect(await confirmChallengeReward('k1', 'c1', 'u1', true)).toEqual(added);
    callMock.mockResolvedValueOnce({ state: 'none', reason: 'skipped', days: 7, newEnd: null });
    expect(await confirmChallengeReward('k1', 'c1', 'u2', false)).toEqual(skipped);
    expect(callMock.mock.calls).toEqual([
      ['owner_confirm_challenge_reward', { p_key: 'k1', p_challenge: 'c1', p_member: 'u1', p_give: true }],
      ['owner_confirm_challenge_reward', { p_key: 'k1', p_challenge: 'c1', p_member: 'u2', p_give: false }],
    ]);
  });
});

describe('the page', () => {
  it('shows Give / Skip to the owner only; the desk reads the waiting line', () => {
    const page = readFileSync(fileURLToPath(new URL('../../src/crm/ui/screens/Challenges.tsx', import.meta.url)), 'utf8');
    expect(page).toContain('const ask = canEdit && needsConfirm(h);');
    expect(page).toContain('const waiting = canEdit ? c.hitters.filter(needsConfirm) : [];');
    expect(page).toContain('confirmChallengeReward(ownerKey, c.id, h.memberId, give)');
    expect(page).toContain('giveAllLabel(waiting.length)');
    expect(page).toMatch(/>\s*Skip\s*</);
  });

  it('the server answers each winner’s member id, the one the call needs', () => {
    const sql = readFileSync(fileURLToPath(new URL('../../../../supabase/migrations/0047_challenge_rewards.sql', import.meta.url)), 'utf8');
    expect(sql).toContain("jsonb_build_object('memberId', h.member_id::text");
    const s48 = readFileSync(fileURLToPath(new URL('../../../../supabase/migrations/0048_security_fixes.sql', import.meta.url)), 'utf8');
    expect(s48).toContain('where challenge_id = c.id and member_id = p_member');
  });
});
