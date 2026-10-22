/**
 * The workout claim code (Messages & offers step 1, item 6; OWNER-INBOX #49): the member app shows
 * a short code, like "K3Q9P-X2M7A", that holds the days of the last 30 with a counted workout. The
 * desk types it into the member's page in the admin app, which reads the days back and matches them
 * against the gym's own check-ins ("9 of 10 match"). Nothing is sent anywhere: the member shows the
 * code by choice.
 *
 * 10 letters and numbers (Crockford base32: no I, L, O or U) hold 50 bits:
 *  - 6 bits: the day the code was made, as its day number mod 64 (read back as the latest such day
 *    up to tomorrow, so a phone clock a day ahead still reads right; a code over 62 days old cannot be
 *    told apart, and the admin app says when a code is old);
 *  - 30 bits: one per day, that day and the 29 before it;
 *  - 14 bits: a check, so a typing mistake is caught (1 in 16,384 slips through).
 * A made-up code gains nothing the register does not already show: only days with a check-in count.
 *
 * PURE and self-contained: this file is copied word for word into the admin app
 * (apps/dashboard/src/crm/logic/claimCode.ts); a test there fails when the two differ.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** The days a code covers: the day it is made and the 29 before it. */
export const CLAIM_DAYS = 30;
const ANCHOR_MOD = 64;
const DAY_BITS = 2 ** CLAIM_DAYS;
const CHECK_MOD = 2 ** 14;
const VERSION = 1;
const DAY_MS = 86_400_000;

/** "2026-10-22" → its day number (days since 1 Jan 1970), whatever the clock's time zone. */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / DAY_MS);
}

function isoOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** The 14-bit check of a 36-bit payload (FNV-1a over its bytes, folded). */
function check(payload: number): number {
  let h = 0x811c9dc5;
  const bytes = [VERSION];
  for (let k = 4; k >= 0; k -= 1) bytes.push(Math.floor(payload / 256 ** k) % 256);
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ((h ^ (h >>> 14) ^ (h >>> 28)) >>> 0) % CHECK_MOD;
}

/**
 * The code for these workout days, made on `todayISO`. Days outside the 30 (older, or after today)
 * are left out. Always 10 characters as "XXXXX-XXXXX".
 */
export function encodeClaim(todayISO: string, days: readonly string[]): string {
  const t = dayNumber(todayISO);
  let mask = 0;
  for (const d of days) {
    const i = t - dayNumber(d);
    if (i >= 0 && i < CLAIM_DAYS) mask |= 1 << i;
  }
  const payload = (((t % ANCHOR_MOD) + ANCHOR_MOD) % ANCHOR_MOD) * DAY_BITS + (mask >>> 0);
  let value = payload * CHECK_MOD + check(payload);
  let out = '';
  for (let k = 0; k < 10; k += 1) {
    out = ALPHABET.charAt(value % 32) + out;
    value = Math.floor(value / 32);
  }
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export type ClaimRead =
  | { ok: true; /** The day the code was made. */ madeOn: string; /** Its workout days, oldest first. */ days: string[] }
  | { ok: false; problem: 'length' | 'letter' | 'check' };

/**
 * The days a code holds, read on `todayISO`. Spaces and dashes are ignored, small letters are fine,
 * and I / L read as 1 and O as 0 (letters people mix up). A day after today is never returned.
 */
export function decodeClaim(code: string, todayISO: string): ClaimRead {
  const norm = code.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  if (norm.length !== 10) return { ok: false, problem: 'length' };
  let value = 0;
  for (const ch of norm) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return { ok: false, problem: 'letter' };
    value = value * 32 + v;
  }
  const payload = Math.floor(value / CHECK_MOD);
  if (check(payload) !== value % CHECK_MOD) return { ok: false, problem: 'check' };
  const anchor = Math.floor(payload / DAY_BITS);
  const mask = payload % DAY_BITS;
  const t = dayNumber(todayISO);
  // The latest day up to tomorrow with this remainder: a clock a day ahead still reads right.
  const made = t + 1 - ((((t + 1 - anchor) % ANCHOR_MOD) + ANCHOR_MOD) % ANCHOR_MOD);
  const days: string[] = [];
  for (let i = CLAIM_DAYS - 1; i >= 0; i -= 1) {
    if (Math.floor(mask / 2 ** i) % 2 === 1 && made - i <= t) days.push(isoOf(made - i));
  }
  return { ok: true, madeOn: isoOf(made), days };
}
