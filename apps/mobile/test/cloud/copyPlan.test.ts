/**
 * The cloud copy's decisions (tracker #50, src/cloud/copyPlan.ts), pure: what a scan queues and when
 * it holds back, how the restore merge picks (no duplicate workouts, never a lost one, the newest
 * edit wins), the retry clock, and how errors are read.
 */
import { describe, expect, it, vi } from 'vitest';

// copyApi's pure readers only: its Supabase client is never built here.
vi.mock('@/cloud/client', () => ({ getSupabase: () => { throw new Error('no server in this test'); } }));

import { copyPageOf, putAnswerOf } from '@/cloud/copyApi';
import { classifyCopyError, MASS_DELETE_MIN, nextTryAt, planMerge, planScan, type LocalItem, type ServerItem, type StateRow } from '@/cloud/copyPlan';
import { MAX_PACKED_CHARS, packHash } from '@/cloud/pack';
import { ownerDecision } from '@/cloud/accountMeta';

const NOW = 1_800_000_000_000;
const w = (id: string, data: string, guess = 1000): LocalItem => ({ kind: 'w', id, data, hash: packHash(data), guess });
const st = (id: string, data: string, editedAt: number, kind: StateRow['kind'] = 'w'): StateRow => ({ kind, id, hash: packHash(data), editedAt });
const sv = (id: string, data: string | null, editedAt: number): ServerItem => ({ kind: 'w', id, v: 1, data, editedAt });

describe('scan: what goes in the queue', () => {
  it('new and changed items are queued; unchanged ones are not', () => {
    const plan = planScan([w('a', '"A1"'), w('b', '"B2"'), w('c', '"C"')], [st('b', '"B1"', 5), st('c', '"C"', 5)], NOW);
    expect(plan.ops.map((o) => `${o.id}=${o.data}`).sort()).toEqual(['a="A1"', 'b="B2"']);
    expect(plan.remember.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(plan.ops.every((o) => o.editedAt === NOW)).toBe(true);
    expect(plan.needsMerge).toBe(false);
  });

  it('an item gone from the phone is queued as a delete', () => {
    const plan = planScan([w('a', '"A"'), w('b', '"B"')], [st('a', '"A"', 5), st('b', '"B"', 5), st('gone', '"G"', 5)], NOW);
    expect(plan.ops).toEqual([{ kind: 'w', id: 'gone', data: null, editedAt: NOW }]);
    expect(plan.forget).toEqual([{ kind: 'w', id: 'gone' }]);
  });

  it('a phone whose clock went back still sends a newer edit than the last one', () => {
    const plan = planScan([w('a', '"A2"')], [st('a', '"A1"', NOW + 60_000)], NOW);
    expect(plan.ops[0].editedAt).toBe(NOW + 60_001);
  });

  it('an emptied phone never deletes the copy: every workout gone is held, and a bring-back is asked for', () => {
    const plan = planScan([], [st('a', '"A"', 5), st('b', '"B"', 5), st('me', '"U"', 5, 'u')], NOW);
    expect(plan.ops).toEqual([]);
    expect(plan.held).toBe(3);
    expect(plan.needsMerge).toBe(true);
  });

  it('DATA LOSS (review 3): when the hold fires, changed items are held too (an old backup must not overwrite the copy); new ones still go', () => {
    const many = Array.from({ length: 40 }, (_, i) => st(`w${i}`, `"${i}"`, 5));
    // A restored old backup: 15 of the 40 are here, 5 of them in an OLDER version, plus one new workout.
    const here = [...many.slice(0, 10).map((s) => w(s.id, `"${s.id.slice(1)}"`)), ...many.slice(10, 15).map((s) => w(s.id, '"old version"')), w('new', '"N"')];
    const plan = planScan(here, many, NOW);
    expect(plan.needsMerge).toBe(true);
    expect(plan.held).toBe(25 + 5);
    expect(plan.ops.map((o) => o.id)).toEqual(['new']);
  });

  it('a member tidying a few is never held', () => {
    const many = Array.from({ length: 40 }, (_, i) => st(`w${i}`, `"${i}"`, 5));
    const few = planScan(many.slice(3).map((s) => w(s.id, `"${s.id.slice(1)}"`)), many, NOW);
    expect(few.held).toBe(0);
    expect(few.ops.map((o) => o.id)).toEqual(['w0', 'w1', 'w2']);
    expect(MASS_DELETE_MIN).toBe(20);
  });

  it('DATA LOSS (review 9): a "Replace" import gives every workout a new id: the old ids are deleted, never held for ever', () => {
    const before = Array.from({ length: 30 }, (_, i) => st(`old${i}`, `"${i}"`, 5));
    const after = Array.from({ length: 30 }, (_, i) => w(`new${i}`, `"${i}"`));
    const plan = planScan(after, before, NOW);
    expect(plan.needsMerge).toBe(false);
    expect(plan.held).toBe(0);
    expect(plan.ops.filter((o) => o.data === null)).toHaveLength(30);
    expect(plan.ops.filter((o) => o.data !== null)).toHaveLength(30);
  });

  it('an item too big for the server stays on the phone only, and nothing else is held back', () => {
    const big = 'x'.repeat(MAX_PACKED_CHARS + 1);
    const plan = planScan([w('big', big), w('ok', '"OK"')], [], NOW);
    expect(plan.tooBig).toEqual([{ kind: 'w', id: 'big', size: MAX_PACKED_CHARS + 1 }]);
    expect(plan.ops.map((o) => o.id)).toEqual(['ok']);
  });
});

describe('bring back: the restore merge', () => {
  const merge = (server: ServerItem[], local: LocalItem[], state: StateRow[] = []) => planMerge(server, local, state, packHash, NOW);

  it('a new phone gets every workout, and remembers them so nothing is sent back', () => {
    const p = merge([sv('a', '["A"]', 10), sv('b', '["B"]', 20)], []);
    expect(p.apply.map((a) => a.id)).toEqual(['b', 'a']);
    expect(p.remember.map((r) => [r.id, r.editedAt])).toEqual([
      ['b', 20],
      ['a', 10],
    ]);
  });

  it('NO DUPLICATE WORKOUTS: the same workout (same content) under another id on this phone takes the server’s id', () => {
    const p = merge([sv('server-id', '["same sets"]', NOW - 1000)], [w('phone-id', '["same sets"]', 500)]);
    expect(p.apply).toEqual([{ kind: 'w', id: 'server-id', data: '["same sets"]', editedAt: NOW - 1000, replaces: 'phone-id' }]);
    expect(p.serverDeletes).toEqual([]);
  });

  it('DATA LOSS (review 4): two DIFFERENT workouts at the same start time are both kept, nothing deleted', () => {
    // A past workout logged to the minute, a chat day at noon: the same start proves nothing.
    const p = merge([sv('server-id', '["start:7","bench"]', 100)], [w('phone-id', '["start:7","squat"]')]);
    expect(p.apply.map((a) => [a.id, a.replaces])).toEqual([['server-id', undefined]]);
    expect(p.serverDeletes).toEqual([]);
    expect(p.remove).toEqual([]);
  });

  it('two server copies of one workout (two phones before this one, same content): only the newest comes back', () => {
    const p = merge([sv('old', '["v"]', 100), sv('new', '["v"]', 200)], []);
    expect(p.apply.map((a) => a.id)).toEqual(['new']);
    expect(p.serverDeletes.map((d) => d.id)).toEqual(['old']);
  });

  it('…but two server workouts that only share a start time are both brought back', () => {
    const p = merge([sv('a', '["start:9","v1"]', 100), sv('b', '["start:9","v2"]', 200)], []);
    expect(p.apply.map((a) => a.id).sort()).toEqual(['a', 'b']);
    expect(p.serverDeletes).toEqual([]);
  });

  it('THE NEWEST EDIT WINS: a server edit newer than the phone’s replaces it', () => {
    const p = merge([sv('a', '["server"]', 300)], [w('a', '["phone"]')], [st('a', '["phone"]', 200)]);
    expect(p.apply.map((a) => a.data)).toEqual(['["server"]']);
  });

  it('…and a phone edit made after the last copy is kept (the next scan sends it)', () => {
    const p = merge([sv('a', '["server"]', 300)], [w('a', '["edited here"]')], [st('a', '["copied"]', 200)]);
    expect(p.apply).toEqual([]);
    expect(p.keptLocal).toBe(1);
  });

  it('a phone never copied before: its workout older than the server’s edit gets the server’s', () => {
    const p = merge([sv('a', '["server"]', 300)], [w('a', '["stale"]', 100)]);
    expect(p.apply.map((a) => a.id)).toEqual(['a']);
  });

  it('the same text on both: nothing written, just remembered', () => {
    const p = merge([sv('a', '["A"]', 300)], [w('a', '["A"]')]);
    expect(p.apply).toEqual([]);
    expect(p.remember.map((r) => r.id)).toEqual(['a']);
  });

  it('a workout deleted on another phone after this phone’s last edit goes here too; an older delete does not', () => {
    const local = [w('a', '["A"]'), w('b', '["B"]')];
    const state = [st('a', '["A"]', 100), st('b', '["B"]', 500)];
    const p = merge([sv('a', null, 200), sv('b', null, 400)], local, state);
    expect(p.remove).toEqual([{ kind: 'w', id: 'a' }]);
    expect(p.apply).toEqual([]);
  });

  it('a delete never matches another id', () => {
    const p = merge([sv('server-id', null, NOW)], [w('phone-id', '["X"]')]);
    expect(p.remove).toEqual([]);
  });
});

describe('who may sign in on this phone', () => {
  it('the same person keeps the copy records; another empties them; another person over existing workouts is refused', () => {
    expect(ownerDecision('u1', 'u1', true)).toBe('keep');
    expect(ownerDecision(null, 'u1', true)).toBe('clear');
    expect(ownerDecision('u1', 'u2', false)).toBe('clear');
    expect(ownerDecision('u1', 'u2', true)).toBe('refuse');
  });
});

describe('the server’s answers', () => {
  it('a page counts every row and moves past an unreadable one (paging never stops early)', () => {
    const page = copyPageOf([
      { k: 'w', i: 'a', v: 1, d: '[]', e: 1 },
      { k: 'zz', i: 'b', v: 1, d: '[]', e: 2 }, // a kind this app does not know
      { k: 'w', i: 'c', v: 1, d: null, e: 'x' }, // a damaged time
    ]);
    expect(page.rows).toBe(3);
    expect(page.items.map((x) => x.id)).toEqual(['a']);
    expect(page.last).toEqual({ kind: 'w', id: 'c' });
    expect(copyPageOf(null)).toEqual({ items: [], rows: 0, last: null });
  });

  it('a put names what the server holds newer', () => {
    expect(putAnswerOf({ saved: 1, older: 1, olderIds: [{ k: 'w', i: 'x' }, { k: '?', i: 1 }] })).toEqual({ saved: 1, older: 1, olderIds: [{ kind: 'w', id: 'x' }] });
    expect(putAnswerOf({ saved: 2, older: 0 })).toEqual({ saved: 2, older: 0, olderIds: [] });
  });
});

describe('retries and errors', () => {
  it('waits longer after each failure, at most 6 hours', () => {
    expect(nextTryAt(1, NOW) - NOW).toBe(30_000);
    expect(nextTryAt(2, NOW) - NOW).toBe(120_000);
    expect(nextTryAt(3, NOW) - NOW).toBe(480_000);
    expect(nextTryAt(50, NOW) - NOW).toBe(6 * 3600_000);
    expect(nextTryAt(0, NOW) - NOW).toBe(30_000);
  });

  it('reads the server’s answers', () => {
    expect(classifyCopyError({ code: 'PGRST202', message: 'Could not find the function public.member_copy_put' })).toBe('not-ready');
    expect(classifyCopyError({ code: 'P0001', message: 'SIGN_IN' })).toBe('signed-out');
    expect(classifyCopyError({ code: '42501', message: 'permission denied for function member_copy_put' })).toBe('signed-out');
    expect(classifyCopyError({ code: 'P0001', message: 'COPY_FULL' })).toBe('full');
    expect(classifyCopyError({ code: 'P0001', message: 'TOO_BIG' })).toBe('refused');
    expect(classifyCopyError({ message: 'Network request failed' })).toBe('offline');
    expect(classifyCopyError(null)).toBe('offline');
  });
});
