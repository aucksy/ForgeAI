/**
 * F201 privacy (03-design §4): phone numbers and email addresses in the owner's sentence never reach the AI.
 * They are swapped for [PHONE_1], [EMAIL_1]... in the browser before /api/assist, and put back into the
 * actions that come back (a new member's mobile, an enquiry's number). PURE.
 */

export interface Masked {
  /** The sentence with every phone and email replaced by a placeholder. */
  text: string;
  /** Placeholder -> the original, exactly as typed. */
  tokens: Readonly<Record<string, string>>;
}

// An email: something@domain.tld.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// A phone: an optional +, then 10 to 13 digits that may be split by spaces, dots or dashes
// ("98290 11111", "+91-98290-11111", "098290 11111"). Plain amounts ("4500", "2,000") are too short.
const PHONE = /(?<![\w@])\+?\d(?:[\s.-]?\d){9,12}(?![\w@])/g;

const PLACEHOLDER = /\[(PHONE|EMAIL)_(\d+)\]/g;

/** The sentence with phones and emails hidden. The same number written twice gets the same placeholder. */
export function maskText(text: string): Masked {
  const tokens: Record<string, string> = {};
  const seen = new Map<string, string>();
  let phones = 0;
  let emails = 0;
  const swap = (kind: 'PHONE' | 'EMAIL', raw: string): string => {
    const key = kind === 'PHONE' ? raw.replace(/\D/g, '').slice(-10) : raw.toLowerCase();
    const known = seen.get(`${kind}:${key}`);
    if (known) return known;
    const token = kind === 'PHONE' ? `[PHONE_${(phones += 1)}]` : `[EMAIL_${(emails += 1)}]`;
    seen.set(`${kind}:${key}`, token);
    tokens[token] = raw;
    return token;
  };
  // Emails first: an email can hold digits that look like a phone.
  const out = text.replace(EMAIL, (m) => swap('EMAIL', m)).replace(PHONE, (m) => swap('PHONE', m));
  return { text: out, tokens };
}

/** Puts the originals back into a string; an unknown placeholder is left as it is. */
export function unmaskText(text: string, tokens: Readonly<Record<string, string>>): string {
  return text.replace(PLACEHOLDER, (whole) => tokens[whole] ?? whole);
}

/** Puts the originals back everywhere inside an answer (strings in objects and lists), without changing it. */
export function unmaskDeep<T>(value: T, tokens: Readonly<Record<string, string>>): T {
  if (typeof value === 'string') return unmaskText(value, tokens) as T;
  if (Array.isArray(value)) return value.map((v) => unmaskDeep(v, tokens)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = unmaskDeep(v, tokens);
    return out as T;
  }
  return value;
}

/** True when the text still holds a phone or email (a check before anything is sent). */
export function holdsContact(text: string): boolean {
  return new RegExp(EMAIL.source).test(text) || new RegExp(PHONE.source).test(text);
}
