import { describe, expect, it } from 'vitest';

import {
  GST_RATE_CURRENT,
  GST_RATE_CUTOVER,
  GST_RATE_LEGACY,
  gstAppliesTo,
  gstinChecksumChar,
  gstRateForDate,
  gstStateCode,
  isValidGstin,
  splitInclusiveGst,
} from '../../src/crm/logic/gst';
import { VALID_GSTIN } from './fixtures';

describe('the rate follows the date the money was taken', () => {
  it('switches exactly on 22 Sep 2025, not around it', () => {
    // Literals, not the module's own constants: comparing
    // `gstRateForDate(GST_RATE_CUTOVER)` against `GST_RATE_CURRENT` passes for
    // ANY cutover date and any rate, so it could not have caught a wrong one.
    expect(gstRateForDate('2025-09-21')).toBe(18);
    expect(gstRateForDate('2025-09-22')).toBe(5);
    expect(gstRateForDate('2025-09-23')).toBe(5);
  });

  it('holds the two rates far from the boundary', () => {
    expect(gstRateForDate('2024-01-01')).toBe(18);
    expect(gstRateForDate('2026-07-26')).toBe(5);
  });

  it('publishes the constants the rest of the app reads', () => {
    expect(GST_RATE_CUTOVER).toBe('2025-09-22');
    expect(GST_RATE_CURRENT).toBe(5);
    expect(GST_RATE_LEGACY).toBe(18);
  });
});

describe('tax is taken OUT of the amount, never added on top', () => {
  it('splits ₹1,500 at 5% into taxable + tax that add back exactly', () => {
    const split = splitInclusiveGst(150_000, 5);
    expect(split.grossP).toBe(150_000);
    expect(split.taxableP).toBe(142_857);
    expect(split.taxP).toBe(7_143);
    expect(split.taxableP + split.taxP).toBe(150_000);
  });

  it('never invents money: taxable + tax === gross for a wide sweep of amounts', () => {
    for (let gross = 0; gross <= 500_000; gross += 997) {
      for (const rate of [5, 12, 18, 28]) {
        const s = splitInclusiveGst(gross, rate);
        expect(s.taxableP + s.taxP).toBe(gross);
        expect(Number.isInteger(s.taxableP)).toBe(true);
        expect(Number.isInteger(s.taxP)).toBe(true);
        expect(s.taxP).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('halves CGST and SGST so they still sum to the tax on an odd paisa', () => {
    const split = splitInclusiveGst(150_000, 5);
    expect(split.taxP % 2).toBe(1); // 7,143 paise — genuinely odd, so this case bites
    expect(split.cgstP + split.sgstP).toBe(split.taxP);
    expect(split.sgstP - split.cgstP).toBe(1);
  });

  it('keeps the halves exact across a sweep', () => {
    for (let gross = 1; gross <= 200_000; gross += 331) {
      const s = splitInclusiveGst(gross, 5);
      expect(s.cgstP + s.sgstP).toBe(s.taxP);
    }
  });

  it('a rate of zero leaves the whole amount taxable and no tax', () => {
    const s = splitInclusiveGst(150_000, 0);
    expect(s.taxableP).toBe(150_000);
    expect(s.taxP).toBe(0);
    expect(s.cgstP).toBe(0);
    expect(s.sgstP).toBe(0);
  });

  it('is never larger than the amount received', () => {
    // The failure this guards is the one that matters: a receipt that says the
    // gym took more than it took.
    for (const gross of [1, 99, 100, 149_900, 1_000_000]) {
      const s = splitInclusiveGst(gross, 18);
      expect(s.grossP).toBe(gross);
      expect(s.taxableP).toBeLessThanOrEqual(gross);
    }
  });

  it('clamps a negative or fractional amount rather than propagating it', () => {
    expect(splitInclusiveGst(-500, 5).grossP).toBe(0);
    expect(splitInclusiveGst(100.4, 5).grossP).toBe(100);
  });
});

describe('GSTIN validation', () => {
  it('accepts the published example', () => {
    expect(isValidGstin(VALID_GSTIN)).toBe(true);
    expect(isValidGstin('24AAACC1206D1ZM')).toBe(true);
  });

  it('is case- and whitespace-tolerant on input', () => {
    expect(isValidGstin(`  ${VALID_GSTIN.toLowerCase()}  `)).toBe(true);
  });

  it('rejects a wrong checksum even though the shape is perfect', () => {
    // 29AAACR5055K1Z5 has a valid shape and a valid state code; only the last
    // character is wrong. Shape-only validation would wave this through.
    expect('29AAACR5055K1Z5').toMatch(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/);
    expect(isValidGstin('29AAACR5055K1Z5')).toBe(false);
    expect(gstinChecksumChar('29AAACR5055K1Z')).toBe('3');
  });

  it('rejects an impossible state code', () => {
    // 39 is not an assigned state code; the rest of the string is untouched.
    const body = `39${VALID_GSTIN.slice(2, 14)}`;
    expect(isValidGstin(body + gstinChecksumChar(body))).toBe(false);
  });

  it('accepts the special 97 and 99 jurisdictions', () => {
    for (const code of ['97', '99']) {
      const body = `${code}${VALID_GSTIN.slice(2, 14)}`;
      expect(isValidGstin(body + gstinChecksumChar(body))).toBe(true);
    }
  });

  it('rejects the wrong length and a missing Z', () => {
    expect(isValidGstin(VALID_GSTIN.slice(0, 14))).toBe(false);
    expect(isValidGstin(`${VALID_GSTIN}X`)).toBe(false);
    expect(isValidGstin(`${VALID_GSTIN.slice(0, 13)}Y${VALID_GSTIN[14]}`)).toBe(false);
  });

  it('reads back the state code only from a valid GSTIN', () => {
    expect(gstStateCode(VALID_GSTIN)).toBe('27');
    expect(gstStateCode('29AAACR5055K1Z5')).toBeNull();
  });
});

describe('a gym without a valid GSTIN gets no tax lines', () => {
  it('refuses null, empty and malformed', () => {
    expect(gstAppliesTo(null)).toBe(false);
    expect(gstAppliesTo(undefined)).toBe(false);
    expect(gstAppliesTo('')).toBe(false);
    expect(gstAppliesTo('NOTAGSTIN')).toBe(false);
    expect(gstAppliesTo('29AAACR5055K1Z5')).toBe(false);
  });

  it('accepts a real one', () => {
    expect(gstAppliesTo(VALID_GSTIN)).toBe(true);
  });
});
