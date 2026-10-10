import { describe, expect, it } from 'vitest';

import { runGuarded } from '@/lib/guardedAction';
import type { LoadState } from '@/lib/loadState';
import { LOADING, listView, loadFailed, loadStarted, loadSucceeded, loadedData, viewOf } from '@/lib/loadState';

describe('load state (HI-11, RP-13, PG-23, EX-16, SH-13)', () => {
  it('a failed first read is an error, never an empty list', () => {
    const s = loadFailed<string[]>(loadStarted(LOADING), new Error('locked'));
    expect(s.status).toBe('error');
    expect(listView(s)).toBe('error');
    expect(loadedData(s)).toBeNull();
  });

  it('a slow first read is loading, never "No … yet"', () => {
    expect(listView<string>(loadStarted(LOADING))).toBe('loading');
  });

  it('only a read that really answered with nothing is empty', () => {
    expect(listView(loadSucceeded<string[]>(LOADING, []))).toBe('empty');
    expect(listView(loadSucceeded<string[]>(LOADING, ['a']))).toBe('list');
  });

  it('a re-read keeps what is on screen, and a failed re-read does not wipe it', () => {
    const ready: LoadState<string[]> = loadSucceeded<string[]>(LOADING, ['bench']);
    expect(loadStarted(ready)).toBe(ready);
    const after = loadFailed(loadStarted(ready), new Error('x'));
    expect(listView(after)).toBe('list');
    expect(loadedData(after)).toEqual(['bench']);
  });

  it('retry after an error goes back to loading, then to data', () => {
    const err = loadFailed<string[]>(LOADING, new Error('x'));
    const again = loadStarted(err);
    expect(again.status).toBe('loading');
    expect(listView(loadSucceeded(again, ['row']))).toBe('list');
  });

  it('flag form: no "No exercises found" until the list has loaded', () => {
    expect(viewOf({ loaded: false, failed: false, count: 0 })).toBe('loading');
    expect(viewOf({ loaded: false, failed: true, count: 0 })).toBe('error');
    expect(viewOf({ loaded: true, failed: false, count: 0 })).toBe('empty');
    expect(viewOf({ loaded: true, failed: false, count: 3 })).toBe('list');
  });
});

describe('guarded actions never go dead (HI-13, RP-14, LW-20, EX-10)', () => {
  it('a failing action reports the error and frees the button', async () => {
    const guard = { current: false };
    const errors: unknown[] = [];
    const r = await runGuarded(guard, async () => {
      throw new Error('db locked');
    }, (e) => errors.push(e));
    expect(r).toBe('failed');
    expect(errors).toHaveLength(1);
    expect(guard.current).toBe(false);
    // The next tap runs again.
    let ran = false;
    expect(await runGuarded(guard, () => { ran = true; }, () => {})).toBe('ok');
    expect(ran).toBe(true);
  });

  it('a second tap while the first is running is ignored', async () => {
    const guard = { current: false };
    let release!: () => void;
    let calls = 0;
    const first = runGuarded(guard, () => {
      calls++;
      return new Promise<void>((r) => { release = r; });
    }, () => {});
    expect(await runGuarded(guard, () => { calls++; }, () => {})).toBe('busy');
    release();
    expect(await first).toBe('ok');
    expect(calls).toBe(1);
    expect(guard.current).toBe(false);
  });

  it('an action that navigated away keeps the guard, so a late tap cannot repeat it', async () => {
    const guard = { current: false };
    expect(await runGuarded(guard, async () => 'left' as const, () => {})).toBe('ok');
    expect(guard.current).toBe(true);
    expect(await runGuarded(guard, () => {}, () => {})).toBe('busy');
  });
});
