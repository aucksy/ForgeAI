/** Launch D8: "Download all your gym's data" — every record, readable, money in rupees. */
import { describe, expect, it } from 'vitest';

import type { CrmSnapshot } from '../../src/crm/data/adapter';
import { exportFileBase, gymExportSheets } from '../../src/crm/logic/gymExport';

const snap = {
  gym: { gymId: 'g1', name: 'Shakti Gym', joinCode: 'SHAK01', phone: '9829012345', address: null, gstin: null, createdAt: Date.UTC(2026, 9, 1) },
  members: [{ id: 'm1', fullName: 'Asha Verma', phone: '9829011111', email: null, gender: null, dateOfBirth: null, address: null, emergencyName: null, emergencyPhone: null, joinedOn: '2026-10-01', photoUri: null, notes: null, archived: false, appUserId: 'u1', createdAt: 0 }],
  plans: [{ id: 'p1', name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 150000, joiningFeeP: 50000, description: null, active: true, sortOrder: 0, createdAt: 0, updatedAt: 0 }],
  memberships: [{ id: 'ms1', memberId: 'm1', planId: 'p1', planName: 'Monthly', priceP: 150000, joiningFeeP: 50000, listPriceP: 150000, startsOn: '2026-10-01', endsOn: '2026-10-31', cancelled: false, notes: null, soldBy: null }],
  payments: [
    { id: 'pay1', memberId: 'm1', membershipId: 'ms1', amountP: 200000, method: 'upi', paidOn: '2026-10-01', receiptNo: 'R-2026-27/1', reference: null, note: null, voided: false, voidReason: null, collectedBy: null },
    { id: 'pay2', memberId: 'gone', membershipId: null, amountP: 5050, method: 'cash', paidOn: '2026-10-02', receiptNo: 'R-2026-27/2', reference: null, note: null, voided: true, voidReason: 'typo', collectedBy: null },
  ],
  visits: [{ id: 'v1', memberId: 'm1', visitedOn: '2026-10-02', checkedInAt: Date.UTC(2026, 9, 2, 1, 30), source: 'desk' }],
  enquiries: [],
  expenses: [{ id: 'e1', spentOn: '2026-10-03', amountP: 99900, category: 'rent', note: null, createdAt: 0 }],
  workoutPlans: [],
} as unknown as CrmSnapshot;

describe('gym export (D8)', () => {
  const sheets = gymExportSheets(snap, new Date('2026-10-21T10:00:00Z'));
  const sheet = (n: string) => sheets.find((s) => s.name === n)!.rows;

  it('one sheet per kind of record, each with a header and every row', () => {
    expect(sheets.map((s) => s.name)).toEqual(['About', 'Members', 'Plans', 'Memberships', 'Payments', 'Check-ins', 'Enquiries', 'Expenses']);
    expect(sheet('Members')).toHaveLength(2);
    expect(sheet('Payments')).toHaveLength(3);
    expect(sheet('Enquiries')).toHaveLength(1);
  });

  it('money in rupees, names next to their rows, voided payments kept and marked', () => {
    expect(sheet('Payments')[1].slice(0, 5)).toEqual(['R-2026-27/1', 'Asha Verma', 'm1', '2026-10-01', 2000]);
    expect(sheet('Payments')[2]).toContain('(removed member)');
    expect(sheet('Payments')[2]).toContain('typo');
    expect(sheet('Payments')[2][4]).toBe(50.5);
    expect(sheet('Expenses')[1][1]).toBe(999);
    expect(sheet('Members')[1].at(-1)).toBe(true);
  });

  it('a file name any phone or computer accepts', () => {
    expect(exportFileBase('Shakti Gym', new Date('2026-10-21T10:00:00Z'))).toBe('Shakti Gym data 2026-10-21');
    expect(exportFileBase('A/B: "Gym"*', new Date('2026-10-21T10:00:00Z'))).toBe('A B Gym data 2026-10-21');
    expect(exportFileBase('???', new Date('2026-10-21T10:00:00Z'))).toBe('Gym data 2026-10-21');
  });
});
