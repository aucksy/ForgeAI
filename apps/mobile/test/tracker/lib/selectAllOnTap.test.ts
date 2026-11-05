import { describe, expect, it, vi } from 'vitest';

import { SELECT_AFTER_TAP_MS, selectAllSoon } from '@/tracker/lib/selectAllOnTap';

// u358 flow b saved 10 x 183 because a tap on a focused box kept the cursor.
describe('selectAllSoon', () => {
  const run = (input: { setSelection: (a: number, b: number) => void } | null, len: number) => {
    let queued: (() => void) | null = null;
    let wait = -1;
    selectAllSoon(
      () => input,
      () => len,
      (fn, ms) => {
        queued = fn;
        wait = ms;
      },
    );
    return { fire: () => queued?.(), wait: () => wait };
  };

  it('selects the whole number after the tap has placed its cursor', () => {
    const setSelection = vi.fn();
    const r = run({ setSelection }, 2);
    expect(r.wait()).toBe(SELECT_AFTER_TAP_MS);
    expect(setSelection).not.toHaveBeenCalled();
    r.fire();
    expect(setSelection).toHaveBeenCalledWith(0, 2);
  });

  it('does nothing for an empty box or a box that has gone', () => {
    const setSelection = vi.fn();
    run({ setSelection }, 0).fire();
    expect(setSelection).not.toHaveBeenCalled();
    expect(() => run(null, 3).fire()).not.toThrow();
  });

  it('logs instead of crashing when the box refuses', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    run(
      {
        setSelection: () => {
          throw new Error('gone');
        },
      },
      2,
    ).fire();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
