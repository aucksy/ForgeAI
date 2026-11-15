/**
 * R-580 (owner, 15 Nov 2026): every mobile number box keeps ONLY the 10-digit Indian mobile number,
 * whatever the keyboard suggestion, autofill or paste puts in. A phone keyboard that suggests the
 * person's own number types "+91 98765 43210" into the box in one go; the box must end up showing
 * 9876543210.
 *
 * ONE pure module, shared by the member app, the admin app and the Workers (deploy/panel, deploy/hq
 * import this file directly), so every box and every server agrees. The pages that cannot import
 * TypeScript carry a plain-JS twin, tested on the same MOBILE_CASES table:
 *   join-online.html, friend.html, home/home.js and gym-page/page.js (apps/dashboard/public), and
 *   apps/hq/public/logic.js (HQ "Owner's mobile").
 *
 * The rule:
 *  - digits only (spaces, dashes, dots, brackets and "+" go); Hindi (Devanagari) and other Indian
 *    keyboards' digits count as 0-9 (an explicit table, never a Unicode regex: the Android JS engine
 *    and the test runner disagree on those, D:/Brain/Lessons jvm-tests-cannot-see-android-regex);
 *  - a "+91" written in front is the country code and goes at once;
 *  - a number written with "+" or "00" and ANOTHER country code ("+44 7911 123456") is not an Indian number:
 *    it is kept whole, never cut to its last 10 digits, so every check refuses it as before (fix round,
 *    15 Nov 2026: "+44 7911 123456" had passed as 7911123456);
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
 * Written with another country's code: "+" and a code that is not (on its way to) 91, or "00" and a code that is
 * not 91. "+9" is still on its way to "+91", so it is not foreign yet. PURE.
 */
function foreignNumber(ascii: string, d: string): boolean {
  if (plusInFront(ascii)) return d.length > 0 && !d.startsWith('91') && !'91'.startsWith(d.slice(0, 2));
  return d.length >= 4 && d.startsWith('00') && !d.startsWith('0091');
}

/**
 * The 10-digit rule on a whole value (a paste, an autofill, what a server receives). PURE.
 * "+91 98765 43210" / "919876543210" / "09876543210" / "0091 98765 43210" / "(+91) 98765-43210"
 * -> "9876543210"; "98765" -> "98765"; "" -> "".
 */
export function cleanMobile(raw: string): string {
  const ascii = asciiDigits(raw);
  let d = ascii.replace(/[^0-9]/g, '');
  if (foreignNumber(ascii, d)) return d; // "+44 7911 123456" -> "447911123456": refused, never 7911123456
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
  // Another country's number stays as typed, so the box's own check can say it is not an Indian mobile.
  if (foreignNumber(ascii, d)) return ascii.slice(0, 24);
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
  if (foreignNumber(ascii, ascii.replace(/[^0-9]/g, ''))) return ascii.slice(0, maxChars);
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
 * A box that may hold a landline or two numbers (the gym's own "Phone" in Settings, printed on receipts; a member's
 * emergency contact). Only ONE thing is cleaned: a single mobile written with a clear India code in front
 * ("+91 98765 43210", "91 98765 43210", "0091 98765 43210": 12 or 14 digits) becomes its 10 digits. Everything
 * else is left exactly as typed: a landline with its 0 ("080 23456789" stays, never 8023456789), two numbers
 * ("98290 12345 / 98290 12346"), words, a foreign number. Fix round, 15 Nov 2026: the first version cut
 * "080 23456789" to a fake mobile and joined two numbers into one. PURE.
 */
export function mobileOrAsTyped(raw: string): string {
  const ascii = asciiDigits(raw);
  if (!/^[\s0-9+().-]*$/.test(ascii)) return raw; // a "/", ",", a word: more than one plain number
  const d = ascii.replace(/[^0-9]/g, '');
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 14 && d.startsWith('0091') ? d.slice(4) : '';
  return /^[6-9][0-9]{9}$/.test(ten) ? ten : raw;
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
  // Another country's number is kept whole, so no check takes it for an Indian mobile (made-up numbers).
  ['+44 7911 123456', '447911123456'],
  ['0044 7911 123456', '00447911123456'],
  ['+1 415 555 0134', '14155550134'],
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
  ['', '+4', '+4'], // another country's number stays as typed, so the box's check refuses it
  ['', '+44 7911 123456', '+44 7911 123456'],
  ['9876543210', '+44 7911 123456', '+44 7911 123456'],
  ['', '0044 7911 123456', '0044 7911 123456'],
];
