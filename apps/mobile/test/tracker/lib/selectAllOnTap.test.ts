import { afterEach, describe, expect, it, vi } from 'vitest';

import { retapSelectAll } from '@/tracker/lib/selectAllOnTap';

// u358 flow b saved 10 x 183: a tap on a box that already had the cursor kept the cursor.
// T76 found the first fix's 60 ms timer swallowed a digit typed straight after the tap ("100" -> "00").
describe('retapSelectAll', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fake box holding its text and selection, typing the way the phone does (replaces the selection). */
  const fakeBox = (text: string) => {
    const box = {
      text,
      sel: [text.length, text.length] as [number, number],
      calls: [] as string[],
      setSelection(a: number, b: number) {
        box.calls.push(`select ${a}-${b}`);
        box.sel = [a, b];
      },
      blur() {
        box.calls.push('blur');
      },
      focus() {
        box.calls.push('focus');
        // Android's select-on-focus.
        box.sel = [0, box.text.length];
      },
      type(chars: string) {
        for (const c of chars) {
          box.text = box.text.slice(0, box.sel[0]) + c + box.text.slice(box.sel[1]);
          box.sel = [box.sel[0] + 1, box.sel[0] + 1];
        }
      },
    };
    return box;
  };

  it('keyboard open: selects the whole number at once, so 18 replaces 13', () => {
    const box = fakeBox('13');
    box.sel = [1, 1]; // the finger left the cursor between 1 and 3
    expect(retapSelectAll(box, 2, true)).toBe('select');
    box.type('18');
    expect(box.text).toBe('18');
  });

  it('keyboard closed: the box gets focus again, so the phone selects it before typing can start', () => {
    const box = fakeBox('13');
    box.sel = [1, 1];
    expect(retapSelectAll(box, 2, false)).toBe('refocus');
    expect(box.calls).toEqual(['blur', 'focus']);
    box.type('18');
    expect(box.text).toBe('18');
  });

  it('NEGATIVE: fast typing right after the tap is never swallowed (nothing runs later)', () => {
    vi.useFakeTimers();
    const box = fakeBox('80');
    retapSelectAll(box, 2, true);
    box.type('100'); // typed in the same instant as the tap
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    box.type('');
    expect(box.text).toBe('100');
    expect(box.text).not.toBe('00');
    expect(box.calls).toEqual(['select 0-2']);
  });

  it('NEGATIVE: the closed-keyboard path schedules nothing either', () => {
    vi.useFakeTimers();
    const box = fakeBox('13');
    retapSelectAll(box, 2, false);
    box.type('100');
    vi.advanceTimersByTime(1000);
    expect(vi.getTimerCount()).toBe(0);
    expect(box.text).toBe('100');
  });

  it('does nothing for an empty box with the keyboard open, or a box that has gone', () => {
    const box = fakeBox('');
    expect(retapSelectAll(box, 0, true)).toBe('none');
    expect(box.calls).toEqual([]);
    expect(retapSelectAll(null, 3, true)).toBe('none');
  });

  it('logs instead of crashing when the box refuses', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = {
      setSelection: () => {
        throw new Error('gone');
      },
      blur: () => {},
      focus: () => {},
    };
    expect(retapSelectAll(bad, 2, true)).toBe('none');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
