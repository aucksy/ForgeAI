import { describe, expect, it } from 'vitest';

import { numberInWords, rupeesInWords } from '../../src/crm/logic/words';
import { MAX_PAISE } from '../../src/crm/logic/money';

describe('the Indian scale, not the international one', () => {
  it('groups by lakh and crore', () => {
    expect(numberInWords(100_000)).toBe('One Lakh');
    expect(numberInWords(1_000_000)).toBe('Ten Lakh');
    expect(numberInWords(10_000_000)).toBe('One Crore');
    // The number a Western grouping would call "1.23 million".
    expect(numberInWords(1_234_567)).toBe(
      'Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven',
    );
  });

  it('never says million or billion', () => {
    for (const n of [1_000_000, 12_500_000, 99_00_00_000]) {
      expect(numberInWords(n).toLowerCase()).not.toContain('million');
      expect(numberInWords(n).toLowerCase()).not.toContain('billion');
    }
  });

  it('handles the teens and the round tens', () => {
    expect(numberInWords(13)).toBe('Thirteen');
    expect(numberInWords(20)).toBe('Twenty');
    expect(numberInWords(19)).toBe('Nineteen');
    expect(numberInWords(90)).toBe('Ninety');
  });

  it('drops empty groups instead of leaving gaps', () => {
    expect(numberInWords(1_000)).toBe('One Thousand');
    expect(numberInWords(1_005)).toBe('One Thousand Five');
    expect(numberInWords(100_007)).toBe('One Lakh Seven');
    expect(numberInWords(0)).toBe('Zero');
  });

  it('goes past 99 crore without truncating', () => {
    expect(numberInWords(1_000_000_000)).toBe('One Hundred Crore');
  });
});

describe('a receipt line', () => {
  it('spells a whole-rupee amount', () => {
    expect(rupeesInWords(149_900)).toBe('Rupees One Thousand Four Hundred Ninety Nine Only');
    expect(rupeesInWords(300_000)).toBe('Rupees Three Thousand Only');
  });

  it('joins paise with "and", the only "and" in the line', () => {
    const words = rupeesInWords(149_950);
    expect(words).toBe('Rupees One Thousand Four Hundred Ninety Nine and Fifty Paise Only');
    expect(words.split(' and ')).toHaveLength(2);
  });

  it('reads a paise-only amount as paise, not as zero rupees', () => {
    expect(rupeesInWords(50)).toBe('Fifty Paise Only');
    expect(rupeesInWords(5)).toBe('Five Paise Only');
  });

  it('says zero rather than an empty string', () => {
    expect(rupeesInWords(0)).toBe('Rupees Zero Only');
  });

  it('handles the largest amount the system accepts', () => {
    expect(rupeesInWords(MAX_PAISE)).toBe('Rupees One Crore Only');
  });

  it('marks a negative rather than dropping the sign', () => {
    expect(rupeesInWords(-149_900)).toBe('Minus Rupees One Thousand Four Hundred Ninety Nine Only');
  });

  it('always ends in Only, so nothing can be appended to the figure by hand', () => {
    for (const p of [0, 1, 99, 100, 149_950, MAX_PAISE]) {
      expect(rupeesInWords(p).endsWith('Only')).toBe(true);
    }
  });
});
