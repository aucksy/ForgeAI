/**
 * R-200: the leaderboard's "Show me to my gym" box (src/shop/showMe.ts): when it shows (name off,
 * name already on, hidden by the gym, "Not now" for 30 days, under 18) and "Show me" switching both
 * on, or failing cleanly with both back off. Plus its words (boardWords.ts SHOW_ME_WORDS).
 */
import { describe, expect, it, vi } from 'vitest';

import { SHOW_ME_WORDS } from '@/shop/boardWords';
import type { Board, BoardList } from '@/shop/leaderboard';
import type { PushOutcome } from '@/shop/leaderboardPush';
import type { MateOutcome } from '@/shop/mateShare';
import { BUSY_TRIES, gymHidesMe, runShowMe, SHOW_ME_SNOOZE_MS, showMeOffer, type OfferInput, type ShowMeDeps } from '@/shop/showMe';

const row = (rank: number, me = false) => ({ rank, name: me ? 'Asha R.' : 'A member', value: 20 - rank, me });
const list = (top: ReturnType<typeof row>[], me: BoardList['me'] = null): BoardList => ({ top, me });
const board = (workouts: BoardList, kg: BoardList = workouts): Pick<Board, 'workouts' | 'kg'> => ({ workouts, kg });
const tenOthers = Array.from({ length: 10 }, (_, i) => row(i + 1));

const NOW = Date.UTC(2026, 9, 30, 12);
const input = (over: Partial<OfferInput> = {}): OfferInput => ({
  nameOn: false,
  shareOn: false,
  matesLive: true,
  board: board(list([row(1), row(2, true)], { rank: 2, value: 18 })),
  age: 0,
  snoozedAt: null,
  now: NOW,
  ...over,
});

describe('when the box shows', () => {
  it('name off, workouts off, the gym can hold workouts: offers both', () => {
    expect(showMeOffer(input())).toBe('both');
  });

  it('name off but workouts already on: offers the name only', () => {
    expect(showMeOffer(input({ shareOn: true }))).toBe('name');
  });

  it("the gym's server cannot hold shared workouts yet: offers the name only", () => {
    expect(showMeOffer(input({ matesLive: false }))).toBe('name');
  });

  it('name already on: no box, whatever the workouts switch says', () => {
    expect(showMeOffer(input({ nameOn: true }))).toBe('none');
    expect(showMeOffer(input({ nameOn: true, shareOn: false }))).toBe('none');
    expect(showMeOffer(input({ nameOn: true, shareOn: true }))).toBe('none');
  });

  it('no board yet: no box', () => {
    expect(showMeOffer(input({ board: null }))).toBe('none');
  });

  it('a member with nothing counted yet still sees it', () => {
    expect(showMeOffer(input({ board: board(list(tenOthers)) }))).toBe('both');
  });
});

describe('under 18', () => {
  it.each([10, 13, 17])('age %i: no box', (age) => {
    expect(showMeOffer(input({ age }))).toBe('none');
  });
  it.each([18, 30, 100])('age %i: the box shows', (age) => {
    expect(showMeOffer(input({ age }))).toBe('both');
  });
  it('age not given (0): the box shows (the app knows nothing else about age)', () => {
    expect(showMeOffer(input({ age: 0 }))).toBe('both');
  });
  it('age not read yet: no box, so it never flashes up for a minor', () => {
    expect(showMeOffer(input({ age: null }))).toBe('none');
  });
});

describe('"Not now"', () => {
  it('hides it for 30 days, then it may show again', () => {
    expect(showMeOffer(input({ snoozedAt: NOW }))).toBe('none');
    expect(showMeOffer(input({ snoozedAt: NOW - SHOW_ME_SNOOZE_MS + 60_000 }))).toBe('none');
    expect(showMeOffer(input({ snoozedAt: NOW - SHOW_ME_SNOOZE_MS }))).toBe('both');
    expect(showMeOffer(input({ snoozedAt: NOW - 40 * 24 * 3600_000 }))).toBe('both');
  });
  it('30 days is 30 days', () => {
    expect(SHOW_ME_SNOOZE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
  it('a broken saved value does not hide it', () => {
    expect(showMeOffer(input({ snoozedAt: Number.NaN }))).toBe('both');
    expect(showMeOffer(input({ snoozedAt: undefined }))).toBe('both');
  });
});

describe('hidden by the gym', () => {
  it('my place but no row of mine in a short list: hidden, no box', () => {
    const b = board(list([row(1), row(2)], { rank: 2, value: 18 }));
    expect(gymHidesMe(b)).toBe(true);
    expect(showMeOffer(input({ board: b }))).toBe('none');
  });

  it('my place better than the last row of a full list, no row of mine: hidden', () => {
    expect(gymHidesMe(board(list(tenOthers, { rank: 4, value: 16 })))).toBe(true);
  });

  it('hidden in one list is hidden (kg list only)', () => {
    expect(gymHidesMe(board(list([row(1), row(2, true)], { rank: 2, value: 18 }), list([row(1)], { rank: 1, value: 19 })))).toBe(true);
  });

  it('a tie at the cut-off is not proof: not hidden', () => {
    const top = [...tenOthers.slice(0, 9), row(10)];
    expect(gymHidesMe(board(list(top, { rank: 10, value: 10 })))).toBe(false);
  });

  it('below the top 10, or my row is on the list: not hidden', () => {
    expect(gymHidesMe(board(list(tenOthers, { rank: 14, value: 3 })))).toBe(false);
    expect(gymHidesMe(board(list([row(1), row(2, true)], { rank: 2, value: 18 })))).toBe(false);
    expect(gymHidesMe(board(list(tenOthers)))).toBe(false);
  });
});

// ------------------------------------------------------------------ "Show me"

function deps(name: PushOutcome[], share: MateOutcome[] = ['sent']) {
  const state = { name: false, share: false, namePending: false, sharePending: false };
  const calls: string[] = [];
  const d: ShowMeDeps = {
    setName: (on) => {
      state.name = on;
      state.namePending = true;
      calls.push(`name ${on ? 'on' : 'off'}`);
    },
    setShare: (on) => {
      state.share = on;
      state.sharePending = true;
      calls.push(`workouts ${on ? 'on' : 'off'}`);
    },
    pushName: vi.fn(async () => {
      calls.push(`push name ${state.name ? 'on' : 'off'}`);
      return name.length > 1 ? name.shift()! : name[0]!;
    }),
    pushShare: vi.fn(async () => {
      calls.push(`push workouts ${state.share ? 'on' : 'off'}`);
      return share.length > 1 ? share.shift()! : share[0]!;
    }),
    pause: vi.fn(async () => undefined),
    log: vi.fn(),
  };
  return { d, state, calls };
}

describe('"Show me"', () => {
  it('turns both on with the Settings calls, name first', async () => {
    const { d, state, calls } = deps(['sent'], ['sent']);
    await expect(runShowMe('both', d)).resolves.toBe('on');
    expect(state).toMatchObject({ name: true, share: true, namePending: true, sharePending: true });
    expect(calls).toEqual(['name on', 'push name on', 'workouts on', 'push workouts on']);
    expect(d.log).not.toHaveBeenCalled();
  });

  it('name only: never touches the workouts switch', async () => {
    const { d, state } = deps(['sent']);
    await expect(runShowMe('name', d)).resolves.toBe('on');
    expect(state.name).toBe(true);
    expect(d.pushShare).not.toHaveBeenCalled();
  });

  it('sample (demo) data: kept on, as in Settings', async () => {
    const { d, state } = deps(['demo'], ['demo']);
    await expect(runShowMe('both', d)).resolves.toBe('on');
    expect(state).toMatchObject({ name: true, share: true });
  });

  it('offline on the name: both stay off, the "off" is sent (and kept to send again), logged', async () => {
    const { d, state, calls } = deps(['failed']);
    await expect(runShowMe('both', d)).resolves.toBe('failed');
    expect(state).toMatchObject({ name: false, share: false, namePending: true });
    expect(calls).toEqual(['name on', 'push name on', 'name off', 'push name off']);
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining('show me did not go through'), 'name: failed');
  });

  it('name heard but the workouts failed: both back off, no half state, the gym is told "off" for both', async () => {
    const { d, state, calls } = deps(['sent'], ['failed']);
    await expect(runShowMe('both', d)).resolves.toBe('failed');
    expect(state).toMatchObject({ name: false, share: false, namePending: true, sharePending: true });
    expect(calls.slice(-4)).toEqual(['name off', 'workouts off', 'push name off', 'push workouts off']);
  });

  it.each<PushOutcome>(['stopped', 'no-gym'])('name push "%s": failed, back off', async (r) => {
    const { d, state } = deps([r]);
    await expect(runShowMe('name', d)).resolves.toBe('failed');
    expect(state.name).toBe(false);
  });

  it('a push throwing is a failure too, never a crash', async () => {
    const { d, state } = deps(['sent']);
    d.pushName = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('sent');
    await expect(runShowMe('name', d)).resolves.toBe('failed');
    expect(state.name).toBe(false);
  });

  it("waits while the board's own push is out, then sends", async () => {
    const { d, state } = deps(['busy', 'busy', 'sent'], ['busy', 'sent']);
    await expect(runShowMe('both', d)).resolves.toBe('on');
    expect(state).toMatchObject({ name: true, share: true });
    expect(d.pause).toHaveBeenCalledTimes(3);
  });

  it('busy for ever: gives up and switches back off', async () => {
    const { d, state } = deps(['busy']);
    await expect(runShowMe('name', d)).resolves.toBe('failed');
    expect(d.pause).toHaveBeenCalledTimes(BUSY_TRIES);
    expect(state.name).toBe(false);
  });
});

describe('the words', () => {
  const all = Object.values(SHOW_ME_WORDS).join(' ');
  it('never "volume", "PR", "session" or "sync"', () => {
    expect(all).not.toMatch(/\b(volume|PR|PRs|session|sessions|sync)\b/i);
  });
  it('say what is shared and what never is, as the privacy notice does', () => {
    expect(SHOW_ME_WORDS.both).toMatch(/first name/);
    expect(SHOW_ME_WORDS.both).toMatch(/bio/);
    expect(SHOW_ME_WORDS.both).toMatch(/up to 30 workouts from the last 60 days/);
    for (const never of ['body weight', 'photos', 'notes', 'mobile number']) expect(SHOW_ME_WORDS.both).toContain(never);
    expect(SHOW_ME_WORDS.offNote).toContain('Settings → Your gym');
  });
  it('buttons stay short for large text', () => {
    expect(SHOW_ME_WORDS.showMe.length).toBeLessThanOrEqual(10);
    expect(SHOW_ME_WORDS.notNow.length).toBeLessThanOrEqual(10);
    expect(SHOW_ME_WORDS.title.length).toBeLessThanOrEqual(24);
  });
});
