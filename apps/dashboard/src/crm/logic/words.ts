/**
 * Amounts in words — PURE.
 *
 * Every printed receipt in India carries the amount spelled out, because that is
 * the line nobody can alter with a pen after the fact. It uses the Indian scale
 * (crore, lakh, thousand), not the international one: ₹12,34,567 is "Twelve Lakh
 * Thirty Four Thousand Five Hundred Sixty Seven", never "1.2 million".
 *
 * Deliberately no "and" inside the number ("One Thousand Five Hundred Fifty", not
 * "One Thousand Five Hundred and Fifty"). "and" is reserved for the single join
 * between rupees and paise, so the reader can always tell where the rupees stop.
 */

import type { Paise } from './money';

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
] as const;

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
] as const;

/** 0–99 in words. Returns '' for 0 so callers can drop empty groups. */
function underHundred(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const unit = n % 10;
  return unit === 0 ? tens : `${tens} ${ONES[unit]}`;
}

/** 0–999 in words. */
function underThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = underHundred(n % 100);
  if (hundreds === 0) return rest;
  return rest ? `${ONES[hundreds]} Hundred ${rest}` : `${ONES[hundreds]} Hundred`;
}

/**
 * A whole number in words on the Indian scale. Crores recurse, so an amount larger
 * than 99 crore still reads correctly rather than silently truncating.
 */
export function numberInWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'Zero';

  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const rest = n % 1_000;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${numberInWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${underHundred(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${underHundred(thousand)} Thousand`);
  if (rest > 0) parts.push(underThousand(rest));

  return parts.join(' ');
}

/**
 * A paise amount as it should appear on a receipt.
 *
 * `149900` -> `Rupees One Thousand Four Hundred Ninety Nine Only`
 * `149950` -> `Rupees One Thousand Four Hundred Ninety Nine and Fifty Paise Only`
 * `50`     -> `Fifty Paise Only`
 */
export function rupeesInWords(paise: Paise): string {
  const total = Math.round(paise);
  const sign = total < 0 ? 'Minus ' : '';
  const abs = Math.abs(total);

  const rupees = Math.floor(abs / 100);
  const rest = abs % 100;

  if (rupees === 0 && rest > 0) return `${sign}${underHundred(rest)} Paise Only`;
  if (rest === 0) return `${sign}Rupees ${numberInWords(rupees)} Only`;
  return `${sign}Rupees ${numberInWords(rupees)} and ${underHundred(rest)} Paise Only`;
}
