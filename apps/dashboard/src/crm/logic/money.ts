/**
 * Money — INTEGER PAISE everywhere. Never floats.
 *
 * A gym CRM is a money product: plan prices, part-payments, outstanding dues and
 * receipts all have to add up exactly. Binary floating point cannot represent
 * 0.1 + 0.2 as 0.3, so a rupee-denominated `number` silently drifts once you sum
 * a few hundred part-payments. Every amount in this codebase is therefore a whole
 * number of paise (₹1,499 = 149900). Rupees exist only at the UI boundary — read
 * by `parseRupeeInput`, written by `formatINR`.
 */

/** A whole number of paise. 100 paise = ₹1. */
export type Paise = number;

/**
 * Largest amount we accept anywhere: ₹1,00,00,000 (1 crore) = 1,000,000,000 paise.
 * A single gym transaction above a crore is a typo, not a membership.
 */
export const MAX_PAISE: Paise = 1_000_000_000;

/** True for a safe, whole, non-negative paise amount within MAX_PAISE. */
export function isValidPaise(value: unknown): value is Paise {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_PAISE
  );
}

/** Rupees (possibly fractional) -> paise, rounded to the nearest paisa. */
export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) return 0;
  return Math.round(rupees * 100);
}

/** Paise -> rupees as a number. Display only — never accumulate on this. */
export function paiseToRupees(paise: Paise): number {
  return paise / 100;
}

/**
 * Indian-format currency: `₹1,49,900` (lakh grouping, not `₹149,900`).
 * Whole rupees drop the decimals — gym prices are round numbers and `₹1,499.00`
 * reads like a software invoice, not a gym receipt. Paise show only when present.
 */
export function formatINR(paise: Paise, opts?: { showDecimals?: boolean }): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const showDecimals = opts?.showDecimals ?? abs % 100 !== 0;
  const rupees = Math.floor(abs / 100);
  const rest = abs % 100;

  const grouped = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(rupees);
  const body = showDecimals ? `${grouped}.${String(rest).padStart(2, '0')}` : grouped;
  return `${negative ? '-' : ''}₹${body}`;
}

/** Compact form for dense tables and tiles: `₹1.5L`, `₹12.4k`, `₹900`. */
export function formatINRShort(paise: Paise): string {
  const negative = paise < 0;
  const rupees = Math.abs(Math.round(paise)) / 100;
  const sign = negative ? '-' : '';
  if (rupees >= 10_000_000) return `${sign}₹${trimZero(rupees / 10_000_000)}Cr`;
  if (rupees >= 100_000) return `${sign}₹${trimZero(rupees / 100_000)}L`;
  if (rupees >= 1_000) return `${sign}₹${trimZero(rupees / 1_000)}k`;
  return `${sign}₹${Math.round(rupees)}`;
}

function trimZero(n: number): string {
  const s = n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/**
 * Parse what a human typed into paise, or null if it isn't a plain amount.
 *
 * STRICT on purpose. `Number('0x20')` is 32 and `Number('1e3')` is 1000 — the
 * mobile app shipped exactly that bug once (a hex string accepted as a body
 * weight). A rupee field must accept only digits, one separator, and at most two
 * decimals. Accepts `₹`, thin/regular spaces, comma grouping, and a decimal comma
 * (`1499,50`) since Indian keyboards produce both separators.
 */
export function parseRupeeInput(text: string): Paise | null {
  const cleaned = text
    .replace(/[₹\s  ]/g, '')
    .trim();
  if (cleaned === '') return null;

  // Grouping must be WELL FORMED. Blindly deleting commas read `1,2,3,4` as
  // ₹123.40 — a wrong price a cashier would never spot. Accept either no commas
  // at all, or proper Indian lakh grouping (`12,34,567`).
  const isGrouped = (s: string) => /^\d{1,2}(,\d{2})*,\d{3}$/.test(s);
  const wholeOk = (s: string) => (s.includes(',') ? isGrouped(s) : /^\d+$/.test(s));

  let whole: string;
  let frac: string;

  const dotParts = cleaned.split('.');
  if (dotParts.length > 2) return null;

  if (dotParts.length === 2) {
    // A real decimal point. `1499.` is an unfinished number, not ₹1,499, and
    // `.50` has no rupee part at all.
    if (!/^\d{1,2}$/.test(dotParts[1])) return null;
    if (!wholeOk(dotParts[0])) return null;
    whole = dotParts[0];
    frac = dotParts[1];
  } else {
    const decimalComma = /^(.+),(\d{1,2})$/.exec(cleaned);
    if (decimalComma && !isGrouped(cleaned)) {
      // A trailing `,50` that is not valid grouping is a decimal comma.
      if (!wholeOk(decimalComma[1])) return null;
      whole = decimalComma[1];
      frac = decimalComma[2];
    } else {
      if (!wholeOk(cleaned)) return null;
      whole = cleaned;
      frac = '';
    }
  }

  const digits = whole.replace(/,/g, '');
  if (digits.length > 10) return null;

  const paise = Number(digits) * 100 + Number(frac.padEnd(2, '0') || '0');
  if (!isValidPaise(paise)) return null;
  return paise;
}

/**
 * Strict whole-number parse for counts (plan duration, quantities).
 *
 * `Number('0x10')` is 16 and `Number('1e2')` is 100 — the same trap
 * `parseRupeeInput` guards against, which the plan-duration field had fallen into.
 */
export function parseCount(text: string, min: number, max: number): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= min && n <= max ? n : null;
}

/** Sum that stays exact and never returns a non-integer. */
export function sumPaise(amounts: readonly Paise[]): Paise {
  let total = 0;
  for (const a of amounts) total += Math.round(a);
  return total;
}

/**
 * Split `paise` into `parts` instalments that sum EXACTLY back to `paise`.
 * The remainder lands on the earliest instalments (₹1,000 in 3 = 334/333/333),
 * so a member never gets a plan that quietly under-collects by a paisa.
 */
export function splitPaise(paise: Paise, parts: number): Paise[] {
  if (parts <= 0) return [];
  const base = Math.floor(paise / parts);
  const remainder = paise - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}
