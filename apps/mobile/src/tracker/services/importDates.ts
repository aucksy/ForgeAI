/**
 * Audit Phase 4 (IM-07, IM-11) — the dates and times in a Hevy or Strong export, in any form a
 * phone or a spreadsheet writes them. PURE (the phone's own time zone is the only outside input).
 *
 *  - Hevy:   "7 Jul 2026, 14:24" (month in the phone's language: "7 Okt 2026, 14:24", "7 окт. 2026")
 *  - Strong: "2026-07-07 14:24:05"
 *  - Excel, after the member opened and saved the file: "07/07/2026 14:24", "07.07.2026 14:24",
 *    "7/7/26 2:24 PM", "2026/07/07 14:24", or a date number (days since 30 Dec 1899) in a .xlsx
 *  - Japanese / Chinese: "2026年7月7日 14:24"; month first: "Jul 7, 2026, 2:24 PM"
 *
 * A date of numbers only ("07/08/2026") can be day-first or month-first: the whole column is
 * scanned once (`dateOrderOf`) — a first number above 12 means day-first, a second one above 12
 * month-first; with nothing to tell, day-first (as Hevy itself writes).
 *
 * IM-07: a time in an export is the clock time the member saw. It is stored as that moment on
 * this phone (`localMoment`), so History, the export and Health Connect all show it as it was.
 */

export type DateOrder = 'dmy' | 'mdy';

/** A clock reading: year, month (0–11), day, hours, minutes, seconds. */
export interface WallClock {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  // de / fr / es / it / pt / nl (v0.28.1)
  mär: 2, mrz: 2, mai: 4, okt: 9, dez: 11,
  janv: 0, fév: 1, févr: 1, fev: 1, avr: 3, juin: 5, juil: 6, aoû: 7, août: 7, aou: 7, déc: 11,
  ene: 0, abr: 3, ago: 7, sept: 8, dic: 11,
  gen: 0, mag: 4, giu: 5, lug: 6, set: 8, ott: 9,
  out: 9,
  mrt: 2, mei: 4,
  // Phase 4 (IM-11): ru / pl / tr / sv-da-nb / id
  янв: 0, фев: 1, мар: 2, апр: 3, май: 4, мая: 4, июн: 5, июл: 6, авг: 7, сен: 8, окт: 9, ноя: 10, дек: 11,
  sty: 0, lut: 1, kwi: 3, maj: 4, cze: 5, lip: 6, sie: 7, wrz: 8, paź: 9, paz: 9, lis: 10, gru: 11,
  oca: 0, şub: 1, sub: 1, nis: 3, haz: 5, tem: 6, ağu: 7, agu: 7, eyl: 8, eki: 9, kas: 10, ara: 11,
  des: 11, agt: 7,
};

/** "Okt" / "févr." / "Sept" / "октября" → its month, or undefined. PURE. */
export function monthOf(word: string): number | undefined {
  const w = word.toLowerCase().replace(/\.$/, '');
  return MONTHS[w] ?? MONTHS[w.slice(0, 4)] ?? MONTHS[w.slice(0, 3)];
}

const pad = (n: number): string => String(n).padStart(2, '0');

function valid(c: WallClock): WallClock | null {
  if (c.y < 1970 || c.y > 2200 || c.mo < 0 || c.mo > 11 || c.d < 1 || c.d > 31 || c.h > 23 || c.mi > 59 || c.s > 59) return null;
  // 31 Feb is not a day.
  const back = new Date(Date.UTC(c.y, c.mo, c.d));
  return back.getUTCDate() === c.d ? c : null;
}

/** "14:24", "14:24:05", "2:24 PM", "2.24 pm" (or nothing: midnight). */
function timeOf(rest: string): { h: number; mi: number; s: number } | null {
  const t = rest.trim().replace(/^[,T@\s]+/, '');
  if (t === '') return { h: 0, mi: 0, s: 0 };
  const m = /^(\d{1,2})[:.h](\d{2})(?:[:.](\d{2}))?(?:[.,]\d+)?\s*(am|pm|a\.m\.|p\.m\.)?/i.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const ampm = (m[4] ?? '').toLowerCase().replace(/\./g, '');
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return { h, mi: Number(m[2]), s: Number(m[3] ?? 0) };
}

const fullYear = (y: string): number => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * Which way round a column's number-only dates are: day-first unless a second number above 12
 * says month-first (a first number above 12 settles day-first). PURE.
 */
export function dateOrderOf(values: readonly unknown[]): DateOrder {
  return scanDateOrder(values).order ?? 'dmy';
}

/** What a date column says about its number-only dates. */
export interface DateOrderScan {
  /** Day-first or month-first, as some date in the column proves; null when none does. */
  order: DateOrder | null;
  /**
   * Review fix: a number-only date that reads two ways ("03/04/2026") when nothing in the WHOLE
   * column settles it — the member is asked about this one. Null when there is nothing to ask.
   */
  ambiguous: string | null;
}

/**
 * Scans the WHOLE column (not the first rows only): a first number above 12 settles day-first, a
 * second one above 12 month-first. With nothing to settle it, a date whose two numbers differ
 * and are both 12 or less is returned to ask about (never guessed silently). PURE.
 */
export function scanDateOrder(values: readonly unknown[]): DateOrderScan {
  let ambiguous: string | null = null;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const m = /^\s*(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})\b/.exec(v);
    if (!m) continue;
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a > 12) return { order: 'dmy', ambiguous: null };
    if (b > 12) return { order: 'mdy', ambiguous: null };
    if (ambiguous == null && a !== b && a >= 1 && b >= 1) ambiguous = `${m[1]}/${m[2]}/${m[3]}`;
  }
  return { order: null, ambiguous };
}

const MONTH_NAME = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ordinal = (n: number): string => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
};

/**
 * The question for an ambiguous date, with its two answers in words:
 * "Is 03/04/2026 the 3rd of April or March 4th?" — "3 April 2026" (day first) / "March 4, 2026"
 * (month first). PURE.
 */
export function dateOrderQuestion(example: string): { question: string; dayFirst: string; monthFirst: string } {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(example);
  if (!m) return { question: `Is ${example} day first or month first?`, dayFirst: 'Day first', monthFirst: 'Month first' };
  const [a, b, y] = [Number(m[1]), Number(m[2]), fullYear(m[3])];
  return {
    question: `Is ${example} the ${ordinal(a)} of ${MONTH_NAME[b - 1]} or ${MONTH_NAME[a - 1]} ${ordinal(b)}?`,
    dayFirst: `${a} ${MONTH_NAME[b - 1]} ${y} (day first)`,
    monthFirst: `${MONTH_NAME[a - 1]} ${b}, ${y} (month first)`,
  };
}

/**
 * One export value → the clock time it says, or null when it is not a date and time. `order`
 * decides number-only dates (see `dateOrderOf`). PURE.
 */
export function readWallClock(input: unknown, order: DateOrder = 'dmy'): WallClock | null {
  // A spreadsheet's date number (days since 30 Dec 1899), to the minute (2000 onwards).
  if (typeof input === 'number' && Number.isFinite(input) && input >= 36526 && input < 2958466) {
    const d = new Date(Math.round(((input - 25569) * 86_400_000) / 60_000) * 60_000);
    return valid({ y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: 0 });
  }
  if (typeof input !== 'string') return null;
  const v = input.trim();
  if (v === '') return null;
  let m: RegExpExecArray | null;
  // ISO and year-first: 2026-07-07 14:24[:05], 2026/07/07T14:24, with a zone → that moment here.
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/.exec(v))) {
    const zone = /(?:\d)(Z|[+-]\d{2}:?\d{2})\s*$/i.exec(m[4]);
    if (zone) {
      const t = Date.parse(v.replace(' ', 'T'));
      if (Number.isFinite(t)) {
        const d = new Date(t);
        return valid({ y: d.getFullYear(), mo: d.getMonth(), d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() });
      }
    }
    const t = timeOf(m[4]);
    return t ? valid({ y: Number(m[1]), mo: Number(m[2]) - 1, d: Number(m[3]), ...t }) : null;
  }
  // 2026年7月7日 14:24
  if ((m = /^(\d{4})年(\d{1,2})月(\d{1,2})日(.*)$/.exec(v))) {
    const t = timeOf(m[4]);
    return t ? valid({ y: Number(m[1]), mo: Number(m[2]) - 1, d: Number(m[3]), ...t }) : null;
  }
  // Numbers only: 07/07/2026 14:24, 07.07.2026, 7-7-26 2:24 PM
  if ((m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b(.*)$/.exec(v))) {
    const t = timeOf(m[4]);
    if (!t) return null;
    const [a, b] = [Number(m[1]), Number(m[2])];
    const [d, mo] = order === 'mdy' ? [b, a] : [a, b];
    return valid({ y: fullYear(m[3]), mo: mo - 1, d, ...t });
  }
  // Day first with the month in words: 7 Jul 2026, 14:24 · 7. Okt. 2026 · 7 de octubre de 2026
  if ((m = /^(\d{1,2})\.?\s+(?:de\s+)?([^\s\d,]{3,})\.?\s+(?:de\s+)?(\d{4}),?(.*)$/i.exec(v))) {
    const mo = monthOf(m[2]);
    const t = timeOf(m[4]);
    return mo !== undefined && t ? valid({ y: Number(m[3]), mo, d: Number(m[1]), ...t }) : null;
  }
  // Month first in words: Jul 7, 2026, 2:24 PM
  if ((m = /^([^\s\d,]{3,})\.?\s+(\d{1,2}),?\s+(\d{4}),?(.*)$/i.exec(v))) {
    const mo = monthOf(m[1]);
    const t = timeOf(m[4]);
    return mo !== undefined && t ? valid({ y: Number(m[3]), mo, d: Number(m[2]), ...t }) : null;
  }
  return null;
}

/** The moment that clock time is on this phone (its own time zone). PURE but for the zone. */
export function localMoment(c: WallClock): number {
  return new Date(c.y, c.mo, c.d, c.h, c.mi, c.s, 0).getTime();
}

/** The calendar day a clock time is on (YYYY-MM-DD). PURE. */
export function wallISO(c: WallClock): string {
  return `${c.y}-${pad(c.mo + 1)}-${pad(c.d)}`;
}
