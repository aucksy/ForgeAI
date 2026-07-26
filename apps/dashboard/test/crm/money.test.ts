import { describe, expect, it } from 'vitest';

import {
  formatINR,
  formatINRShort,
  isValidPaise,
  MAX_PAISE,
  paiseToRupees,
  parseCount,
  parseRupeeInput,
  rupeesToPaise,
  splitPaise,
  sumPaise,
} from '../../src/crm/logic/money';

describe('paise are exact', () => {
  it('does not drift where floating-point rupees would', () => {
    // The reason money is integer paise. Stated as a comparison against the
    // rupee-float equivalent so this asserts something about OUR code, not just
    // a property of JavaScript.
    const rupeeFloat = [0.1, 0.2, 0.3].reduce((a, b) => a + b, 0);
    expect(rupeeFloat).not.toBe(0.6);
    expect(sumPaise([10, 20, 30])).toBe(60);
    expect(paiseToRupees(sumPaise([10, 20, 30]))).toBe(0.6);
  });

  it('sums a long ledger exactly', () => {
    const thousandTimesOneRupeeTen = Array.from({ length: 1000 }, () => 110);
    expect(sumPaise(thousandTimesOneRupeeTen)).toBe(110_000);
    // The float equivalent is 1100.0000000000086, which would print as ₹1,100.00
    // but fail an equality check against the expected total.
    expect(paiseToRupees(sumPaise(thousandTimesOneRupeeTen))).toBe(1100);
  });

  it('rounds rupee input to the nearest paisa', () => {
    expect(rupeesToPaise(1499)).toBe(149_900);
    expect(rupeesToPaise(1499.005)).toBe(149_901);
    expect(rupeesToPaise(Number.NaN)).toBe(0);
  });

  it('caps at exactly one crore rupees', () => {
    // Pinned to the literal, not to MAX_PAISE — `isValidPaise(MAX_PAISE)` is
    // true for ANY value of the constant, so it could not catch the ceiling
    // being ten times its own docstring (it was ₹10 crore).
    expect(MAX_PAISE).toBe(1_000_000_000);
    expect(formatINR(MAX_PAISE)).toBe('₹1,00,00,000');
    expect(isValidPaise(1_000_000_000)).toBe(true);
    expect(isValidPaise(1_000_000_001)).toBe(false);
    expect(parseRupeeInput('10000000')).toBe(1_000_000_000);
    expect(parseRupeeInput('10000001')).toBeNull();
  });

  it('validates the paise domain', () => {
    expect(isValidPaise(0)).toBe(true);
    expect(isValidPaise(-1)).toBe(false);
    expect(isValidPaise(10.5)).toBe(false);
    expect(isValidPaise('100')).toBe(false);
    expect(isValidPaise(Number.NaN)).toBe(false);
    expect(isValidPaise(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('formatINR', () => {
  it('uses Indian lakh grouping, not thousands grouping', () => {
    expect(formatINR(14_990_000)).toBe('₹1,49,900');
    expect(formatINR(100_000_000)).toBe('₹10,00,000');
  });

  it('hides decimals for whole rupees and shows them when present', () => {
    expect(formatINR(149_900)).toBe('₹1,499');
    expect(formatINR(149_950)).toBe('₹1,499.50');
    expect(formatINR(149_905)).toBe('₹1,499.05');
    expect(formatINR(149_900, { showDecimals: true })).toBe('₹1,499.00');
  });

  it('keeps the sign outside the symbol', () => {
    expect(formatINR(-50_000)).toBe('-₹500');
  });

  it('compacts for dense tiles', () => {
    expect(formatINRShort(90_000)).toBe('₹900');
    expect(formatINRShort(1_240_000)).toBe('₹12.4k');
    expect(formatINRShort(15_000_000)).toBe('₹1.5L');
    expect(formatINRShort(250_000_000)).toBe('₹25L');
    expect(formatINRShort(1_500_000_000)).toBe('₹1.5Cr');
  });
});

describe('parseRupeeInput', () => {
  it('accepts what a human types at a front desk', () => {
    expect(parseRupeeInput('1499')).toBe(149_900);
    expect(parseRupeeInput('₹1,499')).toBe(149_900);
    expect(parseRupeeInput(' 1,49,900 ')).toBe(14_990_000);
    expect(parseRupeeInput('1499.5')).toBe(149_950);
    expect(parseRupeeInput('1499.50')).toBe(149_950);
    // Indian keyboards produce both separators; a trailing comma group of 1-2
    // digits is a decimal comma, not thousands grouping.
    expect(parseRupeeInput('1499,50')).toBe(149_950);
  });

  it('rejects the exotic numerics that Number() would silently accept', () => {
    // The mobile app shipped this exact class of bug once: Number('0x20') === 32.
    expect(parseRupeeInput('0x20')).toBeNull();
    expect(parseRupeeInput('1e3')).toBeNull();
    expect(parseRupeeInput('Infinity')).toBeNull();
    expect(parseRupeeInput('')).toBeNull();
    expect(parseRupeeInput('-500')).toBeNull();
    expect(parseRupeeInput('1499.999')).toBeNull();
    expect(parseRupeeInput('abc')).toBeNull();
  });

  it('rejects malformed grouping instead of silently repricing it', () => {
    // Deleting every comma read `1,2,3,4` as ₹123.40 — a wrong price nobody
    // would notice at a counter.
    expect(parseRupeeInput('1,2,3,4')).toBeNull();
    expect(parseRupeeInput('1,23,45')).toBeNull();
    // `12,34` is NOT malformed grouping — a trailing group of 1-2 digits is the
    // decimal comma an Indian keyboard produces, so this is ₹12.34 by the same
    // rule that makes `1499,50` read as ₹1,499.50. Valid grouping always ends in
    // a 3-digit group.
    expect(parseRupeeInput('12,34')).toBe(1_234);
    expect(parseRupeeInput('1,00,000')).toBe(10_000_000);
    expect(parseRupeeInput('12,34,567')).toBe(123_456_700);
    expect(parseRupeeInput('1,234')).toBe(123_400);
  });

  it('rejects half-typed amounts rather than guessing', () => {
    expect(parseRupeeInput('1499.')).toBeNull();
    expect(parseRupeeInput('.50')).toBeNull();
    expect(parseRupeeInput(',50')).toBeNull();
    expect(parseRupeeInput('1.2.3')).toBeNull();
  });
});

describe('parseCount', () => {
  it('accepts plain whole numbers inside the range', () => {
    expect(parseCount('1', 1, 120)).toBe(1);
    expect(parseCount(' 12 ', 1, 120)).toBe(12);
    expect(parseCount('120', 1, 120)).toBe(120);
  });

  it('rejects the same exotic numerics as the rupee field', () => {
    expect(parseCount('0x10', 1, 120)).toBeNull();
    expect(parseCount('1e2', 1, 120)).toBeNull();
    expect(parseCount('1.5', 1, 120)).toBeNull();
    expect(parseCount('-3', 1, 120)).toBeNull();
    expect(parseCount('', 1, 120)).toBeNull();
    expect(parseCount('121', 1, 120)).toBeNull();
    expect(parseCount('0', 1, 120)).toBeNull();
  });
});

describe('splitPaise', () => {
  it('splits so the parts sum back exactly', () => {
    expect(splitPaise(100_000, 3)).toEqual([33_334, 33_333, 33_333]);
    expect(sumPaise(splitPaise(100_000, 3))).toBe(100_000);
    expect(sumPaise(splitPaise(149_900, 7))).toBe(149_900);
  });

  it('handles the degenerate cases', () => {
    expect(splitPaise(100, 1)).toEqual([100]);
    expect(splitPaise(100, 0)).toEqual([]);
  });
});
