/**
 * Data migration (15 Oct 2026, owner: "they will be concerned about their data") — a sheet row's
 * plan becomes a REAL membership (and its money a real receipt), not a line in the notes. PURE.
 *
 * Every rival's export says it differently: a plan name, maybe a start and an end, maybe a price,
 * what was paid, what is due. This reads whatever the row has and never invents money:
 *  - the end date is the sheet's own; without one, the start + the plan's length (from its name,
 *    "3 Months" / "Quarterly" / "Annual" / "45 days"); without either, no membership (the plan
 *    stays in the notes, as before);
 *  - the start is the sheet's own; else the end minus the plan's length; else the joining date
 *    (when it is not after the end);
 *  - the price is the plan's price column; else paid + due; else what was paid (never a made-up
 *    due); what was paid is the paid column, else price − due;
 *  - the plan's length (for a new plan of that name) is whole months when the start and end are
 *    whole months apart (as the panel itself makes them), else days.
 */
import type { DurationUnit, Paise } from '../types';
import { addDays, addMonths, diffDays, type DateISO } from './dates';
import { computeEndDate } from './membership';

export interface ImportTerm {
  planName: string;
  startsOn: DateISO;
  endsOn: DateISO;
  /** The term's whole price (paise). 0 = the sheet says nothing about money. */
  priceP: Paise;
  /** Already paid (paise); becomes one receipt dated `paidOn`. 0 = no receipt. */
  paidP: Paise;
  /** The receipt's date: the sheet's payment date, else the start (16 Oct 2026). */
  paidOn: DateISO;
  /** The plan's length, for a NEW plan of this name. */
  length: { unit: DurationUnit; count: number };
}

/** A plan name's own length: "3 Months", "Quarterly", "1 yr", "45 days", "Monthly". PURE. */
export function lengthFromPlanName(name: string): { unit: DurationUnit; count: number } | null {
  const n = name.toLowerCase();
  const num = /(\d{1,3})\s*(?:-|\s)?\s*(months?|mnths?|mths?|mon|m\b|years?|yrs?|y\b|days?|d\b|weeks?|wks?)/.exec(n);
  if (num) {
    const c = Number(num[1]);
    const u = num[2];
    if (c > 0) {
      if (/^y/.test(u)) return { unit: 'month', count: c * 12 };
      if (/^d/.test(u)) return { unit: 'day', count: c };
      if (/^w/.test(u)) return { unit: 'day', count: c * 7 };
      return { unit: 'month', count: c };
    }
  }
  // Half a year before a year ("Half Yearly" contains "yearly").
  if (/\b(half[\s-]?year(ly)?|semi[\s-]?annual|6\s*monthly)\b/.test(n)) return { unit: 'month', count: 6 };
  if (/\b(annual|annually|yearly|year|saal|saalana)\b/.test(n)) return { unit: 'month', count: 12 };
  if (/\b(quarter(ly)?|teen mahine)\b/.test(n)) return { unit: 'month', count: 3 };
  if (/\b(monthly|month|mahina|mahine|maheena)\b/.test(n)) return { unit: 'month', count: 1 };
  if (/\b(weekly|week)\b/.test(n)) return { unit: 'day', count: 7 };
  return null;
}

/** The length between two days: whole months when they are (the panel's own way), else days. PURE. */
export function lengthBetween(startsOn: DateISO, endsOn: DateISO): { unit: DurationUnit; count: number } {
  for (let m = 1; m <= 36; m += 1) {
    if (computeEndDate(startsOn, 'month', m) === endsOn) return { unit: 'month', count: m };
  }
  return { unit: 'day', count: Math.max(1, diffDays(startsOn, endsOn) + 1) };
}

export interface TermInput {
  planName: string;
  startsOn: DateISO | null;
  endsOn: DateISO | null;
  joinedOn: DateISO | null;
  totalP: Paise | null;
  paidP: Paise | null;
  dueP: Paise | null;
  /** The row's payment date (a payments list), when the sheet has one. */
  paidOn?: DateISO | null;
}

/** The membership a row describes, or null when it does not describe one. PURE. */
export function termFromRow(t: TermInput): ImportTerm | null {
  const named = t.planName.trim();
  const fromName = named ? lengthFromPlanName(named) : null;
  let endsOn = t.endsOn;
  let startsOn = t.startsOn;
  if (!endsOn && startsOn && fromName) endsOn = computeEndDate(startsOn, fromName.unit, fromName.count);
  if (!endsOn) return null;
  if (!startsOn && fromName) {
    startsOn = fromName.unit === 'month' ? addMonths(addDays(endsOn, 1), -fromName.count) : addDays(endsOn, -(fromName.count - 1));
  }
  if (!startsOn && t.joinedOn && t.joinedOn <= endsOn) startsOn = t.joinedOn;
  if (!startsOn || startsOn > endsOn) return null;

  const paid = t.paidP != null && t.paidP > 0 ? t.paidP : null;
  const due = t.dueP != null && t.dueP > 0 ? t.dueP : null;
  const total = t.totalP != null && t.totalP > 0 ? t.totalP : null;
  let priceP = total ?? (paid != null && due != null ? paid + due : paid ?? due ?? 0);
  let paidP = paid ?? (total != null && due != null ? Math.max(0, total - due) : 0);
  if (paidP > priceP) priceP = paidP;
  priceP = Math.round(priceP);
  paidP = Math.round(paidP);

  const length = fromName ?? lengthBetween(startsOn, endsOn);
  return { planName: named || 'Imported plan', startsOn, endsOn, priceP, paidP, paidOn: t.paidOn ?? startsOn, length };
}
