/**
 * R-539: the quiet "Updated 20 s ago" line (logic/freshness.ts): its words, and the tiny store that only the line
 * listens to (a pull never redraws the whole app).
 */
import { afterEach, describe, expect, it } from 'vitest';

import { HINGLISH } from '../../src/crm/lang/hinglish';
import { translate } from '../../src/crm/lang/lang';
import { FRESH_WORDS, freshAt, markFresh, resetFreshForTests, subscribeFresh, updatedWords } from '../../src/crm/logic/freshness';

afterEach(() => resetFreshForTests());

const say = (ms: number, lang: 'en' | 'hinglish' = 'en') => {
  const w = updatedWords(ms);
  return translate(lang, w.key, w.vars);
};

describe('Updated ... ago', () => {
  it('says the age in plain words, in steps of 10 seconds, then minutes', () => {
    expect(say(0)).toBe('Updated just now');
    expect(say(-5000)).toBe('Updated just now');
    expect(say(9_999)).toBe('Updated just now');
    expect(say(10_000)).toBe('Updated 10 s ago');
    expect(say(24_000)).toBe('Updated 20 s ago');
    expect(say(59_999)).toBe('Updated 50 s ago');
    expect(say(60_000)).toBe('Updated 1 min ago');
    expect(say(14 * 60_000 + 59_000)).toBe('Updated 14 min ago');
    expect(say(60 * 60_000)).toBe('Updated over an hour ago');
  });

  it('every line has its Hinglish, with the number kept', () => {
    expect(say(24_000, 'hinglish')).toBe('20 second pehle update hua');
    expect(say(3 * 60_000, 'hinglish')).toBe('3 minute pehle update hua');
    for (const k of [...Object.values(FRESH_WORDS), 'Updated just now', 'Updated {n} s ago', 'Updated {n} min ago', 'Updated over an hour ago']) {
      expect(HINGLISH[k], k).toBeTruthy();
    }
  });
});

describe('the freshness store', () => {
  it('keeps the newest time per list and tells its listeners', () => {
    let told = 0;
    const off = subscribeFresh(() => (told += 1));
    expect(freshAt('records')).toBeNull();
    markFresh('records', 1000);
    markFresh('records', 900); // an older answer never moves it back
    markFresh('needs', 2000);
    expect(freshAt('records')).toBe(1000);
    expect(freshAt('needs')).toBe(2000);
    expect(told).toBe(2);
    off();
    markFresh('records', 3000);
    expect(told).toBe(2);
  });
});
