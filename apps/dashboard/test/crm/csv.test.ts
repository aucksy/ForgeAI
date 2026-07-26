import { describe, expect, it } from 'vitest';

import { CSV_BOM, csvDocument, csvField, csvFilename, toCsv } from '../../src/crm/logic/csv';

describe('escaping', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvField('Riya Sharma')).toBe('Riya Sharma');
    expect(csvField(1499)).toBe('1499');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(csvField('12 MG Road, Jaipur')).toBe('"12 MG Road, Jaipur"');
    expect(csvField('said "yes"')).toBe('"said ""yes"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
    expect(csvField('carriage\rreturn')).toBe('"carriage\rreturn"');
  });

  it('preserves padding that would otherwise be eaten', () => {
    expect(csvField('  spaced  ')).toBe('"  spaced  "');
  });

  it('writes an empty cell for nothing, and for a number that is not one', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvField(Number.NaN)).toBe('');
    expect(csvField(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('keeps a legitimate zero', () => {
    expect(csvField(0)).toBe('0');
  });
});

describe('a spreadsheet must not execute the gym’s data', () => {
  it('defuses every formula lead character', () => {
    // A member note or a UPI reference is free text. Without this, opening the
    // export runs it.
    expect(csvField('=cmd|calc')).toBe('"\'=cmd|calc"');
    expect(csvField('+1+1')).toBe('"\'+1+1"');
    expect(csvField('-2+3')).toBe('"\'-2+3"');
    expect(csvField('@SUM(A1)')).toBe('"\'@SUM(A1)"');
  });

  it('survives the round trip into a full document', () => {
    // The exact-equality tests above already pin the leading quote, so asserting
    // `startsWith('"')` on the same input proved nothing. This exercises the path
    // that actually reaches disk: guarded, quoted, comma-joined, BOM-prefixed.
    const doc = csvDocument(['Note'], [['=HYPERLINK("http://evil","click")']]);
    expect(doc).toBe(`${CSV_BOM}Note\r\n"'=HYPERLINK(""http://evil"",""click"")"`);
  });

  it('does not touch a negative NUMBER, which is real data', () => {
    expect(csvField(-500)).toBe('-500');
  });
});

describe('the document', () => {
  const headers = ['Receipt', 'Member', 'Amount'];
  const rows = [
    ['2026-27/0001', 'Riya Sharma', 1499],
    ['2026-27/0002', 'Arjun, Mehta', 3000],
  ];

  it('is CRLF separated with no trailing newline', () => {
    expect(toCsv(headers, rows)).toBe(
      'Receipt,Member,Amount\r\n2026-27/0001,Riya Sharma,1499\r\n2026-27/0002,"Arjun, Mehta",3000',
    );
  });

  it('writes a header-only file when there is nothing to report', () => {
    expect(toCsv(headers, [])).toBe('Receipt,Member,Amount');
  });

  it('carries a BOM so Excel reads ₹ and Indian names correctly', () => {
    const doc = csvDocument(headers, rows);
    expect(doc.startsWith(CSV_BOM)).toBe(true);
    expect(doc.slice(1)).toBe(toCsv(headers, rows));
  });
});

describe('filenames', () => {
  it('slugs a gym name and a date range into something a browser will save', () => {
    expect(csvFilename(['Iron Temple Fitness', 'collections', '2026-07-01', '2026-07-31'])).toBe(
      'iron-temple-fitness-collections-2026-07-01-2026-07-31.csv',
    );
  });

  it('never produces a name that is only punctuation', () => {
    expect(csvFilename(['///'])).toBe('export.csv');
  });
});
