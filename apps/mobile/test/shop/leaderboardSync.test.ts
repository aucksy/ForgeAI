/**
 * R-133: reading the board (src/shop/leaderboardSync.ts): hidden only when the server has no
 * leaderboard, the last answer kept on any other failure, and boardIsLive() for Settings.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } }));

let answer: unknown = null;
let calls = 0;
vi.mock('@/shop/gymApi', () => ({
  apiBoard: async () => {
    calls += 1;
    if (answer instanceof Error) throw answer;
    return answer;
  },
  apiBoardPush: async () => ({ ok: true, data: true }),
}));

import { boardFromRow } from '@/shop/leaderboard';
import { boardIsLive, ensureBoardRead, onBoardLiveChange, peekBoard, readBoard, resetBoardSyncForTests } from '@/shop/leaderboardSync';

const LINK = { memberKey: 'k'.repeat(48), memberId: 'm1', gymId: 'g1', gymName: 'Iron Temple Fitness', joinCode: 'IRON01', name: 'Asha' };
const BOARD = boardFromRow({ ok: true, gymName: 'Iron Temple', workouts: { top: [{ rank: 1, name: 'A member', value: 3, me: true }], me: { rank: 1, value: 3 } } })!;

describe('reading the board', () => {
  beforeEach(() => {
    resetBoardSyncForTests();
    calls = 0;
    answer = { ok: true, data: BOARD };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('an answer is shown, held for the next visit, and makes the board live', async () => {
    expect(boardIsLive()).toBe(false);
    expect(await readBoard(LINK)).toEqual({ kind: 'board', board: BOARD });
    expect(boardIsLive()).toBe(true);
    expect(peekBoard(LINK)).toBe(BOARD);
  });

  it('offline, a server error or an answer that is not one: keep what is held, hide nothing', async () => {
    await readBoard(LINK);
    for (const bad of [
      { ok: false, error: { kind: 'offline' } },
      { ok: false, error: { kind: 'timeout' } },
      { ok: false, error: { kind: 'other' } },
      { ok: false, error: { kind: 'BUSY' } },
      new Error('boom'),
    ]) {
      answer = bad;
      expect(await readBoard(LINK)).toEqual({ kind: 'keep' });
      expect(peekBoard(LINK)).toBe(BOARD);
      expect(boardIsLive()).toBe(true);
    }
  });

  it('a server without the leaderboard: hidden, not live, never asked again this run', async () => {
    answer = { ok: false, missing: true };
    expect(await readBoard(LINK)).toEqual({ kind: 'hidden' });
    expect(boardIsLive()).toBe(false);
    expect(peekBoard(LINK)).toBeNull();
    expect(calls).toBe(1);
    answer = { ok: true, data: BOARD };
    expect(await readBoard(LINK)).toEqual({ kind: 'hidden' });
    expect(calls).toBe(1);
  });

  it('never read, or failing before any answer: not live', async () => {
    answer = { ok: false, error: { kind: 'other' } };
    expect(await readBoard(LINK)).toEqual({ kind: 'keep' });
    expect(boardIsLive()).toBe(false);
  });

  it('listeners hear when it goes live; Settings opened first asks once, and not again when live', async () => {
    let heard = 0;
    const stop = onBoardLiveChange(() => {
      heard += 1;
    });
    await ensureBoardRead(LINK);
    expect(boardIsLive()).toBe(true);
    expect(heard).toBe(1);
    await ensureBoardRead(LINK);
    expect(calls).toBe(1);
    stop();
  });
});
