import { describe, expect, it } from 'vitest';

import { financialYear, nextReceiptNo, parseReceiptNo } from '../../src/crm/logic/receipts';
import { makePayment } from './fixtures';

describe('financialYear', () => {
  it('runs 1 April to 31 March, the Indian convention', () => {
    expect(financialYear('2026-04-01')).toBe('2026-27');
    expect(financialYear('2026-07-26')).toBe('2026-27');
    expect(financialYear('2027-03-31')).toBe('2026-27');
    expect(financialYear('2027-04-01')).toBe('2027-28');
    expect(financialYear('2026-03-31')).toBe('2025-26');
  });

  it('handles a century roll in the short suffix', () => {
    expect(financialYear('2099-05-01')).toBe('2099-00');
  });
});

describe('parseReceiptNo', () => {
  it('round-trips a well-formed number', () => {
    expect(parseReceiptNo('2026-27/0042')).toEqual({ fy: '2026-27', seq: 42 });
    expect(parseReceiptNo(' 2026-27/0001 ')).toEqual({ fy: '2026-27', seq: 1 });
  });

  it('rejects anything that is not one', () => {
    expect(parseReceiptNo('42')).toBeNull();
    expect(parseReceiptNo('2026/0042')).toBeNull();
    expect(parseReceiptNo('2026-27/42')).toBeNull(); // must be zero-padded to 4
    expect(parseReceiptNo('')).toBeNull();
  });
});

describe('nextReceiptNo', () => {
  it('starts a fresh series at 0001', () => {
    expect(nextReceiptNo([], '2026-07-26')).toBe('2026-27/0001');
  });

  it('continues the series for that financial year', () => {
    const existing = [{ receiptNo: '2026-27/0001' }, { receiptNo: '2026-27/0002' }];
    expect(nextReceiptNo(existing, '2026-07-26')).toBe('2026-27/0003');
  });

  it('restarts the count in a new financial year', () => {
    const existing = [{ receiptNo: '2026-27/0009' }];
    expect(nextReceiptNo(existing, '2027-04-01')).toBe('2027-28/0001');
  });

  it('slots a back-dated receipt into the right year’s series', () => {
    const existing = [
      { receiptNo: '2025-26/0004' },
      { receiptNo: '2026-27/0001' },
      { receiptNo: '2026-27/0002' },
    ];
    expect(nextReceiptNo(existing, '2026-02-10')).toBe('2025-26/0005');
    expect(nextReceiptNo(existing, '2026-07-26')).toBe('2026-27/0003');
  });

  it('takes the highest issued number, not the array order or count', () => {
    // A ledger sorted by anything other than receipt number must not reissue one.
    const existing = [{ receiptNo: '2026-27/0007' }, { receiptNo: '2026-27/0003' }];
    expect(nextReceiptNo(existing, '2026-07-26')).toBe('2026-27/0008');
  });

  it('does not reuse a voided receipt’s number', () => {
    // A gap in a receipt book is a question from an auditor; a duplicate is
    // worse. Passing REAL payment rows (one voided) is the point: the previous
    // version of this test passed rows with no `voided` field at all, so it was
    // byte-identical to "continues the series" and could not fail.
    const existing = [
      makePayment({ receiptNo: '2026-27/0001', paidOn: '2026-07-01' }),
      makePayment({ receiptNo: '2026-27/0002', paidOn: '2026-07-02', voided: true, voidReason: 'entered twice' }),
    ];
    expect(existing.some((p) => p.voided)).toBe(true);
    expect(nextReceiptNo(existing, '2026-07-26')).toBe('2026-27/0003');
  });

  it('ignores rows whose receipt number is unparseable', () => {
    const existing = [{ receiptNo: 'legacy-7' }, { receiptNo: '2026-27/0002' }];
    expect(nextReceiptNo(existing, '2026-07-26')).toBe('2026-27/0003');
  });

  it('widens past four digits rather than colliding', () => {
    const existing = [{ receiptNo: '2026-27/9999' }];
    expect(nextReceiptNo(existing, '2026-07-26')).toBe('2026-27/10000');
  });
});

describe('a receipt number is always readable back', () => {
  it('pads a short year so the series can still be parsed', () => {
    // `RECEIPT_RE` demands four year digits. An unpadded start year produced
    // `1-02/0001`, which `parseReceiptNo` then refused — so `nextReceiptNo` saw
    // no prior receipts and issued the same number again.
    expect(financialYear('0002-01-01')).toBe('0001-02');
    expect(parseReceiptNo('0001-02/0001')).toEqual({ fy: '0001-02', seq: 1 });
  });

  it('never issues the same number twice, even for an absurd date', () => {
    const first = nextReceiptNo([], '0002-01-01');
    const second = nextReceiptNo([{ receiptNo: first }], '0002-01-01');
    expect(second).not.toBe(first);
    expect(parseReceiptNo(second)?.seq).toBe(2);
  });

  it('round-trips every financial year it can produce', () => {
    for (const day of ['0002-01-01', '1999-12-31', '2026-07-26', '2099-04-01']) {
      const fy = financialYear(day);
      expect(parseReceiptNo(`${fy}/0001`)).not.toBeNull();
    }
  });
});
