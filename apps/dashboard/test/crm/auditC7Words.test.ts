/**
 * Admin app audit C7-31 / C7-32 (16 Oct 2026): branding, photo and message words, and the freeze
 * history that showed raw dates. Each test failed before its fix.
 */
import { describe, expect, it } from 'vitest';

import { brandErrorWords, checkEncodedLogo, hexError } from '../../src/crm/brand/brandLogic';
import { historyLine } from '../../src/crm/logic/membership';
import { checkEncodedPhoto, checkSourceFile, uploadErrorWords as photoErrorWords } from '../../src/crm/shop/photo';

describe('C7-31: branding, photo and message words', () => {
  it('each error says what happened and what to do', () => {
    const pairs: [() => string | null, string][] = [
      [() => brandErrorWords(new Error('BUSY')), 'Too many uploads in the last few minutes. Wait a little and try again.'],
      [() => brandErrorWords(new Error('Failed to fetch')), 'Can’t reach the internet. Check the connection and try again.'],
      [() => brandErrorWords(new Error('x')), 'That didn’t save. Please try again.'],
      [() => hexError(''), 'Pick a colour, or type its code (like #F7D411).'],
      [() => checkEncodedLogo({ type: 'image/gif', size: 1 }), 'That logo could not be used. Try a PNG or JPEG picture.'],
      [() => checkSourceFile({ type: 'text/plain', size: 10, name: 'a.txt' }), 'That file isn’t a photo. Pick a JPEG or PNG picture.'],
      [() => checkEncodedPhoto({ type: 'image/jpeg', size: 99_000_000 }), 'That photo is still over 3 MB after shrinking. Pick a simpler one.'],
      [() => photoErrorWords(new Error('x')), 'The photo didn’t upload. Please try again.'],
    ];
    for (const [say, english] of pairs) {
      expect(say()).toBe(english);
    }
  });
});

describe('C7-32: the freeze history reads like the rest of the page', () => {
  it('"+7 days (Freeze - medical): 2026-06-04 -> 2026-06-11" shows dates and words', () => {
    const line = '+7 days (Freeze - medical): 2026-06-04 -> 2026-06-11';
    expect(historyLine(line)).toBe('+7 days (Freeze - medical): 4 Jun 2026 → 11 Jun 2026');
  });
});
