/**
 * What an import will really save as receipts, before the owner taps Add (UAT U-A10, 17 Oct 2026).
 *
 * The "Plans and payments" line used to add up the paid column of every row. A payments list that
 * keeps a running "paid so far" (2,000, then 4,500) said ₹6,500 for that member, while the import
 * rightly saves ₹2,000 + ₹2,500 = ₹4,500: the owner was told more money than the receipts hold.
 * Rather than a second copy of the import's rules (running totals, a balance column, a row copied
 * twice, a plan already here), this runs the import itself on a scratch copy of the gym, in memory,
 * and reads back what it made. Nothing is saved.
 */

import type { DateISO } from '../logic/dates';
import type { Paise } from '../logic/money';
import type { MemberDraft } from '../types';
import type { CrmSnapshot, ImportTermItem } from './adapter';
import { LocalCrmData, memoryStore, SCHEMA_VERSION } from './local';

export interface ImportMoneyPreview {
  /** Receipts the import would make. */
  receipts: number;
  /** Their total. */
  paidP: Paise;
}

const PREVIEW_ID = 'import-preview';

/**
 * Run the import's two saves (the new members, then every plan and payment row, in file order) on a
 * copy of `snapshot`. Null when the copy refuses them (the import itself will say why).
 */
export async function previewImportMoney(
  snapshot: CrmSnapshot,
  adds: readonly MemberDraft[],
  terms: readonly ImportTermItem[],
  today: DateISO,
): Promise<ImportMoneyPreview | null> {
  try {
    const copy = new LocalCrmData({
      store: memoryStore(JSON.stringify({ version: SCHEMA_VERSION, snapshot })),
      today: () => today,
    });
    if (adds.length > 0) await copy.createMembers(adds.map((d) => ({ ...d, importId: PREVIEW_ID })));
    await copy.importTerms(terms, PREVIEW_ID);
    const made = (await copy.load()).payments.filter((p) => p.importId === PREVIEW_ID);
    return { receipts: made.length, paidP: made.reduce((t, p) => t + p.amountP, 0) };
  } catch (e) {
    // The import itself says why when the owner taps Add; the line just leaves the money out.
    console.warn('[ForgeErr] import preview:', e);
    return null;
  }
}
