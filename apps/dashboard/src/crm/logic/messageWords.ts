/**
 * Dates, times and counts in the words a member message uses, in English and in Hindi
 * (Messages & offers step 1, 22 Oct 2026; docs/overhaul/research/R-offers-notices.md §7). PURE.
 *
 * Hindi is Devanagari and natural spoken Hindi ("रविवार 8 नवंबर", "सुबह 6 बजे"), never Hinglish:
 * the admin app's own screens stay English (test/crm/englishOnly.test.ts); only the words that go
 * to members may be Hindi, and only when the owner picks it.
 */

import { isValidDateISO, partsOf, type DateISO } from './dates';

/** The language of a message to members. "Both" puts the Hindi under the English. */
export type MessageLang = 'en' | 'hi' | 'both';

export const MESSAGE_LANGS: readonly { value: MessageLang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'both', label: 'Both' },
];

export function isMessageLang(v: unknown): v is MessageLang {
  return v === 'en' || v === 'hi' || v === 'both';
}

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const HI_MONTHS = [
  'जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
  'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर',
] as const;
const EN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const HI_WEEKDAYS = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'] as const;

/** 0 = Sunday. Worked out on the calendar day itself, so no time zone can move it. */
export function weekdayOf(date: DateISO): number {
  const { year, month, day } = partsOf(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** "8 Nov" / "8 नवंबर" — a date in the coming weeks, so no year. Null for a date that is not real. */
export function dayMonth(date: DateISO, lang: 'en' | 'hi'): string | null {
  if (!isValidDateISO(date)) return null;
  const { month, day } = partsOf(date);
  return `${day} ${(lang === 'hi' ? HI_MONTHS : EN_MONTHS)[month - 1]}`;
}

/** "Sunday 8 Nov" / "रविवार 8 नवंबर". */
export function weekdayDayMonth(date: DateISO, lang: 'en' | 'hi'): string | null {
  const dm = dayMonth(date, lang);
  if (dm === null) return null;
  return `${(lang === 'hi' ? HI_WEEKDAYS : EN_WEEKDAYS)[weekdayOf(date)]} ${dm}`;
}

/** "26 जुलाई 2026": the Hindi twin of `formatDay` ("26 Jul 2026"). */
export function formatDayHi(date: DateISO): string {
  if (!isValidDateISO(date)) return '—';
  const { year, month, day } = partsOf(date);
  return `${day} ${HI_MONTHS[month - 1]} ${year}`;
}

/** "06:30" -> hours and minutes, or null when it is not a time of day. */
function clock(raw: string): { h: number; m: number } | null {
  const hit = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!hit) return null;
  const h = Number(hit[1]);
  const m = Number(hit[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/**
 * A time of day as members say it. English: "6 am", "6:30 pm", "12 noon", "12 midnight".
 * Hindi carries its own "बजे" and the part of the day: "सुबह 6 बजे", "शाम 6:30 बजे", "दोपहर 12 बजे",
 * "रात 10 बजे". Null when `raw` (an <input type="time"> value, "HH:MM") is not a time.
 */
export function timeWords(raw: string, lang: 'en' | 'hi'): string | null {
  const t = clock(raw);
  if (!t) return null;
  const h12 = t.h % 12 || 12;
  const hm = t.m === 0 ? `${h12}` : `${h12}:${String(t.m).padStart(2, '0')}`;
  if (lang === 'en') {
    if (t.m === 0 && t.h === 12) return '12 noon';
    if (t.m === 0 && t.h === 0) return '12 midnight';
    return `${hm} ${t.h < 12 ? 'am' : 'pm'}`;
  }
  const part = t.h >= 4 && t.h < 12 ? 'सुबह' : t.h >= 12 && t.h < 16 ? 'दोपहर' : t.h >= 16 && t.h < 20 ? 'शाम' : 'रात';
  return `${part} ${hm} बजे`;
}

/** "3 days" / "1 day" / "3 दिन". */
export function daysWords(n: number, lang: 'en' | 'hi'): string {
  if (lang === 'hi') return `${n} दिन`;
  return n === 1 ? '1 day' : `${n} days`;
}

/**
 * Letters as the server counts them (Postgres `length()` counts characters, not the UTF-16 units
 * JavaScript's `.length` counts), after trimming. Hindi and ₹ are one each either way; an emoji is
 * one here and one on the server, where `.length` said two.
 */
export function letterCount(text: string): number {
  return [...text.trim()].length;
}

export type LengthState = 'ok' | 'near' | 'over';

/** Near = the last tenth before the limit, so the owner is told before a send is refused. */
export function lengthState(count: number, max: number): LengthState {
  if (count > max) return 'over';
  if (count >= Math.floor(max * 0.9)) return 'near';
  return 'ok';
}

/** "54 of 60 letters · 6 left" / "64 of 60 letters · 4 too many". */
export function lengthWords(count: number, max: number): string {
  if (count > max) return `${count} of ${max} letters · ${count - max} too many`;
  const left = max - count;
  return `${count} of ${max} letters · ${left} left`;
}
