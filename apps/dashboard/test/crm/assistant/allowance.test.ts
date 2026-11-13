/**
 * Owner R-488 (13 Nov 2026): "This does not look correct - how are you making these mistakes?" The panel showed
 * "20 credits" next to a red "You have asked a lot today", with no warning and no number. Now: a quiet line from
 * 5 free questions left, a calm line with the number at the limit, credits named as safe, and the box locked.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { allowanceFor, fullLine, leftLine, resetAllowance } from '../../../src/crm/assistant/allowance';
import { HINGLISH } from '../../../src/crm/lang/hinglish';

afterEach(() => resetAllowance());

const s = (day: string, left: number | null, full: boolean) => ({ day, left, full });

describe("today's free questions", () => {
  it('says nothing while more than 5 are left, or before the first answer', () => {
    expect(leftLine(null)).toBeNull();
    expect(leftLine(6)).toBeNull();
    expect(leftLine(49)).toBeNull();
  });

  it('warns from 5 down, with the number', () => {
    expect(leftLine(5)).toMatchObject({ text: '{n} free questions left today.', vars: { n: 5 } });
    expect(leftLine(2)).toMatchObject({ text: '{n} free questions left today.', vars: { n: 2 } });
    expect(leftLine(1)).toMatchObject({ text: '1 free question left today.' });
  });

  it('at the limit: the number, credits are safe, come back tomorrow; never "asked a lot"', () => {
    const l = fullLine(20);
    expect(l.text).toBe("You have used today's {n} free questions. Your credits are safe. Ask again tomorrow.");
    expect(l.vars).toEqual({ n: 20 });
    expect(fullLine(null).text).toBe("You have used today's free questions. Your credits are safe. Ask again tomorrow.");
    expect(l.text).not.toMatch(/asked a lot/i);
  });

  it('a value from yesterday is forgotten', () => {
    expect(allowanceFor(s('2026-11-12', 0, true), '2026-11-13')).toEqual({ left: null, full: false });
    expect(allowanceFor(s('2026-11-13', 0, true), '2026-11-13')).toEqual({ left: 0, full: true });
  });

  it('every new line has its Hinglish, with the number kept', () => {
    for (const en of [
      '1 free question left today.',
      '{n} free questions left today.',
      "You have used today's {n} free questions. Your credits are safe. Ask again tomorrow.",
      "You have used today's free questions. Your credits are safe. Ask again tomorrow.",
      'No more free questions today. Ask again tomorrow.',
    ]) {
      expect(HINGLISH[en], en).toBeTruthy();
      if (en.includes('{n}')) expect(HINGLISH[en]).toContain('{n}');
    }
  });
});
