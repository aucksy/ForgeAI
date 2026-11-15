/**
 * R-580 (owner, 15 Nov 2026): every mobile number box keeps ONLY the 10-digit Indian mobile number,
 * whatever the keyboard suggestion, autofill or paste puts in. A phone keyboard that suggests the
 * person's own number types "+91 98765 43210" into the box in one go; the box must end up showing
 * 9876543210.
 *
 * ONE pure module, shared by the member app, the admin app and the Workers (deploy/panel, deploy/hq
 * import this file directly), so every box and every server agrees. The pages that cannot import
 * TypeScript carry a plain-JS twin, tested on the same MOBILE_CASES table:
 *   apps/dashboard/public/mobile-number.js (join-online, friend, home, gym page) and
 *   apps/hq/public/logic.js (HQ "Owner's mobile").
 *
 * The rule:
 *  - digits only (spaces, dashes, dots, brackets and "+" go); Hindi (Devanagari) and other Indian
 *    keyboards' digits count as 0-9 (an explicit table, never a Unicode regex: the Android JS engine
 *    and the test runner disagree on those, D:/Brain/Lessons jvm-tests-cannot-see-android-regex);
 *  - a "+91" written in front is the country code and goes at once;
 *  - more than 10 digits ("91" + 10, "0" + 10, "0091" + 10, anything else): the LAST 10 (his words);
 *  - fewer than 10: kept as typed, so the person can keep typing. The "enter 10 digits" checks stay.
 *
 * Typing one key at a time must feel normal (mobileInput): an 11th digit typed after a full number is
 * ignored (as a 10-character limit would), not allowed to push the first digit out; a "+" or "+9" being
 * typed stays until it becomes "+91"; "0091 ..." typed by hand stays until all 14 digits are in.
 * Plain-old: a length limit on the box would cut "+91 98765 43210" to "+91 98765 " BEFORE this code
 * sees it, so no phone box has one: this rule is the limit.
 */

/** The first code point of each run of ten digits a phone keyboard can send (0 is the first). */
const DIGIT_ZEROS: readonly number[] = [
  0x0660, // Arabic-Indic
  0x06f0, // Extended Arabic-Indic (Urdu)
  0x0966, // Devanagari (Hindi, Marathi)
  0x09e6, // Bengali
  0x0a66, // Gurmukhi (Punjabi)
  0x0ae6, // Gujarati
  0x0b66, // Oriya
  0x0be6, // Tamil
  0x0c66, // Telugu
  0x0ce6, // Kannada
  0x0d66, // Malayalam
  0xff10, // full-width
];

export const MOBILE_LENGTH = 10;

/** Every digit from any Indian keyboard as 0-9; everything else left as it was. PURE. */
export function asciiDigits(raw: string): string {
  let out = '';
  for (const ch of String(raw ?? '')) {
    const c = ch.codePointAt(0) ?? 0;
    let mapped = ch;
    for (const zero of DIGIT_ZEROS) {
      if (c >= zero && c <= zero + 9) {
        mapped = String(c - zero);
        break;
      }
    }
    out += mapped;
  }
  return out;
}

/** Only 0-9 (after asciiDigits). PURE. */
export function onlyDigits(raw: string): string {
  return asciiDigits(raw).replace(/[^0-9]/g, '');
}

/** A "+" before the first digit: what follows starts with a country code. PURE. */
function plusInFront(ascii: string): boolean {
  return /^[^0-9]*\+/.test(ascii);
}

/**
 * The 10-digit rule on a whole value (a paste, an autofill, what a server receives). PURE.
 * "+91 98765 43210" / "919876543210" / "09876543210" / "0091 98765 43210" / "(+91) 98765-43210"
 * -> "9876543210"; "98765" -> "98765"; "" -> "".
 */
export function cleanMobile(raw: string): string {
  const ascii = asciiDigits(raw);
  let d = ascii.replace(/[^0-9]/g, '');
  if (plusInFront(ascii) && d.startsWith('91')) d = d.slice(2);
  return d.length > MOBILE_LENGTH ? d.slice(-MOBILE_LENGTH) : d;
}

/** A valid Indian mobile (10 digits, 6-9 first) after cleanMobile, or null. PURE. */
export function indianMobile(raw: string): string | null {
  const d = cleanMobile(raw);
  return /^[6-9][0-9]{9}$/.test(d) ? d : null;
}

/**
 * What a mobile number box shows after one change, given what it showed before. Use it in every
 * onChange of an India-only number box: `onChange={(v) => setPhone(mobileInput(phone, v))}`. PURE.
 */
export function mobileInput(prev: string, raw: string): string {
  const ascii = asciiDigits(raw);
  // "+" and "+9" on the way to "+91": keep them, or the "+" vanishes and "91" looks like the number.
  const partialPlus = /^[^0-9]*\+\s*(9)?\s*$/.exec(ascii);
  if (partialPlus) return partialPlus[1] ? '+9' : '+';
  let d = ascii.replace(/[^0-9]/g, '');
  if (plusInFront(ascii) && d.startsWith('91')) d = d.slice(2);
  if (d.length <= MOBILE_LENGTH) return d;
  // "0091 98765 43210" typed by hand: wait for all 14 digits.
  if (d.startsWith('0091') && d.length < 14) return d;
  // One more digit typed after a full number: ignored, like a 10-character limit. A trunk "0" in front
  // ("0" + 10) is the one 11-digit shape that is a number, so it is cleaned instead.
  const before = onlyDigits(prev);
  if (before.length === MOBILE_LENGTH && d.length === MOBILE_LENGTH + 1 && !d.startsWith('0')) return before;
  return d.slice(-MOBILE_LENGTH);
}

/**
 * The same, for a box that also takes another country's number (the member app's optional mobile,
 * the admin app's boxes next to a country code): a number written with "+" or "00" and another
 * country code is kept as typed (SH-26: a guessed rule must not refuse a real foreign number);
 * every other value follows the Indian rule. `maxChars` caps a foreign number. PURE.
 */
export function anyCountryMobileInput(prev: string, raw: string, maxChars = 24): string {
  const ascii = asciiDigits(raw);
  const d = ascii.replace(/[^0-9]/g, '');
  const plus = plusInFront(ascii);
  const foreignPlus = plus && d.length > 0 && !'91'.startsWith(d.slice(0, 2)) && !d.startsWith('91');
  const foreignZeros = !plus && /^00/.test(d) && d.length >= 4 && !d.startsWith('0091');
  if (foreignPlus || foreignZeros) return ascii.slice(0, maxChars);
  return mobileInput(prev, raw);
}

/**
 * A number box next to a country-code picker (the admin app's member and enquiry forms): with +91 picked, the
 * Indian rule (a foreign "+44 ..." pasted in is kept as typed, so the form can say the code does not match);
 * with any other code picked, the box is left as typed. PURE.
 */
export function dialMobileInput(dialCode: string, prev: string, raw: string): string {
  return String(dialCode ?? '').replace(/[^0-9]/g, '') === '91' ? anyCountryMobileInput(prev, raw) : raw;
}

/**
 * A box that may hold a landline (the gym's own "Phone" in Settings): a paste or autofill of a mobile with extra
 * in front ("+91 98765 43210") becomes the 10 digits; anything else is left exactly as typed, so "0141 2345678"
 * keeps its 0. PURE.
 */
export function mobileOrAsTyped(raw: string): string {
  const ten = indianMobile(raw);
  return ten !== null && onlyDigits(raw).length > MOBILE_LENGTH ? ten : raw;
}

/** The shared table: [what went in, what cleanMobile gives]. Every codebase's tests run it. */
export const MOBILE_CASES: readonly (readonly [string, string])[] = [
  ['+91 98765 43210', '9876543210'],
  ['+919876543210', '9876543210'],
  ['919876543210', '9876543210'],
  ['09876543210', '9876543210'],
  ['0091 98765 43210', '9876543210'],
  ['00919876543210', '9876543210'],
  ['(+91) 98765-43210', '9876543210'],
  ['+91-98765.43210', '9876543210'],
  ['+91 ९८७६५ ४३२१०', '9876543210'],
  ['९८७६५४३२१०', '9876543210'],
  ['9876543210', '9876543210'],
  ['98765 43210', '9876543210'],
  ['1234 98765 43210', '9876543210'],
  ['98765', '98765'],
  ['+91 98765', '98765'],
  ['', ''],
  ['abc', ''],
];

/** Typing and pasting into a box: [what it showed, what the change made it, what it shows now]. */
export const MOBILE_INPUT_CASES: readonly (readonly [string, string, string])[] = [
  ['', '+91 98765 43210', '9876543210'], // the keyboard's own-number suggestion, in one go
  ['', '919876543210', '9876543210'],
  ['', '09876543210', '9876543210'],
  ['', '0091 98765 43210', '9876543210'],
  ['', '(+91) 98765-43210', '9876543210'],
  ['', '९८७६५४३२१०', '9876543210'],
  ['', '9', '9'], // one key at a time
  ['9', '98', '98'],
  ['98765', '98765 ', '98765'], // a typed space goes
  ['987654321', '9876543210', '9876543210'],
  ['9876543210', '98765432101', '9876543210'], // an 11th key is ignored
  ['9876543210', '98765432102', '9876543210'],
  ['9876543210', '987654321', '987654321'], // deleting works
  ['98765', '9875', '9875'],
  ['', '+', '+'], // "+91" typed by hand
  ['+', '+9', '+9'],
  ['+9', '+91', ''],
  ['', '+91 9', '9'],
  ['0', '09', '09'], // a trunk 0 typed by hand
  ['0987654321', '09876543210', '9876543210'],
  ['0091987654', '00919876543', '00919876543'], // "0091 ..." typed by hand
  ['0091987654321', '00919876543210', '9876543210'],
  ['9876543210', '+91 91234 56789', '9123456789'], // an autofill over a full box replaces it
];
