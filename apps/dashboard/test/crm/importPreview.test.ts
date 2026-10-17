import { describe, expect, it } from 'vitest';

import { previewImportMoney } from '../../src/crm/data/importPreview';
import { emptySnapshot, LocalCrmData, memoryStore, SCHEMA_VERSION } from '../../src/crm/data/local';
import { planImport, guessColumns, termsPreview } from '../../src/crm/logic/importMembers';

const TODAY = '2026-10-17';

/** A payments list: Ravi's quarter paid in two goes with a running "paid so far", and Sita's month. */
const SHEET = [
  ['Name', 'Mobile', 'Plan', 'Plan start', 'Valid till', 'Plan price', 'Amount paid', 'Payment date'],
  ['Ravi Kumar', '9829050001', 'Quarterly', '01/08/2026', '31/10/2026', '6000', '2000', '01/08/2026'],
  ['Ravi Kumar', '9829050001', 'Quarterly', '01/08/2026', '31/10/2026', '6000', '4500', '01/09/2026'],
  ['Sita Devi', '9829050002', 'Monthly', '05/10/2026', '04/11/2026', '1500', '1500', '05/10/2026'],
];

function inputs(rows: string[][]) {
  const plan = planImport(rows, 0, guessColumns(rows[0]!), [], TODAY);
  const adds = plan.rows.filter((r) => r.status === 'add' && r.draft).map((r) => r.draft!);
  const terms = plan.rows
    .filter((r) => r.term && r.draft && (r.status === 'add' || r.existing !== null || r.sameAsRow !== null))
    .sort((a, b) => a.rowNumber - b.rowNumber)
    .map((r) => ({ phone: r.draft!.phone, term: r.term! }));
  return { plan, adds, terms };
}

describe('U-A10: the import preview says the money the receipts will really hold', () => {
  it('a running "paid so far" is not added up twice: Rs 6,000 on 3 receipts, not Rs 8,000', async () => {
    const { plan, adds, terms } = inputs(SHEET);
    // The old figure added every row's paid column.
    expect(termsPreview(plan.rows).paidP).toBe(800000);
    const preview = await previewImportMoney(emptySnapshot(1, 'Gym'), adds, terms, TODAY);
    expect(preview).toEqual({ receipts: 3, paidP: 600000 });
  });

  it('matches what the import then saves, and saves nothing itself', async () => {
    const { adds, terms } = inputs(SHEET);
    const snapshot = emptySnapshot(1, 'Gym');
    const before = JSON.stringify(snapshot);
    const preview = await previewImportMoney(snapshot, adds, terms, TODAY);
    expect(JSON.stringify(snapshot)).toBe(before);
    const db = new LocalCrmData({ store: memoryStore(JSON.stringify({ version: SCHEMA_VERSION, snapshot })), today: () => TODAY });
    await db.createMembers(adds.map((d) => ({ ...d, importId: 'real' })));
    await db.importTerms(terms, 'real');
    const paid = (await db.load()).payments.reduce((t, p) => t + p.amountP, 0);
    expect(preview?.paidP).toBe(paid);
  });

  it('single payments on separate rows still add up (C7-37)', async () => {
    const rows = [SHEET[0]!, ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '2000', '01/08/2026'], ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '2500', '01/09/2026']];
    const { adds, terms } = inputs(rows);
    expect(await previewImportMoney(emptySnapshot(1, 'Gym'), adds, terms, TODAY)).toEqual({ receipts: 2, paidP: 450000 });
  });
});
