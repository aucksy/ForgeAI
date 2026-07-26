/**
 * GST on gym services — PURE.
 *
 * THE DECISION THAT MATTERS: a gym's price is GST-INCLUSIVE. An Indian value gym
 * quotes "₹1,500 a month" and takes ₹1,500 — it does not quote ₹1,500 and collect
 * ₹1,575. So the tax is BACK-CALCULATED out of the amount actually received, never
 * added on top. Adding it on top would print a receipt for more money than the gym
 * took, which is the worst failure this file could have.
 *
 * That choice also keeps the rest of the CRM out of it: plan prices, part-payments
 * and dues are all stored as the gross the member pays, so nothing about GST can
 * change a balance. The tax split exists only on the printed receipt.
 *
 * RATE. GST on gym / fitness services was cut from 18% (with input tax credit) to
 * 5% (without ITC) effective 22 September 2025 — 56th GST Council. The rate is
 * therefore chosen by the date the money was RECEIVED, not by today: reprinting a
 * receipt from 2025 must show the tax that applied then, not the tax that applies
 * now. (Source: `docs/overhaul/research/R1-findings.txt`, fact-checked 2026-07.)
 *
 * PLACE OF SUPPLY. A gym is used where it stands, so the supply is always intra-
 * state and the tax splits into CGST + SGST. IGST cannot arise here, which is why
 * there is no code for it — a field that is always zero is a field someone will
 * eventually fill in wrongly.
 */

import type { DateISO } from './dates';
import type { Paise } from './money';

/** SAC for "physical well-being including health club and fitness centre" services. */
export const GYM_SAC_CODE = '999723';

/** The day the 5%-without-ITC rate took effect (56th GST Council). */
export const GST_RATE_CUTOVER: DateISO = '2025-09-22';

/** Current rate on gym services: 5%, no input tax credit. */
export const GST_RATE_CURRENT = 5;

/** What applied before the cutover: 18% with ITC. */
export const GST_RATE_LEGACY = 18;

/** The rate that applied on the day the money was received. */
export function gstRateForDate(paidOn: DateISO): number {
  return paidOn >= GST_RATE_CUTOVER ? GST_RATE_CURRENT : GST_RATE_LEGACY;
}

export interface GstSplit {
  /** Percentage applied, e.g. 5. */
  ratePct: number;
  /** What the member actually paid — always `taxableP + taxP`, to the paisa. */
  grossP: Paise;
  /** Value of the service before tax. */
  taxableP: Paise;
  /** Total tax inside `grossP`. */
  taxP: Paise;
  /** Central half. */
  cgstP: Paise;
  /** State half. `cgstP + sgstP === taxP` exactly, even for an odd number of paise. */
  sgstP: Paise;
}

/**
 * Split a GST-INCLUSIVE amount into taxable value and tax.
 *
 * The subtraction is deliberate: rounding the taxable value and then rounding the
 * tax independently can leave the two failing to add back to what was collected,
 * so the printed receipt would disagree with the ledger by a paisa. Taxable is
 * rounded once; tax is whatever is left. Same trick for the CGST/SGST halves —
 * one is floored, the other takes the remainder — so an odd paisa of tax lands
 * somewhere rather than vanishing.
 */
export function splitInclusiveGst(grossPRaw: Paise, ratePct: number): GstSplit {
  const grossP = Math.max(0, Math.round(grossPRaw));
  const rate = Number.isFinite(ratePct) && ratePct > 0 ? ratePct : 0;

  const taxableP = rate === 0 ? grossP : Math.round((grossP * 100) / (100 + rate));
  const taxP = grossP - taxableP;
  const cgstP = Math.floor(taxP / 2);

  return { ratePct: rate, grossP, taxableP, taxP, cgstP, sgstP: taxP - cgstP };
}

// ---------------------------------------------------------------- GSTIN

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const GSTIN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Valid state codes: 01–38 are the states and union territories, 97 is "Other
 * Territory" (offshore) and 99 is centre jurisdiction.
 */
function isValidStateCode(code: string): boolean {
  const n = Number(code);
  return (n >= 1 && n <= 38) || n === 97 || n === 99;
}

/**
 * Full GSTIN check including the mod-36 checksum character.
 *
 * The checksum is what makes this worth doing: shape alone accepts a transposed
 * digit, and a wrong GSTIN printed on every receipt for a year is a problem the
 * gym only finds out about from their accountant.
 */
export function isValidGstin(raw: string): boolean {
  const gstin = raw.trim().toUpperCase();
  if (!GSTIN_RE.test(gstin)) return false;
  if (!isValidStateCode(gstin.slice(0, 2))) return false;
  return gstin[14] === gstinChecksumChar(gstin.slice(0, 14));
}

/** The 15th character for a 14-character GSTIN body. */
export function gstinChecksumChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const value = GSTIN_ALPHABET.indexOf(body[i]);
    if (value < 0) return '';
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_ALPHABET[(36 - (sum % 36)) % 36];
}

/** The two-digit state code inside a GSTIN, or null if it isn't one. */
export function gstStateCode(raw: string): string | null {
  const gstin = raw.trim().toUpperCase();
  return isValidGstin(gstin) ? gstin.slice(0, 2) : null;
}

/**
 * Should this receipt carry a tax breakup?
 *
 * Only when the gym has a valid GSTIN. Printing a tax split for a gym that is not
 * registered is not a cosmetic error — it is a document claiming tax was collected
 * on behalf of the government when it was not.
 */
export function gstAppliesTo(gstin: string | null | undefined): boolean {
  return typeof gstin === 'string' && isValidGstin(gstin);
}
