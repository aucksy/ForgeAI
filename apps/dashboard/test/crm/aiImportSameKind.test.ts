import { describe, expect, it } from 'vitest';

import { aiAnswer, applyAiPicks, sheetStats } from '../../src/crm/logic/aiImport';
import { guessColumns } from '../../src/crm/logic/importMembers';

// Owner's migration test, 30 Oct 2026: the live AI's real answer for a common Indian gym sheet.
describe('AI import: a money or date column our rules placed never moves to another field of its kind', () => {
  const headers = ['Sr No', 'Member Name', 'Mob No.', 'DOJ', 'Package', 'Fees Paid', 'Balance', 'Expiry', 'Gender', 'Trainer', 'Remarks'];
  const rows = [
    headers,
    ['1', 'Asha K', '9876543210', '12/03/2025', '3 Months', '4500', '0', '11/06/2025', 'F', 'Ravi', 'knee'],
    ['2', 'Ravi S', '9876501234', '01-04-2025', 'Yearly', '12000', '2000', '31-03-2026', 'M', 'Sunil', ''],
    ['3', 'Meena P', '9812345678', '15 May 2025', '1 Month', '1800', '500', '14 Jun 2025', 'F', '', 'am'],
  ];
  const live = {
    columns: [
      { column: 0, target: 'ignore', confidence: 1 },
      { column: 1, target: 'fullName', confidence: 1 },
      { column: 2, target: 'phone', confidence: 1 },
      { column: 3, target: 'startDate', confidence: 0.9 },
      { column: 4, target: 'plan', confidence: 1 },
      { column: 5, target: 'total', confidence: 0.9 },
      { column: 6, target: 'due', confidence: 0.8 },
      { column: 7, target: 'expiry', confidence: 1 },
      { column: 8, target: 'gender', confidence: 1 },
      { column: 9, target: 'extra:Trainer', confidence: 0.8 },
      { column: 10, target: 'notes', confidence: 1 },
    ],
    provider: 'gemini',
    left: 19,
  };
  it('"Fees Paid" stays Fees paid and "DOJ" stays Joining date; the AI only says what it thinks', () => {
    const answer = aiAnswer(200, live, headers.length);
    if (!answer.ok) throw new Error('the live answer must read');
    const out = applyAiPicks(guessColumns(headers), answer.picks, [], headers, sheetStats(rows, 0, headers.length));
    expect(out.map.amount).toBe(5);
    expect(out.map.total).toBeNull();
    expect(out.map.joinedOn).toBe(3);
    expect(out.map.startDate).toBeNull();
    expect(out.map.due).toBe(6);
    expect(out.held.join(' ')).toContain('Fees Paid');
    expect(out.extras[9]).toMatchObject({ label: 'Trainer', on: true });
  });
  it('a second live sheet: every AI pick lands, so the fix blocks only same-kind moves', () => {
    const h = ['Name of Member', 'Contact', 'Admission Date', 'Renewal Date', 'Time', 'Plan', 'Total Fee', 'Amt', 'Due Amt', 'Valid Upto', 'DOB', 'Paid?'];
    const r = [
      h,
      ['Asha K', '9876543210', '05/01/2024', '05/09/2025', '6-7 AM', 'Quarterly', '4500', '4500', '', '04/12/2025', '14/08/1995', 'Yes'],
      ['Ravi S', '9876501234', '12/02/2024', '12/08/2025', 'Evening', 'Half Yearly', '8000', '6000', '2000', '11/02/2026', '', 'No'],
      ['Meena P', '9812345678', '20/06/2025', '20/06/2025', '7-8 PM', 'Monthly + PT', '3500', '3500', '0', '19/07/2025', '02/11/2001', 'Yes'],
    ];
    const want = ['fullName', 'phone', 'joinedOn', 'startDate', 'batch', 'plan', 'total', 'amount', 'due', 'expiry', 'dateOfBirth', 'paidFlag'] as const;
    const answer = aiAnswer(200, { columns: want.map((target, column) => ({ column, target, confidence: 1 })), provider: 'gemini', left: 18 }, h.length);
    if (!answer.ok) throw new Error('the live answer must read');
    const out = applyAiPicks(guessColumns(h), answer.picks, [], h, sheetStats(r, 0, h.length));
    want.forEach((f, i) => expect([f, out.map[f]]).toEqual([f, i]));
  });
});
