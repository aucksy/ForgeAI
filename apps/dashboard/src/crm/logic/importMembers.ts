/**
 * Import members from Excel or CSV (15 Oct 2026) — PURE (no network, no storage, no React).
 *
 * Research (Audit/crm-research/RESEARCH.md §9 rec 9): "Excel import for day one, so an owner can
 * move off his register or sheet in minutes." Rivals call it Bulk Upload (OkGym, GymBook).
 *
 * The screen reads the file (the spreadsheet library is loaded only when a file is picked) and hands
 * the rows here. Everything that decides something lives in this file and is tested:
 *
 *  - which row holds the column names, and which column is which field (English, Hinglish and
 *    Hindi headers);
 *  - Indian dates (15/08/2026, 15-08-26, 15-Aug-2026, Excel's own date numbers), and a whole
 *    column written month-first is noticed instead of read wrongly;
 *  - mobiles through the SAME rules as the add-member form (`normalizePhone` / `validateMember`),
 *    so an imported member is exactly as valid as a typed one;
 *  - duplicates inside the file and against the gym's members (archived ones too).
 *
 * Plan, fees and expiry columns are NOT turned into memberships or payments: a payment needs a
 * date, a method and a receipt number the sheet does not have, and a plan sold with no money
 * creates a due the member never owed. They are kept, word for word, in the member's notes.
 */

import type { Gender, Member, MemberDraft } from '../types';
import { inEnglish, tr } from '../i18n';
import { csvDocument } from './csv';
import { addDays, formatDay, isValidDateISO, toISO, type DateISO } from './dates';
import { DuplicatePhoneError, EARLIEST_DATE, PartialSaveError } from '../data/adapter';
import { BATCH_MAX, listBatches, resolveBatch } from './batches';
import { formatINR, parseRupeeInput } from './money';
import { DEFAULT_DIAL_CODE, findDuplicatePhone, normalizeName, normalizePhone, splitE164, validateMember } from './members';
import { termFromRow, type ImportTerm } from './importTerms';

// ---------------------------------------------------------------- fields

export type ImportField =
  | 'fullName'
  | 'phone'
  | 'joinedOn'
  | 'gender'
  | 'dateOfBirth'
  | 'email'
  | 'address'
  | 'batch'
  | 'plan'
  | 'startDate'
  | 'total'
  | 'amount'
  | 'paidOn'
  | 'due'
  | 'expiry'
  | 'notes';

export const IMPORT_FIELDS: readonly ImportField[] = [
  'fullName', 'phone', 'joinedOn', 'gender', 'dateOfBirth', 'email', 'address', 'batch', 'plan', 'startDate', 'total', 'amount', 'paidOn', 'due', 'expiry', 'notes',
];

/** Which column (0-based) holds each field; null = not in the file. */
export type ColumnMap = Record<ImportField, number | null>;

export function emptyColumnMap(): ColumnMap {
  return Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as ColumnMap;
}

/** The field's name on screen. */
export function fieldLabel(field: ImportField): string {
  switch (field) {
    case 'fullName': return tr('Name', 'Naam');
    case 'phone': return tr('Mobile', 'Mobile');
    case 'joinedOn': return tr('Joining date', 'Joining date');
    case 'gender': return tr('Gender', 'Gender');
    case 'dateOfBirth': return tr('Date of birth', 'Janam din');
    case 'email': return tr('Email', 'Email');
    case 'address': return tr('Address', 'Pata');
    case 'batch': return tr('Batch', 'Batch');
    case 'plan': return tr('Plan', 'Plan');
    case 'startDate': return tr('Plan start', 'Plan shuru');
    case 'total': return tr('Plan price', 'Plan ki fees');
    case 'amount': return tr('Fees paid', 'Fees di');
    case 'paidOn': return tr('Payment date', 'Payment ki date');
    case 'due': return tr('Balance due', 'Baaki');
    case 'expiry': return tr('Valid till', 'Valid till');
    case 'notes': return tr('Notes', 'Notes');
  }
}

// ---------------------------------------------------------------- header guessing

/**
 * Words owners put at the top of a column. A leading `=` means "only when the WHOLE header is
 * this word": "Member" alone is the name, but "Member ID" must not become the name, and "Number"
 * alone is the mobile, but "Receipt Number" is not.
 */
const SYNONYMS: Record<ImportField, readonly string[]> = {
  fullName: [
    'name', 'naam', 'full name', 'member name', 'customer name', 'client name', 'name of member',
    'member ka naam', 'sadasya', '=member', '=customer', '=client', '=members', 'नाम', 'सदस्य',
  ],
  phone: [
    'mobile', 'mobile no', 'mobile number', 'mob no', 'phone', 'phone no', 'phone number', 'contact',
    'contact no', 'contact number', 'whatsapp', 'whatsapp no', 'whatsapp number', 'cell no',
    '=number', '=mob', '=ph', '=cell', 'मोबाइल', 'फोन', 'फ़ोन', 'नंबर',
  ],
  joinedOn: [
    'joining date', 'date of joining', 'doj', 'd o j', 'join date', 'joined on', '=joined', '=joining',
    'admission date', 'date of admission', '=admission', 'joining tarikh',
    'bharti', '=date', 'जॉइनिंग', 'भर्ती',
  ],
  gender: ['gender', 'male female', 'male or female', 'ling', '=sex', '=m f', '=mf', 'लिंग'],
  dateOfBirth: [
    'dob', 'd o b', 'date of birth', 'birth date', 'birthday', 'birth day', 'bday', 'b day', 'janam din',
    'janamdin', 'janam tithi', 'janam tarikh', 'जन्म तिथि', 'जन्मदिन', 'जन्म तारीख',
  ],
  email: ['email', 'e mail', 'email id', 'mail id', 'gmail', '=mail'],
  address: ['address', 'pata', 'addr', 'area', 'locality', 'location', 'residence', 'पता'],
  batch: ['batch', 'batch time', 'slot', 'timing', 'timings', 'shift', '=time', 'बैच'],
  plan: [
    'plan', 'plan name', 'package', 'package name', 'membership', 'membership type', 'plan type', 'scheme',
    'subscription', 'प्लान', 'पैकेज',
  ],
  // 15 Oct 2026 (data migration): plan start, the plan's price and the balance due are their own
  // columns now, so a rival's export becomes real memberships and receipts, not notes.
  startDate: [
    'start date', 'starting date', 'plan start', 'plan start date', 'membership start', 'membership start date',
    'package start', 'from date', 'valid from', '=from', 'renewed on', 'last renewal', 'शुरू',
  ],
  total: [
    'total amount', 'package amount', 'plan amount', 'plan fees', 'plan price', 'package price', 'package fees',
    'membership fee', 'membership fees', 'membership value', 'total membership value', 'net amount', 'price',
    '=total', '=mrp', 'final amount',
  ],
  amount: [
    'amount', 'fees', 'fee', 'fees paid', 'fee paid', 'amount paid', 'paid amount', 'rupees', 'received',
    'amount received', '=payment', 'payment amount', 'joining fees', 'joining fee', 'admission fees', 'admission fee',
    'shulk', '=rs', '=paid', 'jama', 'फीस', 'राशि',
  ],
  // 16 Oct 2026: a payments list (one row per payment) dates each receipt.
  paidOn: [
    'payment date', 'paid on', 'paid date', 'date of payment', 'payment on', 'receipt date', 'transaction date',
    'txn date', 'collection date', 'collected on', 'bill date', 'invoice date', 'fees date', 'fee date',
  ],
  due: [
    '=due', 'balance', 'balance due', 'balance amount', 'due amount', 'amount due', 'pending', 'pending amount',
    'pending fees', 'remaining', 'remaining amount', 'outstanding', 'baaki', 'baki', 'बाकी',
  ],
  expiry: [
    'expiry', 'expiry date', 'expire', 'expires', 'expires on', 'end date', 'ending date', 'valid till',
    'valid upto', 'valid up to', 'validity', 'renewal date', '=renewal', 'due date', 'next due',
    '=till', 'khatam', 'समाप्ति',
  ],
  notes: ['notes', 'note', 'remarks', 'remark', 'comment', 'comments', '=other', 'टिप्पणी'],
};

/** Lower case, every run of punctuation one space, Devanagari kept (with its vowel marks). */
export function normalizeHeader(raw: unknown): string {
  return cellText(raw)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

interface Candidate {
  col: number;
  field: ImportField;
  score: number;
}

/**
 * Guess each field's column from a header row. A whole-header match beats a word inside a header,
 * and a longer word beats a shorter one ("Plan Expiry Date" is the expiry, not the plan). Each
 * column feeds one field and each field reads one column.
 */
export function guessColumns(headers: readonly unknown[]): ColumnMap {
  const map = emptyColumnMap();
  const candidates: Candidate[] = [];
  headers.forEach((raw, col) => {
    const h = normalizeHeader(raw);
    if (!h) return;
    const padded = ` ${h} `;
    IMPORT_FIELDS.forEach((field) => {
      let best = 0;
      for (const entry of SYNONYMS[field]) {
        const exactOnly = entry.startsWith('=');
        const syn = normalizeHeader(exactOnly ? entry.slice(1) : entry);
        if (!syn) continue;
        if (h === syn) best = Math.max(best, 100 + syn.length);
        else if (!exactOnly && padded.includes(` ${syn} `)) best = Math.max(best, syn.length);
      }
      if (best > 0) candidates.push({ col, field, score: best });
    });
  });
  candidates.sort(
    (a, b) => b.score - a.score || a.col - b.col || IMPORT_FIELDS.indexOf(a.field) - IMPORT_FIELDS.indexOf(b.field),
  );
  const usedCols = new Set<number>();
  for (const c of candidates) {
    if (map[c.field] !== null || usedCols.has(c.col)) continue;
    map[c.field] = c.col;
    usedCols.add(c.col);
  }
  return map;
}

function mappedCount(map: ColumnMap): number {
  return IMPORT_FIELDS.filter((f) => map[f] !== null).length;
}

/**
 * The row with the column names: a register often starts with the gym's name or a blank line.
 * The row among the first ten that names the most fields wins; with no recognisable row, the first.
 */
export function findHeaderRow(rows: readonly (readonly unknown[])[]): number {
  let best = 0;
  let bestCount = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const n = mappedCount(guessColumns(rows[i] ?? []));
    if (n > bestCount) {
      best = i;
      bestCount = n;
    }
  }
  return best;
}

/**
 * 15 Oct 2026 (data migration — "I don't want to build a logic that fails with every new
 * format"): columns whose NAME said nothing are placed by what is IN them. Up to 60 rows under the
 * header are read; a column is a type when at least 60% of its filled cells read as it:
 *  - mobile: a valid mobile (the same rules as the form);
 *  - email: name@place;
 *  - gender: M / F / Male / Female / पुरुष …;
 *  - dates: the earliest-centred column whose years are mostly 15+ years ago is the birthday; of
 *    the other date columns, the later-centred one is the end ("valid till"), the earlier one the
 *    start (or the joining date when the sheet has no start);
 *  - money: amounts 100–5,00,000 (₹, commas, "/-" allowed) that are not mobiles — the plan's
 *    price when its column is unplaced and there are two money columns (the larger one), else paid.
 * Only fields still empty are filled, and only from columns no field uses. PURE.
 */
export function guessFromValues(rows: readonly (readonly unknown[])[], headerRow: number, map: ColumnMap, today: DateISO): ColumnMap {
  const out: ColumnMap = { ...map };
  const used = new Set<number>(IMPORT_FIELDS.map((f) => out[f]).filter((c): c is number => c !== null));
  const body = rows.slice(headerRow + 1, headerRow + 61).filter((r) => !isBlankRow(r));
  const width = Math.max(0, ...rows.slice(headerRow, headerRow + 61).map((r) => r.length));
  const share = (col: number, test: (v: unknown) => boolean): number => {
    const filled = body.map((r) => r[col]).filter((v) => cellText(v) !== '');
    if (filled.length < 2) return 0;
    return filled.filter(test).length / filled.length;
  };
  const yearOf = (d: DateISO) => Number(d.slice(0, 4));
  const free = () => Array.from({ length: width }, (_, c) => c).filter((c) => !used.has(c));
  const take = (field: ImportField, col: number) => {
    out[field] = col;
    used.add(col);
  };

  for (const c of free()) {
    if (out.phone === null && share(c, (v) => parseImportPhone(v).ok) >= 0.6) take('phone', c);
  }
  for (const c of free()) {
    if (out.email === null && share(c, (v) => EMAIL_RE.test(cellText(v))) >= 0.6) take('email', c);
  }
  for (const c of free()) {
    if (out.gender === null && share(c, (v) => { const g = parseGender(v); return g !== null && g !== 'unknown'; }) >= 0.6) take('gender', c);
  }

  // Dates: every free column that is mostly dates, with the middle of its years / days.
  const dateCols: { col: number; mid: DateISO; oldShare: number }[] = [];
  for (const c of free()) {
    const vals = body.map((r) => r[c]).filter((v) => cellText(v) !== '');
    if (vals.length < 2) continue;
    const dayFirst = detectDayFirst(vals);
    const days = vals.map((v) => (typeof v === 'number' && (v < 20000 || v > 60000) ? null : parseSheetDate(v, today, dayFirst))).filter((d): d is DateISO => d !== null);
    if (days.length / vals.length < 0.6) continue;
    days.sort();
    const mid = days[Math.floor(days.length / 2)]!;
    const oldShare = days.filter((d) => yearOf(d) <= yearOf(today) - 15).length / days.length;
    dateCols.push({ col: c, mid, oldShare });
  }
  const births = dateCols.filter((d) => d.oldShare >= 0.6);
  if (out.dateOfBirth === null && births.length > 0) take('dateOfBirth', births[0]!.col);
  const others = dateCols.filter((d) => !used.has(d.col)).sort((a, b) => (a.mid < b.mid ? -1 : a.mid > b.mid ? 1 : 0));
  if (others.length === 1) {
    // One date column: an end date when its middle is recent or ahead, else the joining date.
    const only = others[0]!;
    if (out.expiry === null && only.mid >= addDays(today, -45)) take('expiry', only.col);
    else if (out.joinedOn === null) take('joinedOn', only.col);
  } else if (others.length > 1) {
    if (out.expiry === null) take('expiry', others[others.length - 1]!.col);
    const rest = others.filter((d) => !used.has(d.col));
    // Two left: the later is the plan's start, the earlier the joining date; one left: joining.
    if (rest.length >= 2 && out.startDate === null) take('startDate', rest[rest.length - 1]!.col);
    const first = rest.find((d) => !used.has(d.col));
    if (first && out.joinedOn === null) take('joinedOn', first.col);
  }

  // Money: amounts that are not mobiles.
  const isMoney = (v: unknown): boolean => {
    if (parseImportPhone(v).ok) return false;
    const t = cellText(v).replace(/\/-$|,|₹|rs\.?|inr/gi, '').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return false;
    const n = Number(t);
    return n >= 100 && n <= 500000;
  };
  const moneyCols = free().filter((c) => share(c, isMoney) >= 0.6);
  const avg = (c: number) => {
    const ns = body.map((r) => Number(cellText(r[c]).replace(/\/-$|,|₹|rs\.?|inr/gi, ''))).filter((n) => Number.isFinite(n) && n > 0);
    return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;
  };
  if (moneyCols.length >= 2 && out.total === null && out.amount === null) {
    const [big, small] = [...moneyCols].sort((a, b) => avg(b) - avg(a));
    take('total', big!);
    take('amount', small!);
  } else if (moneyCols.length >= 1 && out.amount === null) {
    take('amount', moneyCols[0]!);
  }
  return out;
}

/** `A`, `B` … `Z`, `AA` — the letter Excel shows above a column. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// ---------------------------------------------------------------- cells

/** One cell as the spreadsheet library hands it over. */
export type Cell = string | number | boolean | Date | null | undefined;

function isDate(v: unknown): v is Date {
  return v instanceof Date;
}

/** A cell as text: trimmed, numbers without exponent where they are whole, dates as `YYYY-MM-DD`. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    return Number.isInteger(v) && Math.abs(v) < 1e21 ? v.toFixed(0) : String(v);
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (isDate(v)) {
    if (Number.isNaN(v.getTime())) return '';
    // The spreadsheet library builds dates at UTC midnight, so the UTC parts are the day written.
    return toISO(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  return String(v).trim();
}

// ---------------------------------------------------------------- dates

/**
 * Excel's date number (days since 1900, with Excel's famous fake 29 Feb 1900) to a day.
 * 45519 is 15 Aug 2024.
 */
export function excelSerialToISO(serial: number): DateISO | null {
  if (!Number.isFinite(serial)) return null;
  const n = Math.floor(serial);
  if (n < 1 || n > 2958465 || n === 60) return null;
  // Serial 1 = 1 Jan 1900. After the fake leap day (60), every serial is one day "ahead".
  return n < 60 ? addDays('1899-12-31', n) : addDays('1899-12-30', n);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function monthFromName(name: string): number | null {
  const key = name.toLowerCase().slice(0, 3);
  return MONTHS[key] ?? null;
}

/** `26` -> 2026, `95` -> 1995: a two-digit year more than ten years ahead is last century. */
export function fullYear(yy: number, todayYear: number): number {
  if (yy >= 100) return yy;
  return 2000 + yy <= todayYear + 10 ? 2000 + yy : 1900 + yy;
}

/**
 * A two-digit year of a day that has already happened (a birthday): never ahead of this year. In
 * 2026, `'00`-`'26` are 2000-2026 and `'27`-`'99` are 1927-1999.
 */
export function pastYear(yy: number, todayYear: number): number {
  if (yy >= 100) return yy;
  return 2000 + yy <= todayYear ? 2000 + yy : 1900 + yy;
}

/**
 * The Excel date numbers a NUMBER cell may be read as: 20000 (Oct 1954) to 60000 (Apr 2064). Any
 * other number in a date column is digits typed in (150826, 15082026), never a date number — read as
 * one, 150826 became a joining date in the year 2312.
 */
export const EXCEL_SERIAL_MIN = 20000;
export const EXCEL_SERIAL_MAX = 60000;

function checked(y: number, m: number, d: number): DateISO | null {
  const iso = toISO(y, m, d);
  return isValidDateISO(iso) ? iso : null;
}

const NUMERIC_DATE = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})(?:[ T].*)?$/;

/**
 * Is this column written day-first (Indian: 15/08/2026)? Day-first unless some date has a middle
 * number above 12 and none has a first number above 12 — then the sheet was saved month-first
 * (a US-set Google Sheet), and reading it day-first would swap day and month without a word.
 */
export function detectDayFirst(values: readonly unknown[]): boolean {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const m = NUMERIC_DATE.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) firstOver12 = true;
    if (Number(m[2]) > 12) secondOver12 = true;
  }
  return !(secondOver12 && !firstOver12);
}

/**
 * Read one date cell. Returns the day, or null when the cell is not a date we can read with
 * certainty (blank cells are the caller's business: they are not wrong, just empty).
 *
 * `past`: the day has already happened (a birthday). A two-digit year then never lands ahead of
 * today: '27-'99 are the 1900s, '00-'26 the 2000s (in 2026), and a 2000s day still ahead of today
 * goes back a century.
 */
export function parseSheetDate(v: unknown, today: DateISO, dayFirst = true, past = false): DateISO | null {
  if (isDate(v)) {
    const t = cellText(v);
    return isValidDateISO(t) ? t : null;
  }
  let s: string;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    // Only a real number cell in the date-number range is one of Excel's date numbers.
    if (v >= EXCEL_SERIAL_MIN && v <= EXCEL_SERIAL_MAX) return excelSerialToISO(v);
    if (!Number.isInteger(v) || v < 0) return null;
    // Digits typed into a number cell: Excel drops the leading zero of 01082026.
    s = String(v);
    if (s.length === 7) s = `0${s}`;
  } else {
    s = cellText(v);
  }
  if (!s) return null;
  const todayYear = Number(today.slice(0, 4));
  /** The year as written: 4 digits as is, 2 digits by the rule for this kind of date. */
  const yearOf = (raw: string) =>
    raw.length === 2 ? (past ? pastYear(Number(raw), todayYear) : fullYear(Number(raw), todayYear)) : Number(raw);
  const day = (rawYear: string, month: number, d: number): DateISO | null => {
    const iso = checked(yearOf(rawYear), month, d);
    if (iso && past && rawYear.length === 2 && iso > today) return checked(yearOf(rawYear) - 100, month, d);
    return iso;
  };

  // 2026-08-15 (and 2026/08/15), maybe with a time after it.
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(s);
  if (m) return checked(Number(m[1]), Number(m[2]), Number(m[3]));

  // 15/08/2026, 15-08-26, 15.8.2026
  m = NUMERIC_DATE.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return dayFirst ? day(m[3]!, b, a) : day(m[3]!, a, b);
  }

  // 15 Aug 2026, 15-Aug-26, 15th August, 2026
  m = /^(\d{1,2})(?:st|nd|rd|th)?[-/. ]*([a-z]{3,9})[-/., ]*(\d{2}|\d{4})$/i.exec(s);
  if (m) {
    const month = monthFromName(m[2]!);
    return month ? day(m[3]!, month, Number(m[1])) : null;
  }

  // Aug 15, 2026
  m = /^([a-z]{3,9})[-/. ]+(\d{1,2})(?:st|nd|rd|th)?[,]?[-/. ]+(\d{2}|\d{4})$/i.exec(s);
  if (m) {
    const month = monthFromName(m[1]!);
    return month ? day(m[3]!, month, Number(m[2])) : null;
  }

  // 15082026 (ddmmyyyy, the Indian way, read first) or 20260815 (yyyymmdd), typed without
  // separators. The two can never both be real days with a 19xx/20xx year.
  m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (m) {
    const dmy = dayFirst
      ? checked(Number(m[3]), Number(m[2]), Number(m[1]))
      : checked(Number(m[3]), Number(m[1]), Number(m[2]));
    if (dmy && /^(19|20)/.test(m[3]!)) return dmy;
    const ymd = checked(Number(s.slice(0, 4)), Number(s.slice(4, 6)), Number(s.slice(6, 8)));
    if (ymd && /^(19|20)/.test(s)) return ymd;
    return dmy;
  }

  // Anything else (150826, 45519 typed as text) is not a date we can be sure of.
  return null;
}

// ---------------------------------------------------------------- phone, gender

export type PhoneRead =
  | { ok: true; e164: string; extra: string | null }
  | { ok: false; why: 'missing' | 'shortened' | 'invalid' };

/**
 * A mobile from a cell, through the add-member form's own rules (+91 unless the cell says
 * otherwise). A cell with two numbers ("98290 12345 / 94140 54321") keeps the first; the rest is
 * handed back so it can go into notes rather than vanish.
 */
export function parseImportPhone(v: unknown): PhoneRead {
  const raw = cellText(v);
  if (!raw) return { ok: false, why: 'missing' };
  // Excel showed a long number as 9.87654E+09 and the CSV saved the SHORTENED digits.
  if (/^\+?\d+(\.\d+)?e\+?\d+$/i.test(raw.replace(/\s/g, ''))) return { ok: false, why: 'shortened' };

  const parts = raw.split(/[,;/|\n]+/).map((p) => p.trim()).filter(Boolean);
  const first = parts[0] ?? '';
  const extra = parts.slice(1).join(', ') || null;

  let compact = first.replace(/[\s().-]/g, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;
  let parsed;
  if (compact.startsWith('+')) {
    const { dialCode, national } = splitE164(`+${compact.replace(/\D/g, '')}`);
    parsed = normalizePhone(dialCode, national);
  } else {
    parsed = normalizePhone(DEFAULT_DIAL_CODE, first);
  }
  return parsed ? { ok: true, e164: parsed.e164, extra } : { ok: false, why: 'invalid' };
}

const MALE = new Set(['m', 'male', 'man', 'boy', 'gents', 'gent', 'purush', 'mard', 'ladka', 'पुरुष', 'mr']);
const FEMALE = new Set(['f', 'female', 'woman', 'girl', 'lady', 'ladies', 'mahila', 'aurat', 'ladki', 'महिला', 'स्त्री', 'mrs', 'ms']);
const OTHER = new Set(['o', 'other', 'others', 'trans', 'transgender', 'anya']);

/** `M`, `Male`, `ladka`, `F`, `Mahila` … -> a gender; blank -> null; anything else -> 'unknown'. */
export function parseGender(v: unknown): Gender | null | 'unknown' {
  const s = normalizeHeader(v);
  if (!s) return null;
  if (MALE.has(s)) return 'male';
  if (FEMALE.has(s)) return 'female';
  if (OTHER.has(s)) return 'other';
  return 'unknown';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------------------------------------------------------------- CSV and files

/**
 * Parse CSV text (quotes, doubled quotes, line breaks inside quotes, CRLF). The separator is
 * whichever of comma, semicolon or tab the first line uses most: Excel in many locales saves `;`.
 */
export function parseCsv(text: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = body.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const seps = [',', ';', '\t'];
  const sep = seps.reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (quoted) {
      if (c === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === '') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim()));
}

/** CSV bytes to text: UTF-8 when it is valid UTF-8, else the Windows code page old Excel saves in. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Not UTF-8: an older Excel "CSV" is Windows-1252. Reading it that way keeps every name.
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export type FileKind = 'xlsx' | 'csv' | 'xls' | 'html' | 'unknown';

/** What kind of file this really is: by its first bytes first, by its name second. */
/** Does this file's start look like a web page (after a BOM and spaces)? */
export function looksLikeHtml(head: Uint8Array): boolean {
  let i = 0;
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) i = 3;
  while (i < head.length && (head[i] === 0x20 || head[i] === 0x09 || head[i] === 0x0a || head[i] === 0x0d)) i += 1;
  return head[i] === 0x3c; // "<"
}

export function sniffFile(name: string, head: Uint8Array): FileKind {
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return 'xlsx';
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return 'xls';
  const ext = name.toLowerCase().split('.').pop() ?? '';
  // 16 Oct 2026: some gym software saves a web page (an HTML table) or "Excel 2003 XML" as .xls.
  if ((ext === 'xls' || ext === 'htm' || ext === 'html' || ext === 'xml') && looksLikeHtml(head)) return 'html';
  // Some gym software saves a tab-separated text file and names it .xls.
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv' || ext === 'xls') return 'csv';
  return 'unknown';
}

// ---------------------------------------------------------------- the plan

/** The most rows one import takes: one browser holds a gym, not a city. */
export const MAX_IMPORT_ROWS = 2000;

/** A joining date further ahead than this is a problem (a typo), not a warning. */
export const JOIN_AHEAD_MAX_DAYS = 365;

export type RowStatus = 'add' | 'duplicate' | 'problem';

export interface ImportRow {
  /** The row number Excel shows on the left. */
  rowNumber: number;
  /** The row's cells as text, for the skipped-rows file. */
  cells: string[];
  /** The name as written (blank when the row has none), to show the row by. */
  name: string;
  status: RowStatus;
  /** Ready to save when the row is fine (`add`) or a duplicate of a member already here. */
  draft: MemberDraft | null;
  /** A duplicate of this member already in the gym. */
  existing: Member | null;
  /** A duplicate of an earlier row in this same file. */
  sameAsRow: number | null;
  /** Why the row cannot be added, in plain words. */
  problems: string[];
  /** Added anyway, but something was left out or assumed. */
  warnings: string[];
  /**
   * 15 Oct 2026: the membership (and receipt) this row describes — saved after the member
   * (`importTerms.ts`). Null when the row names no plan with dates.
   */
  term: ImportTerm | null;
}

export interface ImportPlan {
  rows: ImportRow[];
  counts: { add: number; duplicate: number; problem: number };
  /** Rows past `MAX_IMPORT_ROWS`, not looked at. */
  leftOut: number;
}

function cellAt(row: readonly unknown[], col: number | null): unknown {
  return col === null ? undefined : row[col];
}

function isBlankRow(row: readonly unknown[]): boolean {
  return row.every((c) => cellText(c) === '');
}

/**
 * Turn the sheet into a row-by-row plan: who will be added, who is already a member, and what is
 * wrong with the rest. `roster` is every member of the gym, archived ones included.
 */
export function planImport(
  rows: readonly (readonly unknown[])[],
  headerRow: number,
  map: ColumnMap,
  roster: readonly Member[],
  today: DateISO,
): ImportPlan {
  const data: { row: readonly unknown[]; rowNumber: number }[] = [];
  for (let i = headerRow + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (!isBlankRow(row)) data.push({ row, rowNumber: i + 1 });
  }
  const leftOut = Math.max(0, data.length - MAX_IMPORT_ROWS);
  const taken = data.slice(0, MAX_IMPORT_ROWS);

  const colValues = (col: number | null) => (col === null ? [] : taken.map((d) => d.row[col]));
  const joinDayFirst = detectDayFirst(colValues(map.joinedOn));
  const dobDayFirst = detectDayFirst(colValues(map.dateOfBirth));
  const expiryDayFirst = detectDayFirst(colValues(map.expiry));
  const startDayFirst = detectDayFirst(colValues(map.startDate));
  const paidDayFirst = detectDayFirst(colValues(map.paidOn));

  const batchNames = listBatches(roster).map((b) => b.name);
  const seen = new Map<string, number>();
  const out: ImportRow[] = [];

  for (const { row, rowNumber } of taken) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const text = (f: ImportField) => cellText(cellAt(row, map[f]));

    // Name
    const fullName = normalizeName(text('fullName'));
    if (!fullName) problems.push(tr('No name.', 'Naam nahi hai.'));

    // Mobile
    const phoneRead = parseImportPhone(cellAt(row, map.phone));
    if (!phoneRead.ok) {
      const shown = text('phone');
      problems.push(
        phoneRead.why === 'missing'
          ? tr('No mobile number.', 'Mobile number nahi hai.')
          : phoneRead.why === 'shortened'
            ? tr(
                `Mobile “${shown}” was shortened by Excel. Set that column to Text in Excel and save again.`,
                `Excel ne mobile “${shown}” chhota kar diya. Excel mein us column ko Text karke phir save karo.`,
              )
            : tr(`Mobile “${shown}” is not a valid 10-digit number.`, `Mobile “${shown}” sahi 10 ank ka number nahi hai.`),
      );
    }

    // Joining date: blank = today (said once on screen when the column is missing, per row otherwise).
    let joinedOn = today;
    const joinRaw = cellAt(row, map.joinedOn);
    if (text('joinedOn')) {
      const d = parseSheetDate(joinRaw, today, joinDayFirst);
      if (!d) {
        problems.push(
          tr(
            `Joining date “${text('joinedOn')}” is not a date we can read. Write it like 15/08/2026.`,
            `Joining date “${text('joinedOn')}” samajh nahi aayi. Aise likho: 15/08/2026.`,
          ),
        );
      } else if (d < EARLIEST_DATE) {
        problems.push(tr(`Joining date ${formatDay(d)} looks like a typo — check the year.`, `Joining date ${formatDay(d)} galat lag rahi hai — saal check karo.`));
      } else if (d > addDays(today, JOIN_AHEAD_MAX_DAYS)) {
        // Nobody joins more than a year ahead: this is a typed year (2062) or digits misread.
        problems.push(
          tr(
            `Joining date ${formatDay(d)} is more than a year away — check the year.`,
            `Joining date ${formatDay(d)} ek saal se zyada aage hai — saal check karo.`,
          ),
        );
      } else {
        joinedOn = d;
        if (d > today) warnings.push(tr(`Joining date ${formatDay(d)} is in the future.`, `Joining date ${formatDay(d)} aage ki hai.`));
      }
    } else if (map.joinedOn !== null) {
      warnings.push(tr('No joining date — today is used.', 'Joining date nahi hai — aaj ki date lagi.'));
    }

    // Date of birth: optional, so a bad one is left out (and said), never a reason to skip someone.
    let dateOfBirth = '';
    if (text('dateOfBirth')) {
      const d = parseSheetDate(cellAt(row, map.dateOfBirth), today, dobDayFirst, true);
      if (!d) warnings.push(tr(`Birthday “${text('dateOfBirth')}” not readable — left blank.`, `Janam din “${text('dateOfBirth')}” samajh nahi aaya — khaali chhoda.`));
      else if (d > today) warnings.push(tr(`Birthday ${formatDay(d)} is in the future — left blank.`, `Janam din ${formatDay(d)} aage ki date hai — khaali chhoda.`));
      else dateOfBirth = d;
    }

    // Gender
    let gender = '';
    const g = parseGender(cellAt(row, map.gender));
    if (g === 'unknown') warnings.push(tr(`Gender “${text('gender')}” not understood — left blank.`, `Gender “${text('gender')}” samajh nahi aaya — khaali chhoda.`));
    else if (g) gender = g;

    // Email
    let email = text('email');
    if (email && !EMAIL_RE.test(email)) {
      warnings.push(tr(`Email “${email}” doesn’t look right — left blank.`, `Email “${email}” sahi nahi lag raha — khaali chhoda.`));
      email = '';
    }

    // Batch: the gym's own spelling when it already has this batch.
    let batch = resolveBatch(text('batch'), batchNames) ?? '';
    if (batch.length > BATCH_MAX) {
      warnings.push(tr(`Batch name cut to ${BATCH_MAX} letters.`, `Batch ka naam ${BATCH_MAX} akshar tak chhota kiya.`));
      batch = batch.slice(0, BATCH_MAX).trim();
    }
    if (batch && !batchNames.includes(batch)) batchNames.push(batch);

    // 15 Oct 2026 (data migration): the plan with its dates becomes a real membership, and what
    // was paid a real receipt (`termFromRow`). Only a plan the row cannot date stays in the notes.
    const money = (f: ImportField) => (text(f) ? parseRupeeInput(text(f).replace(/\/-$|,/g, '')) : null);
    const endsOn = text('expiry') ? parseSheetDate(cellAt(row, map.expiry), today, expiryDayFirst) : null;
    const startsOn = text('startDate') ? parseSheetDate(cellAt(row, map.startDate), today, startDayFirst) : null;
    const term = termFromRow({
      planName: text('plan'),
      startsOn,
      endsOn,
      joinedOn: text('joinedOn') ? joinedOn : null,
      totalP: money('total'),
      paidP: money('amount'),
      dueP: money('due'),
      paidOn: text('paidOn') ? parseSheetDate(cellAt(row, map.paidOn), today, paidDayFirst) : null,
    });
    // No joining-date column: the plan's start is a better joining date than today.
    if (map.joinedOn === null && term && term.startsOn >= EARLIEST_DATE && term.startsOn <= today) joinedOn = term.startsOn;
    if (text('expiry') && !endsOn) {
      warnings.push(tr(`Valid till “${text('expiry')}” not readable — no plan added.`, `Valid till “${text('expiry')}” samajh nahi aaya — plan nahi juda.`));
    }
    const extras: string[] = [];
    if (!term) {
      if (text('plan')) extras.push(tr(`Plan: ${text('plan')}`, `Plan: ${text('plan')}`));
      const p = money('amount');
      if (text('amount')) extras.push(tr(`Fees: ${p !== null ? formatINR(p) : text('amount')}`, `Fees: ${p !== null ? formatINR(p) : text('amount')}`));
      if (text('expiry')) extras.push(tr(`Valid till: ${endsOn ? formatDay(endsOn) : text('expiry')}`, `Valid till: ${endsOn ? formatDay(endsOn) : text('expiry')}`));
    }
    if (phoneRead.ok && phoneRead.extra) extras.push(tr(`Other number: ${phoneRead.extra}`, `Doosra number: ${phoneRead.extra}`));
    const notes = [text('notes'), extras.length ? tr(`From Excel — ${extras.join(' · ')}`, `Excel se — ${extras.join(' · ')}`) : '']
      .filter(Boolean)
      .join('\n');

    let draft: MemberDraft | null = null;
    if (problems.length === 0 && phoneRead.ok) {
      const { dialCode, national } = splitE164(phoneRead.e164);
      const result = validateMember(
        {
          fullName,
          dialCode,
          phone: national,
          email,
          gender,
          dateOfBirth,
          address: text('address'),
          emergencyName: '',
          emergencyPhone: '',
          joinedOn,
          notes,
          batch,
        },
        today,
      );
      if (result.ok) draft = { ...result.value, archived: false, photoUri: null };
      else problems.push(result.message);
    }

    const cells = row.map(cellText);
    if (!draft) {
      out.push({ rowNumber, cells, name: fullName, status: 'problem', draft: null, existing: null, sameAsRow: null, problems, warnings, term: null });
      continue;
    }

    const earlier = seen.get(draft.phone);
    if (earlier !== undefined) {
      out.push({ rowNumber, cells, name: fullName, status: 'duplicate', draft, existing: null, sameAsRow: earlier, problems, warnings, term });
      continue;
    }
    seen.set(draft.phone, rowNumber);
    const existing = findDuplicatePhone(roster, draft.phone);
    out.push({ rowNumber, cells, name: fullName, status: existing ? 'duplicate' : 'add', draft, existing, sameAsRow: null, problems, warnings, term });
  }

  const counts = { add: 0, duplicate: 0, problem: 0 };
  for (const r of out) counts[r.status] += 1;
  return { rows: out, counts, leftOut };
}

/** One plain line: what happens to this row. */
export function rowVerdict(row: ImportRow): string {
  if (row.status === 'add') return tr('Will be added', 'Jud jayega');
  if (row.status === 'problem') return tr('Problem — will be skipped', 'Gadbad — chhoda jayega');
  if (row.sameAsRow !== null) {
    // 16 Oct 2026: a payments list repeats the member; the row's plan and payment still count.
    if (row.term) {
      return tr(
        `Same member as row ${row.sameAsRow} — this plan and payment are added to them`,
        `Row ${row.sameAsRow} wala hi member — yeh plan aur payment unhi mein judega`,
      );
    }
    return tr(`Same mobile as row ${row.sameAsRow} — skipped`, `Row ${row.sameAsRow} wala hi mobile — chhoda jayega`);
  }
  const who = row.existing?.fullName ?? '';
  return row.existing?.archived
    ? tr(`Already a member (${who}, archived)`, `Pehle se member hai (${who}, archive mein)`)
    : tr(`Already a member (${who})`, `Pehle se member hai (${who})`);
}

/**
 * For "fill in what is missing" on a member already in the gym: only the fields that member has
 * BLANK. Name, mobile and joining date are never touched — the gym's own record wins.
 */
export function fillBlanksPatch(existing: Member, draft: MemberDraft): Partial<MemberDraft> {
  const patch: Partial<MemberDraft> = {};
  const blank = (v: unknown) => v === null || v === undefined || v === '';
  if (blank(existing.email) && draft.email) patch.email = draft.email;
  if (blank(existing.gender) && draft.gender) patch.gender = draft.gender;
  if (blank(existing.dateOfBirth) && draft.dateOfBirth) patch.dateOfBirth = draft.dateOfBirth;
  if (blank(existing.address) && draft.address) patch.address = draft.address;
  if (blank(existing.batch) && draft.batch) patch.batch = draft.batch;
  if (blank(existing.notes) && draft.notes) patch.notes = draft.notes;
  return patch;
}

// ---------------------------------------------------------------- files out

/** Column names for the sample file, in the panel's language (both languages are recognised). */
export function templateHeaders(): string[] {
  return [
    tr('Name', 'Naam'),
    tr('Mobile', 'Mobile'),
    tr('Joining date', 'Joining date'),
    tr('Gender', 'Gender'),
    tr('Date of birth', 'Janam din'),
    tr('Address', 'Pata'),
    tr('Batch', 'Batch'),
    tr('Plan', 'Plan'),
    tr('Fees', 'Fees'),
    tr('Valid till', 'Valid till'),
    tr('Notes', 'Notes'),
  ];
}

/**
 * The sample file: column names only, so nothing made-up gets imported by mistake. In English in
 * every language, like every download (both languages' headers are recognised on the way back in).
 */
export function templateCsv(): string {
  return inEnglish(() => csvDocument(templateHeaders(), []));
}

/**
 * The rows that were not added, with the reason first, to fix and import again. English in every
 * language: pass reasons made in English too (`englishSkipReasons`, or words read in `inEnglish`).
 */
export function skippedRowsCsv(
  headers: readonly string[],
  skipped: readonly { row: ImportRow; reason: string }[],
): string {
  return inEnglish(() => {
    const width = Math.max(headers.length, ...skipped.map((s) => s.row.cells.length));
    const head = [tr('Row', 'Row'), tr('Why skipped', 'Kyun chhoda'), ...Array.from({ length: width }, (_, i) => headers[i] || columnLetter(i))];
    const body = skipped.map(({ row, reason }) => [
      row.rowNumber,
      reason,
      ...Array.from({ length: width }, (_, i) => row.cells[i] ?? ''),
    ]);
    return csvDocument(head, body);
  });
}

/** Why a row was skipped, in one line, for the skipped-rows file. */
export function skipReason(row: ImportRow): string {
  if (row.status === 'problem') return row.problems.join(' ');
  return rowVerdict(row);
}

/**
 * Every row's skip reason in ENGLISH, by Excel row number, whatever language the panel shows: the
 * same plan worked out again in English (it is pure, so the same file and roster give the same rows).
 */
export function englishSkipReasons(
  rows: readonly (readonly unknown[])[],
  headerRow: number,
  map: ColumnMap,
  roster: readonly Member[],
  today: DateISO,
): Map<number, string> {
  return inEnglish(() => {
    const plan = planImport(rows, headerRow, map, roster, today);
    return new Map(plan.rows.map((r) => [r.rowNumber, skipReason(r)]));
  });
}

// ---------------------------------------------------------------- saving

/** Members saved per save during an import: one write (one push online) each, with progress between. */
export const IMPORT_BATCH_SIZE = 500;

export interface BatchSaveOutcome {
  /** Rows now saved as members. */
  added: ImportRow[];
  /** Rows refused at save time because the mobile was already in the gym (another desk added it). */
  duplicates: ImportRow[];
  /** Rows not saved because saving stopped part-way. Empty when everything went through. */
  notSaved: ImportRow[];
  /** Why saving stopped, in the panel's words; null when it did not stop. */
  stopped: string | null;
}

/**
 * Save the `add` rows `size` at a time through `save` (the store's `createMembers`), calling
 * `onProgress` with how many rows are dealt with after each batch.
 *
 * A duplicate mobile (another desk added that member meanwhile) makes the whole batch refuse: that
 * row is set aside and the batch saved again without it. Any other failure (no internet) STOPS:
 * the rows already saved are reported as added — including the saved part of a batch the cloud
 * split (`PartialSaveError`) — and every other row as not saved. Importing the same file again is
 * safe: the saved members now read as "already a member" and are skipped.
 */
export async function saveInBatches(
  rows: readonly ImportRow[],
  save: (drafts: MemberDraft[]) => Promise<Member[]>,
  onProgress: (done: number) => void,
  size: number = IMPORT_BATCH_SIZE,
): Promise<BatchSaveOutcome> {
  const work = rows.filter((r) => r.draft !== null);
  const added: ImportRow[] = [];
  const duplicates: ImportRow[] = [];
  for (let start = 0; start < work.length; start += size) {
    let batch = work.slice(start, start + size);
    while (batch.length > 0) {
      try {
        await save(batch.map((r) => r.draft as MemberDraft));
        added.push(...batch);
        break;
      } catch (e) {
        if (e instanceof DuplicatePhoneError) {
          // The LAST row with that mobile: within one batch, the first one is the one to keep.
          let at = -1;
          batch.forEach((r, i) => {
            if (r.draft?.phone === e.existing.phone) at = i;
          });
          if (at >= 0) {
            duplicates.push(batch[at]!);
            batch = batch.filter((_, i) => i !== at);
            continue;
          }
        }
        const savedPhones = new Set(e instanceof PartialSaveError ? e.saved.map((m) => m.phone) : []);
        const savedHere = batch.filter((r) => savedPhones.has(r.draft?.phone ?? ''));
        added.push(...savedHere);
        return {
          added,
          duplicates,
          notSaved: [...batch.filter((r) => !savedHere.includes(r)), ...work.slice(start + size)],
          stopped: e instanceof Error && e.message ? e.message : tr('Saving stopped.', 'Save ruk gaya.'),
        };
      }
    }
    onProgress(Math.min(work.length, start + size));
  }
  return { added, duplicates, notSaved: [], stopped: null };
}
