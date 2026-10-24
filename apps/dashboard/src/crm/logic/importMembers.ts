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
import { csvDocument } from './csv';
import { addDays, formatDay, isValidDateISO, toISO, type DateISO } from './dates';
import { DuplicatePhoneError, EARLIEST_DATE, PartialSaveError } from '../data/adapter';
import { BATCH_MAX, listBatches, resolveBatch } from './batches';
import { formatINR, parseRupeeInput } from './money';
import { DEFAULT_DIAL_CODE, findDuplicatePhone, normalizeName, normalizePhone, splitE164, validateMember, withoutTitle } from './members';
import { termFromRow, type ImportTerm } from './importTerms';
import { scrubIds } from './importIds';

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
  | 'notes'
  | 'branch'
  /**
   * #36 review (24 Oct 2026): a "Paid" column written as yes / no or a tick. Yes = the plan was paid
   * in full, no = nothing paid yet. Never money itself.
   */
  | 'paidFlag';

export const IMPORT_FIELDS: readonly ImportField[] = [
  'fullName', 'phone', 'joinedOn', 'gender', 'dateOfBirth', 'email', 'address', 'batch', 'plan', 'startDate', 'total', 'amount', 'paidOn', 'due', 'expiry', 'notes', 'branch', 'paidFlag',
];

/** Which column (0-based) holds each field; null = not in the file. */
export type ColumnMap = Record<ImportField, number | null>;

export function emptyColumnMap(): ColumnMap {
  return Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as ColumnMap;
}

/** The field's name on screen. */
export function fieldLabel(field: ImportField): string {
  switch (field) {
    case 'fullName': return 'Name';
    case 'phone': return 'Mobile';
    case 'joinedOn': return 'Joining date';
    case 'gender': return 'Gender';
    case 'dateOfBirth': return 'Date of birth';
    case 'email': return 'Email';
    case 'address': return 'Address';
    case 'batch': return 'Batch';
    case 'plan': return 'Plan';
    case 'startDate': return 'Plan start';
    case 'total': return 'Plan price';
    case 'amount': return 'Fees paid';
    case 'paidOn': return 'Payment date';
    case 'due': return 'Balance due';
    case 'expiry': return 'Valid till';
    case 'notes': return 'Notes';
    case 'branch': return 'Branch';
    case 'paidFlag': return 'Paid? (yes or no)';
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
    // Admin audit C7-6 (16 Oct 2026): "Total Fees / Paid Fees / Due Fees" registers.
    'total fees', 'total fee', 'total amt', 'package fee', 'fees total',
  ],
  amount: [
    'amount', 'fees', 'fee', 'fees paid', 'fee paid', 'amount paid', 'paid amount', 'rupees', 'received',
    'amount received', '=payment', 'payment amount',
    // C7-7: a Joining / Admission fee column is NOT what was paid (it was read as the paid column and
    // made a false due); it is left out, like any column the panel has no field for.
    // C7-6 / C7-8: "Paid Fees", and "Amt" (a short header the value guess used to miss).
    'paid fees', 'paid fee', 'amt', 'paid amt', 'amt paid',
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
    // C7-6
    'due fees', 'due fee', 'fees due', 'fee due', 'balance fees', 'balance fee', 'pending fee', 'due amt', 'balance amt',
  ],
  expiry: [
    'expiry', 'expiry date', 'expire', 'expires', 'expires on', 'end date', 'ending date', 'valid till',
    'valid upto', 'valid up to', 'validity', 'renewal date', '=renewal', 'due date', 'next due',
    '=till', 'khatam', 'समाप्ति',
  ],
  notes: ['notes', 'note', 'remarks', 'remark', 'comment', 'comments', '=other', 'टिप्पणी'],
  // Tracker #41 (24 Oct 2026): one sheet for all branches names each member's branch. "Location"
  // and "Area" stay address words (a member's home); "Branch Location" / "Gym Location" are the
  // branch, and a column whose VALUES are the gym's branch names is found by `guessBranchColumn`.
  // Only used when the gym has 2 or more branches (the screen clears it otherwise).
  branch: [
    'branch', 'branch name', 'gym branch', 'branch location', 'gym location', 'centre', 'center', 'centre name',
    'center name', 'gym centre', 'gym center', 'outlet', 'franchise', 'shakha', 'branch ka naam', 'शाखा', 'ब्रांच', 'सेंटर',
  ],
  // Only headers that cannot mean money; a bare "Paid" column is told apart by what is in it
  // (settlePaidColumns).
  paidFlag: ['payment status', 'fee status', 'fees status', 'paid status', 'paid y n', 'paid yes no', 'fees paid yes no', 'paid or not'],
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
      // C7-6: a column that says "total" is the plan's price, never the amount paid.
      if (field === 'amount' && padded.includes(' total ')) return;
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
  // #36 review (24 Oct 2026): which of "Amount" and "Paid" is the price is decided from what the
  // columns HOLD (settlePaidColumns, run by guessFromValues), never from their names alone.
  return map;
}

/**
 * "Paid" as a tick: yes / no in English, Hinglish and Hindi, ✓ / ✗, Y / N. Never 1 / 0 (money in
 * some sheets). Null when the cell is none of them. PURE.
 */
export function parsePaidFlag(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  const t = cellText(v).trim().toLowerCase().replace(/[.!]+$/, '');
  if (!t) return null;
  if (PAID_YES.has(t)) return true;
  if (PAID_NO.has(t)) return false;
  return null;
}

const PAID_YES = new Set(['yes', 'y', 'paid', 'done', 'ok', 'haan', 'ha', 'han', 'ji', 'full', 'full paid', 'fully paid', '✓', '✔', '✅', '☑', 'हाँ', 'हां', 'जमा']);
const PAID_NO = new Set(['no', 'n', 'unpaid', 'not paid', 'pending', 'nahi', 'nahin', 'na', 'baki', 'baaki', '✗', '✘', '✕', '❌', '×', 'x', 'नहीं', 'बाकी']);

/**
 * #36 review (24 Oct 2026): GGMS-style exports have "Amount, Paid, Balance". When a "Paid" column
 * sits beside "Amount" / "Fees", what is IN it decides what it is (the names alone imported a
 * Yes/No "Paid" column as "everyone owes the full fee", and a "Paid" column of Excel dates as
 * ₹46,296 paid):
 *  - mostly money, each no more than the Amount on its row: Amount is the plan's price, Paid is
 *    what was paid;
 *  - mostly yes / no / ✓ / ✗: Amount is the price and Paid says paid in full or not (paidFlag);
 *  - mostly dates: Paid is the payment date, Amount stays the fees paid;
 *  - anything else: nothing changes (Paid stays an extra detail). PURE.
 */
export function settlePaidColumns(rows: readonly (readonly unknown[])[], headerRow: number, map: ColumnMap, today: DateISO): ColumnMap {
  if (map.total !== null || map.amount === null) return map;
  const headers = rows[headerRow] ?? [];
  const used = new Set<number>(IMPORT_FIELDS.map((f) => map[f]).filter((c): c is number => c !== null));
  const amountIsPaid = PAID_HEADERS.has(normalizeHeader(headers[map.amount]));
  // A = the column with the price (or plain fees), P = the "Paid" column.
  const A = amountIsPaid ? headers.findIndex((h, c) => !used.has(c) && BARE_AMOUNT_HEADERS.has(normalizeHeader(h))) : map.amount;
  const P = amountIsPaid ? map.amount : headers.findIndex((h, c) => !used.has(c) && PAID_HEADERS.has(normalizeHeader(h)));
  if (P < 0) return map;
  const body = rows.slice(headerRow + 1, headerRow + 201).filter((r) => !isBlankRow(r));
  const filled = body.filter((r) => cellText(r[P]) !== '');
  if (filled.length === 0) return map;
  const out: ColumnMap = { ...map };
  if (A < 0) {
    // "Paid Amount" alone: only a yes / no column changes (it is then a paid flag, not money).
    if (filled.filter((r) => parsePaidFlag(r[P]) !== null).length / filled.length >= 0.6) {
      out.amount = null;
      out.paidFlag = P;
    }
    return out;
  }
  const share = (test: (r: readonly unknown[]) => boolean) => filled.filter(test).length / filled.length;
  const isDate = (v: unknown) =>
    typeof v === 'number' ? v >= EXCEL_SERIAL_MIN && v <= EXCEL_SERIAL_MAX : v instanceof Date || parseSheetDate(v, today) !== null;
  const money = (v: unknown) => (v instanceof Date ? null : parseImportMoney(cellText(v)));
  // Money, never more than the Amount on its row (a row with no Amount does not count against it).
  const paidFits = (r: readonly unknown[]) => {
    const p = money(r[P]);
    if (p === null || (typeof r[P] !== 'number' && isDate(r[P]))) return false;
    const a = money(r[A]);
    return a === null || p <= a;
  };
  if (share(paidFits) >= 0.6) {
    out.total = A;
    out.amount = P;
    return out;
  }
  if (share((r) => parsePaidFlag(r[P]) !== null) >= 0.6) {
    out.total = A;
    out.amount = null;
    out.paidFlag = P;
    return out;
  }
  // "Paid" full of dates (or a "Paid Amount" that is not money): the plain Amount is what was paid.
  if (amountIsPaid) out.amount = A;
  if (share((r) => isDate(r[P])) >= 0.6 && out.paidOn === null) out.paidOn = P;
  return out;
}

const BARE_AMOUNT_HEADERS = new Set(['amount', 'amt', 'fees', 'fee', 'rs', 'rupees']);

/** Headers that can only mean "what was paid". */
const PAID_HEADERS = new Set(['paid', 'paid amount', 'amount paid', 'paid amt', 'amt paid', 'paid fees', 'fees paid', 'fee paid', 'received', 'amount received', 'jama']);

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
  const out: ColumnMap = settlePaidColumns(rows, headerRow, { ...map }, today);
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
    const p = parseImportMoney(cellText(v));
    return p !== null && p >= 100_00 && p <= 5_00_000_00;
  };
  // Admin audit C7-8 (16 Oct 2026): a Member ID / Sr. No. column (1001, 1002 …) passed as money and
  // was read as the fees paid. A column whose header names a number or a joining fee, or whose
  // numbers all differ and run one after another, is never money.
  const header = rows[headerRow] ?? [];
  const notMoneyHeader = (c: number) => NOT_MONEY_HEADER.test(` ${normalizeHeader(header[c])} `);
  const runsInSequence = (c: number): boolean => {
    const ns = body.map((r) => cellText(r[c])).filter((t) => t !== '').map(Number);
    if (ns.length < 2 || ns.some((n) => !Number.isInteger(n))) return false;
    const sorted = [...ns].sort((a, b) => a - b);
    return sorted.every((n, i) => i === 0 || n === sorted[i - 1]! + 1);
  };
  const moneyCols = free().filter((c) => !notMoneyHeader(c) && !runsInSequence(c) && share(c, isMoney) >= 0.6);
  const avg = (c: number) => {
    const ns = body.map((r) => (parseImportMoney(cellText(r[c])) ?? 0) / 100).filter((n) => n > 0);
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

/** C7-8: a header that names a number or a fee the panel does not take is never guessed as money. */
// #36: body sizes too ("Height (cm)": 172 is not ₹172), and a locker or room number.
const NOT_MONEY_HEADER = / (id|no|nos|sr|s no|sno|serial|code|roll|receipt|invoice|bill|joining|admission|registration|reg|height|weight|age|cm|kg|kgs|inch|inches|ft|feet|bmi|locker|room|floor|pin|pincode) /;

/**
 * A fees cell as paise (admin audit C7-5, 16 Oct 2026): "Rs. 1,500/-", "Rs 1500", "INR 1500",
 * "₹1,500", "1500 (paid)", "1500/- only", "1.5k", "1.2 lakh". Null when it is not an amount. PURE.
 */
export function parseImportMoney(raw: string): number | null {
  let t = raw.normalize('NFKC').toLowerCase();
  t = t.replace(/\([^)]*\)/g, ' ').replace(/\/-/g, ' ').replace(/[₹,]/g, '');
  t = t.replace(/rupees|rupee|rs\.?|inr|only|paid/g, ' ').replace(/\s+/g, '');
  if (!t) return null;
  const scaled = /^(\d+(?:\.\d+)?)(k|l|lakh|lakhs|lac|lacs)$/.exec(t);
  if (scaled) {
    const n = Number(scaled[1]) * (scaled[2] === 'k' ? 1000 : 100000);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  }
  return parseRupeeInput(t);
}

/**
 * Admin audit C7-3 (16 Oct 2026): the same person, as two rows or a row and a member, only when the
 * names agree: the same name, or the same first name ("RAMESH" and "Ramesh Gupta"). A family's
 * shared mobile ("Sunita Gupta" on Ramesh's number) is two people. PURE.
 */
export function samePersonName(a: string, b: string): boolean {
  const words = (x: string) => withoutTitle(x).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  const x = words(a);
  const y = words(b);
  if (x.length === 0 || y.length === 0) return true;
  return x.join(' ') === y.join(' ') || x[0] === y[0];
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
 * C7-22: what a column's own dates prove: 'day' (some first number is over 12), 'month' (some
 * middle number is over 12 and no first one is), or 'unknown' (every date reads both ways). PURE.
 */
export function dateOrder(values: readonly unknown[]): 'day' | 'month' | 'unknown' {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const m = NUMERIC_DATE.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) firstOver12 = true;
    if (Number(m[2]) > 12) secondOver12 = true;
  }
  if (firstOver12) return 'day';
  return secondOver12 ? 'month' : 'unknown';
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
    // Admin audit C7-45: a birthday before Oct 1954 is a smaller date number (an old .xls). From 3000
    // (1908) up, never a bare year typed in (1990), which stays unreadable.
    if (past && Number.isInteger(v) && v >= 3000 && v < EXCEL_SERIAL_MIN) return excelSerialToISO(v);
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
  // Admin audit C7-39 (16 Oct 2026): Excel's "Unicode Text" export is UTF-16, marked by its first
  // two bytes. Read as UTF-8 every other byte was a NUL and every row came out blank.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
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
  /** #41: the branch this row goes to (gym id). Absent = the gym has one branch. */
  gymId?: string;
  /** #41: the owner chose "Skip these rows" for this row's branch name: not a row to check. */
  ownerSkipped?: boolean;
  /** #41: this row's branch could not be opened, or is still opening (a try again may fix it). */
  branchWaiting?: boolean;
  /** #41: this row's branch name matched none: the owner's pick under "Branches in your file" fixes it. */
  needsBranch?: boolean;
}

export interface ImportPlan {
  rows: ImportRow[];
  counts: { add: number; duplicate: number; problem: number };
  /** Rows past `MAX_IMPORT_ROWS`, not looked at. */
  leftOut: number;
  /** #36: totals rows and stray cells, left out and listed on screen. */
  notMembers: NotMemberRow[];
}

function cellAt(row: readonly unknown[], col: number | null): unknown {
  return col === null ? undefined : row[col];
}

// ---------------------------------------------------------------- extra details (#47)

/**
 * A column that fits no field, kept as the gym's own detail on each member ("Locker No."). The
 * owner ticks it (`on`) and may rename it; `ai` = the AI suggested it.
 */
export interface ExtraColumn {
  col: number;
  label: string;
  on: boolean;
  ai: boolean;
  /** #36: the AI said this column is not needed (shown unticked; the owner can tick it back). */
  aiIgnored?: boolean;
  /** #36: the column only counts rows (1, 2, 3…): shown unticked; the owner can tick it back. */
  rowNumbers?: boolean;
}

/**
 * Most extra details one import brings, and the longest value kept. #36 (24 Oct 2026, "keep every
 * extra column"): raised from 15; every column over it is NAMED on screen before the import
 * (`extrasOverCap`), and a value cut short says so on its row. The server refuses a record over
 * 20,000 bytes, so a member's details are also held under `MAX_EXTRA_BYTES`.
 */
export const MAX_EXTRAS = 40;
export const MAX_EXTRA_VALUE = 200;
export const MAX_EXTRA_LABEL = 40;
export const MAX_EXTRA_BYTES = 9000;

/** The ticked columns past MAX_EXTRAS: not brought in, and the screen names them. PURE. */
export function extrasOverCap(extras: readonly ExtraColumn[]): ExtraColumn[] {
  return extras.filter((e) => e.on && cleanExtraLabel(e.label)).slice(MAX_EXTRAS);
}

/** Headers that only number the rows ("Sr. No.", "S.No", "#"). */
const ROW_NUMBER_HEADERS = new Set(['sr', 'sr no', 'srno', 's no', 'sno', 'sl no', 'slno', 's n', 'serial', 'serial no', 'serial number', 'no', 'kr', 'kr sa', 'क्र', 'क्र सं', 'क्रम', 'क्रमांक']);

/**
 * #36: is this column just row numbers (1, 2, 3…), not a detail about the member? By its name
 * ("Sr. No.", "#") or, with no name, by numbers that run one after another. PURE.
 */
export function isRowNumberColumn(rows: readonly (readonly unknown[])[], headerRow: number, col: number): boolean {
  const rawHeader = cellText((rows[headerRow] ?? [])[col]);
  const h = normalizeHeader(rawHeader);
  if (ROW_NUMBER_HEADERS.has(h) || rawHeader === '#') return true;
  if (h) return false;
  const ns = rows
    .slice(headerRow + 1)
    .map((r) => cellText(r[col]))
    .filter((t) => t !== '');
  if (ns.length < 2 || ns.some((t) => !/^\d{1,5}$/.test(t))) return false;
  const sorted = ns.map(Number).sort((a, b) => a - b);
  return sorted.every((n, i) => i === 0 || n === sorted[i - 1]! + 1);
}

/** A detail's name, tidied: one line, at most 40 letters. '' when nothing is left. PURE. */
export function cleanExtraLabel(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_EXTRA_LABEL).trim();
}

/** The ticked columns with a usable, distinct name ("Locker", "Locker 2"), at most MAX_EXTRAS. PURE. */
export function usableExtras(extras: readonly ExtraColumn[]): { col: number; label: string }[] {
  const seen = new Set<string>();
  const out: { col: number; label: string }[] = [];
  for (const e of extras) {
    if (!e.on || out.length >= MAX_EXTRAS) continue;
    const base = cleanExtraLabel(e.label);
    if (!base) continue;
    let label = base;
    for (let n = 2; seen.has(label.toLowerCase()); n += 1) label = `${base} ${n}`;
    seen.add(label.toLowerCase());
    out.push({ col: e.col, label });
  }
  return out;
}

export interface PlanOptions {
  /** #47: columns kept as extra details. */
  extras?: readonly ExtraColumn[];
  /**
   * #47: columns of Aadhaar / PAN numbers: never kept as an extra detail. Review of #47: the owner
   * may still point a box at one by hand; every value read is cut free of ID numbers anyway.
   */
  idCols?: readonly number[];
  /** #41: the gym has 2 or more branches: which branch each row goes to. Absent = this gym only. */
  branches?: BranchRouting;
}

// ---------------------------------------------------------------- branches (#41)

/** The owner's "Skip these rows" for a branch name in the file. */
export const SKIP_BRANCH = 'skip';

/**
 * #41 (24 Oct 2026): where each row goes in a gym with several branches. Either the sheet has a
 * Branch column (`map.branch`; names matched loosely by `match`, the owner answers for the rest),
 * or the whole sheet goes to `sheetGymId` (one sheet per branch).
 */
export interface BranchRouting {
  branches: readonly { gymId: string; name: string }[];
  currentGymId: string;
  /** No Branch column: every row of this sheet goes here. */
  sheetGymId: string | null;
  /** The loose matcher (branches/context.tsx `matchBranchName`): a gymId, or null. */
  match: (typed: string) => string | null;
  /** The owner's pick for a name in the file (by `branchKey`): a gymId, or SKIP_BRANCH. */
  answers: Readonly<Record<string, string>>;
  /** Every member (archived too) of each OTHER branch, once it is open. Absent = still opening. */
  rosters: Readonly<Record<string, readonly Member[]>>;
  /** Branches that could not be opened, with the reason in plain words. */
  failed: Readonly<Record<string, string>>;
}

/** A branch name as written, made comparable ("  Vaishali  NAGAR" -> "vaishali nagar"). PURE. */
export function branchKey(typed: string): string {
  return typed.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Where one branch name in the file goes: the owner's answer first, then the loose match. PURE. */
export function branchTarget(typed: string, routing: BranchRouting): string | null {
  const answer = routing.answers[branchKey(typed)];
  if (answer) return answer;
  return typed.trim() ? routing.match(typed) : null;
}

// ---------------------------------------------------------------- rows that are not members

/** A row left out because it is not a member (a totals row, a row with one stray cell). */
export interface NotMemberRow {
  rowNumber: number;
  why: 'total' | 'stray';
}

const TOTAL_WORDS = new Set([
  'total', 'totals', 'grand total', 'sub total', 'subtotal', 'net total', 'sum', 'total amount', 'total members',
  'kul yog', 'कुल', 'कुल योग',
]);

/**
 * #36: a totals row at the bottom ("Total", the sums) or a row with only one stray cell (a register
 * numbered down to row 100) is not a member: it is left out and listed, never a "row to check".
 * A row with a mobile is always a member row. PURE.
 */
export function notMemberReason(row: readonly unknown[], map: ColumnMap): NotMemberRow['why'] | null {
  const phoneText = cellText(cellAt(row, map.phone));
  if (phoneText && parseImportPhone(phoneText).ok) return null;
  const filled = row.map(cellText).filter((t) => t !== '');
  const firstWords = [cellText(cellAt(row, map.fullName)), ...filled.slice(0, 3)].map(normalizeHeader);
  if (firstWords.some((w) => TOTAL_WORDS.has(w))) return 'total';
  if (!cellText(cellAt(row, map.fullName)) && !phoneText && filled.length <= 1) return 'stray';
  return null;
}

/** Edits typed into "Rows to check": by sheet row index, then column. */
export type CellEdits = Readonly<Record<number, Readonly<Record<number, string>>>>;

/** The sheet with the owner's fixes typed in (only edited rows are copied). PURE. */
export function applyCellEdits<T>(rows: readonly (readonly T[])[], edits: CellEdits): (readonly (T | string)[])[] {
  const keys = Object.keys(edits);
  if (keys.length === 0) return rows as (readonly (T | string)[])[];
  const out: (readonly (T | string)[])[] = [...rows];
  for (const k of keys) {
    const i = Number(k);
    const fix = edits[i]!;
    const row: (T | string)[] = [...(rows[i] ?? [])];
    for (const [c, v] of Object.entries(fix)) {
      const col = Number(c);
      while (row.length <= col) row.push('');
      row[col] = v;
    }
    out[i] = row;
  }
  return out;
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
  options: PlanOptions = {},
): ImportPlan {
  const idCols = new Set(options.idCols ?? []);
  const fieldCols = new Set(IMPORT_FIELDS.map((f) => map[f]).filter((c): c is number => c !== null));
  const extraCols = usableExtras(options.extras ?? []).filter((e) => !idCols.has(e.col) && !fieldCols.has(e.col));
  const data: { row: readonly unknown[]; rowNumber: number }[] = [];
  const notMembers: NotMemberRow[] = [];
  for (let i = headerRow + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (isBlankRow(row)) continue;
    const why = notMemberReason(row, map);
    if (why) notMembers.push({ rowNumber: i + 1, why });
    else data.push({ row, rowNumber: i + 1 });
  }
  const leftOut = Math.max(0, data.length - MAX_IMPORT_ROWS);
  const taken = data.slice(0, MAX_IMPORT_ROWS);

  const colValues = (col: number | null) => (col === null ? [] : taken.map((d) => d.row[col]));
  // Admin audit C7-22 (16 Oct 2026): the order was decided per column, so a US-saved sheet whose
  // joining column proved month-first (12/25/2025) still read an expiry column of only ambiguous
  // dates (01/02/2026) day-first: 1 Feb instead of 2 Jan. A column that proves nothing now follows
  // the sheet: month-first when some column proves it and none proves day-first.
  const orders = [map.joinedOn, map.dateOfBirth, map.expiry, map.startDate, map.paidOn].map((c) => dateOrder(colValues(c)));
  const sheetDayFirst = !(orders.includes('month') && !orders.includes('day'));
  const dayFirstOf = (col: number | null) => {
    const o = dateOrder(colValues(col));
    return o === 'unknown' ? sheetDayFirst : o === 'day';
  };
  const joinDayFirst = dayFirstOf(map.joinedOn);
  const dobDayFirst = dayFirstOf(map.dateOfBirth);
  const expiryDayFirst = dayFirstOf(map.expiry);
  const startDayFirst = dayFirstOf(map.startDate);
  const paidDayFirst = dayFirstOf(map.paidOn);

  // #41: each branch has its own members (duplicates are checked against THAT branch) and batches.
  const routing = options.branches;
  const rosterOf = (gymId: string | undefined): readonly Member[] =>
    !routing || gymId === undefined || gymId === routing.currentGymId ? roster : routing.rosters[gymId] ?? [];
  const branchName = (gymId: string) => routing?.branches.find((b) => b.gymId === gymId)?.name ?? 'that branch';
  const batchesByBranch = new Map<string, string[]>();
  const batchNamesOf = (gymId: string | undefined) => {
    const key = gymId ?? '';
    let list = batchesByBranch.get(key);
    if (!list) {
      list = listBatches(rosterOf(gymId)).map((b) => b.name);
      batchesByBranch.set(key, list);
    }
    return list;
  };
  const seen = new Map<string, { row: number; name: string; cells: string }>();
  const out: ImportRow[] = [];

  for (const { row, rowNumber } of taken) {
    const problems: string[] = [];
    const warnings: string[] = [];
    // #41: the branch first. A name nobody matched waits for the owner's pick; a branch that can't
    // be opened (yet) keeps its rows back; "Skip these rows" leaves them out on purpose.
    let gymId: string | undefined;
    let branchWaiting = false;
    let needsBranch = false;
    if (routing) {
      if (map.branch === null) {
        gymId = routing.sheetGymId ?? routing.currentGymId;
      } else {
        const typed = cellText(row[map.branch]).replace(/\s+/g, ' ').trim();
        const target = branchTarget(typed, routing);
        if (target === SKIP_BRANCH) {
          out.push({
            rowNumber,
            cells: row.map(cellText),
            name: withoutTitle(normalizeName(cellText(cellAt(row, map.fullName)))),
            status: 'problem',
            draft: null,
            existing: null,
            sameAsRow: null,
            problems: [typed ? `Skipped: you chose “Skip these rows” for the branch “${typed}”.` : 'Skipped: you chose “Skip these rows” for rows with no branch.'],
            warnings: [],
            term: null,
            ownerSkipped: true,
          });
          continue;
        }
        if (target === null) {
          needsBranch = true;
          problems.push(
            typed
              ? `The branch “${typed}” is not one of your branches. Pick the branch for it under “Branches in your file”.`
              : 'No branch is written on this row. Pick the branch for it under “Branches in your file”.',
          );
        } else gymId = target;
      }
      if (gymId !== undefined && gymId !== routing.currentGymId) {
        if (routing.failed[gymId] !== undefined) {
          problems.push(`The branch “${branchName(gymId)}” could not be opened: ${routing.failed[gymId]}`);
          branchWaiting = true;
        } else if (!routing.rosters[gymId]) {
          problems.push(`The branch “${branchName(gymId)}” is still opening. Wait a moment.`);
          branchWaiting = true;
        }
      }
    }
    // #47: an Aadhaar or PAN number in any cell this row reads (a note, an address, a name, an extra
    // detail, a column picked by hand) is cut out, and the row says so.
    let idCut = false;
    const safe = (s: string) => {
      const r = scrubIds(s);
      if (r.removed) idCut = true;
      return r.text;
    };
    const text = (f: ImportField) => safe(cellText(cellAt(row, map[f])));

    // Name: a title in front is left out ("Mr. Ramesh Gupta" joins the app as "Ramesh", R-67).
    const written = normalizeName(text('fullName'));
    const fullName = withoutTitle(written);
    if (!fullName) problems.push('No name.');
    else if (fullName !== written) warnings.push(`"${written.slice(0, written.length - fullName.length).trim()}" left out of the name.`);

    // Mobile
    const phoneRead = parseImportPhone(cellAt(row, map.phone));
    if (!phoneRead.ok) {
      const shown = text('phone');
      problems.push(
        phoneRead.why === 'missing'
          ? 'No mobile number.'
          : phoneRead.why === 'shortened'
            ? `Mobile “${shown}” was shortened by Excel. Set that column to Text in Excel and save again.`
            : `Mobile “${shown}” is not a 10-digit number.`,
      );
    }

    // Joining date: blank = today (said once on screen when the column is missing, per row otherwise).
    let joinedOn = today;
    const joinRaw = cellAt(row, map.joinedOn);
    if (text('joinedOn')) {
      const d = parseSheetDate(joinRaw, today, joinDayFirst);
      if (!d) {
        problems.push(
          `Joining date “${text('joinedOn')}” is not a date we can read. Write it like 15/08/2026.`,
        );
      } else if (d < EARLIEST_DATE) {
        problems.push(`Joining date ${formatDay(d)} looks wrong. Check the year.`);
      } else if (d > addDays(today, JOIN_AHEAD_MAX_DAYS)) {
        // Nobody joins more than a year ahead: this is a typed year (2062) or digits misread.
        problems.push(
          `Joining date ${formatDay(d)} is more than a year away. Check the year.`,
        );
      } else {
        joinedOn = d;
        if (d > today) warnings.push(`Joining date ${formatDay(d)} is in the future.`);
      }
    } else if (map.joinedOn !== null) {
      warnings.push('No joining date. Today’s date is used.');
    }

    // Date of birth: optional, so a bad one is left out (and said), never a reason to skip someone.
    let dateOfBirth = '';
    if (text('dateOfBirth')) {
      const d = parseSheetDate(cellAt(row, map.dateOfBirth), today, dobDayFirst, true);
      if (!d) warnings.push(`Birthday “${text('dateOfBirth')}” can’t be read. Left blank.`);
      else if (d > today) warnings.push(`Birthday ${formatDay(d)} is in the future. Left blank.`);
      else dateOfBirth = d;
    }

    // Gender
    let gender = '';
    const g = parseGender(cellAt(row, map.gender));
    if (g === 'unknown') warnings.push(`Gender “${text('gender')}” can’t be read. Left blank.`);
    else if (g) gender = g;

    // Email
    let email = text('email');
    if (email && !EMAIL_RE.test(email)) {
      warnings.push(`Email “${email}” doesn’t look right. Left blank.`);
      email = '';
    }

    // Batch: the gym's own spelling when it already has this batch.
    const batchNames = batchNamesOf(gymId);
    let batch = resolveBatch(text('batch'), batchNames) ?? '';
    if (batch.length > BATCH_MAX) {
      warnings.push(`Batch name cut to ${BATCH_MAX} letters.`);
      batch = batch.slice(0, BATCH_MAX).trim();
    }
    if (batch && !batchNames.includes(batch)) batchNames.push(batch);

    // 15 Oct 2026 (data migration): the plan with its dates becomes a real membership, and what
    // was paid a real receipt (`termFromRow`). Only a plan the row cannot date stays in the notes.
    // C7-5: "Rs. 1,500/-" and the like are read; a fees cell that still can't be read is said.
    const money = (f: ImportField) => (text(f) ? parseImportMoney(text(f)) : null);
    for (const f of ['total', 'amount', 'due'] as const) {
      if (text(f) && money(f) === null) {
        warnings.push(
          `${fieldLabel(f)} “${text(f)}” is not an amount we can read. Left out.`,
        );
      }
    }
    const endsOn = text('expiry') ? parseSheetDate(cellAt(row, map.expiry), today, expiryDayFirst) : null;
    const startsOn = text('startDate') ? parseSheetDate(cellAt(row, map.startDate), today, startDayFirst) : null;
    // A payment date the receipt can carry: readable, not before records began, not in the future.
    let paidOn = text('paidOn') ? parseSheetDate(cellAt(row, map.paidOn), today, paidDayFirst) : null;
    if (text('paidOn') && (!paidOn || paidOn < EARLIEST_DATE || paidOn > today)) {
      warnings.push(`Payment date “${text('paidOn')}” can’t be read. The receipt uses the plan’s start date.`);
      paidOn = null;
    }
    // #36 review: a "Paid" yes / no column: yes = the plan's price was paid in full, no = nothing yet.
    let paidP = money('amount');
    if (map.paidFlag !== null && text('paidFlag')) {
      const flag = parsePaidFlag(cellAt(row, map.paidFlag));
      if (flag === true) paidP = money('total') ?? paidP;
      else if (flag === false) paidP = 0;
      else warnings.push(`Paid “${text('paidFlag')}” is not yes or no. Nothing is counted as paid for this row.`);
    }
    const term = termFromRow({
      planName: text('plan'),
      startsOn,
      endsOn,
      joinedOn: text('joinedOn') ? joinedOn : null,
      totalP: money('total'),
      paidP,
      dueP: money('due'),
      paidOn,
    });
    // No joining-date column: the plan's start is a better joining date than today.
    if (map.joinedOn === null && term && term.startsOn >= EARLIEST_DATE && term.startsOn <= today) joinedOn = term.startsOn;
    if (text('expiry') && !endsOn) {
      warnings.push(`Valid till “${text('expiry')}” can’t be read. No plan added.`);
    }
    // Admin audit C7-24 (16 Oct 2026): a plan with money on it that cannot be dated was dropped
    // without a word ("Will be added"), and its balance was recorded nowhere.
    const hasMoney = !!(text('total') || text('amount') || text('due'));
    if (!term && hasMoney && (text('plan') || text('startDate') || text('expiry'))) {
      const name = text('plan') || 'The plan';
      if (startsOn && endsOn && startsOn > endsOn) {
        warnings.push(
          `Plan not added. Its end date is before its start (${formatDay(startsOn)} → ${formatDay(endsOn)}). The fees are kept in the notes.`,
        );
      } else if (!endsOn && !text('expiry')) {
        warnings.push(
          `Plan “${name}” not added. There is no end date, and the plan name doesn’t say how long it is. The fees are kept in the notes.`,
        );
      } else if (endsOn) {
        warnings.push(
          `Plan “${name}” not added. There is no start date. The fees are kept in the notes.`,
        );
      }
    }
    const extras: string[] = [];
    if (!term) {
      if (text('plan')) extras.push(`Plan: ${text('plan')}`);
      const total = money('total');
      if (text('total')) extras.push(`Price: ${total !== null ? formatINR(total) : text('total')}`);
      const p = money('amount');
      if (text('amount')) extras.push(`Fees: ${p !== null ? formatINR(p) : text('amount')}`);
      const due = money('due');
      if (text('due')) extras.push(`Balance: ${due !== null ? formatINR(due) : text('due')}`);
      if (text('expiry')) extras.push(`Valid till: ${endsOn ? formatDay(endsOn) : text('expiry')}`);
    }
    if (phoneRead.ok && phoneRead.extra) extras.push(`Other number: ${phoneRead.extra}`);
    const notes = safe(
      [text('notes'), extras.length ? `From Excel — ${extras.join(' · ')}` : '']
        .filter(Boolean)
        .join('\n'),
    );
    const address = text('address');
    const extra: Record<string, string> = {};
    const cut: string[] = [];
    let extraBytes = 2;
    for (const e of extraCols) {
      const v = safe(cellText(row[e.col]).replace(/\s+/g, ' ').trim());
      if (!v) continue;
      // #36: a value cut short, or left out to keep the member's record under the server's size,
      // is said on the row (it used to be cut without a word).
      const kept = v.length > MAX_EXTRA_VALUE ? `${v.slice(0, MAX_EXTRA_VALUE - 1)}…` : v;
      const bytes = utf8Length(JSON.stringify(e.label)) + utf8Length(JSON.stringify(kept)) + 2;
      if (extraBytes + bytes > MAX_EXTRA_BYTES) {
        warnings.push(`“${e.label}” is not kept for this member. This member has too many long details.`);
        continue;
      }
      if (kept !== v) cut.push(e.label);
      extraBytes += bytes;
      extra[e.label] = kept;
    }
    if (cut.length > 0) warnings.push(`${cut.map((l) => `“${l}”`).join(', ')} cut to ${MAX_EXTRA_VALUE} letters.`);
    if (idCut) warnings.push('An Aadhaar or PAN number was left out. ID numbers are never imported.');

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
          address,
          emergencyName: '',
          emergencyPhone: '',
          joinedOn,
          notes,
          batch,
        },
        today,
      );
      if (result.ok) {
        draft = { ...result.value, archived: false, photoUri: null };
        if (Object.keys(extra).length > 0) draft.extra = extra;
      } else problems.push(result.message);
    }

    const cells = row.map(cellText);
    const where = gymId === undefined ? {} : { gymId };
    if (!draft || problems.length > 0) {
      out.push({ rowNumber, cells, name: fullName, status: 'problem', draft: null, existing: null, sameAsRow: null, problems, warnings, term: null, ...where, ...(branchWaiting ? { branchWaiting } : {}), ...(needsBranch ? { needsBranch } : {}) });
      continue;
    }

    // #41: a mobile repeats only within one branch (the same person may train at two branches).
    const seenKey = `${gymId ?? ''}\u0001${draft.phone}`;
    const earlier = seen.get(seenKey);
    if (earlier !== undefined) {
      // Review (16 Oct 2026): a repeat is the SAME member (a payments list) only when the name
      // matches too. Two people on one family mobile must never share plans and money.
      const sameName = samePersonName(earlier.name, draft.fullName);
      if (!sameName) {
        warnings.push(`Row ${earlier.row} has this mobile with another name. This row is skipped.`);
      } else if (term && map.paidOn === null && earlier.cells === cells.join('\u0001')) {
        // Admin audit C7-20 (16 Oct 2026): with no payment date, two identical rows are counted as
        // two equal payments (instalments). Said on screen, so a copied row is deleted, not paid twice.
        warnings.push(
          `Exactly the same as row ${earlier.row}, so it counts as a second payment. If it is a copy, delete one row in Excel and import again.`,
        );
      }
      out.push({ rowNumber, cells, name: fullName, status: 'duplicate', draft, existing: null, sameAsRow: earlier.row, problems, warnings, term: sameName ? term : null, ...where });
      continue;
    }
    seen.set(seenKey, { row: rowNumber, name: draft.fullName, cells: cells.join('\u0001') });
    const existing = findDuplicatePhone(rosterOf(gymId), draft.phone);
    // C7-3: a member already in the gym on this mobile with ANOTHER name is someone else (a family
    // shares a number). Their plan and money are never put on that member.
    let rowTerm = term;
    if (existing && !samePersonName(existing.fullName, draft.fullName)) {
      rowTerm = null;
      if (term) {
        warnings.push(
          `${existing.fullName} is already in the gym with this mobile. The name is different, so this row’s plan and fees are not added.`,
        );
      }
    }
    out.push({ rowNumber, cells, name: fullName, status: existing ? 'duplicate' : 'add', draft, existing, sameAsRow: null, problems, warnings, term: rowTerm, ...where });
  }

  // Admin audit C7-38 (16 Oct 2026): with no joining-date column, a member joins on their EARLIEST
  // plan start across all their rows. A payments list sorted newest first gave a yearly member of
  // 2025 the joining date of this year's renewal.
  if (map.joinedOn === null) {
    const firstRow = new Map<number, ImportRow>();
    for (const r of out) if (r.draft && r.sameAsRow === null) firstRow.set(r.rowNumber, r);
    for (const r of out) {
      const head = r.sameAsRow !== null ? firstRow.get(r.sameAsRow) : r.sameAsRow === null ? r : undefined;
      const start = r.term?.startsOn;
      if (!head?.draft || !start || start < EARLIEST_DATE || start > today) continue;
      if (start < head.draft.joinedOn) head.draft = { ...head.draft, joinedOn: start };
    }
  }

  const counts = { add: 0, duplicate: 0, problem: 0 };
  for (const r of out) counts[r.status] += 1;
  return { rows: out, counts, leftOut, notMembers };
}

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Admin audit C7-18 / C7-37 (16 Oct 2026): this row's plan and payment are saved even though the
 * member is not new — a repeat row (payments list) or a member already in the gym — which only the
 * owner does. Such a row is not "skipped". PURE.
 */
export function rowBringsTerm(row: ImportRow, role: 'owner' | 'staff'): boolean {
  return role === 'owner' && row.status === 'duplicate' && row.term !== null && row.draft !== null;
}

/** What the import button does, and whether it can (C7-18). PURE. */
export function importAction(
  rows: readonly ImportRow[],
  dupMode: 'skip' | 'fill',
  role: 'owner' | 'staff',
): { adds: number; fills: number; terms: number; label: string; enabled: boolean } {
  const adds = rows.filter((r) => r.status === 'add').length;
  const fills = dupMode === 'fill' ? rows.filter((r) => r.existing !== null && r.sameAsRow === null).length : 0;
  const terms = rows.filter((r) => rowBringsTerm(r, role)).length;
  const label =
    adds === 0 && fills === 0 && terms > 0
      ? terms === 1
        ? 'Add 1 plan and payment'
        : `Add ${terms} plans and payments`
      : fills > 0 && adds === 0
        ? `Update ${fills} members`
        : fills > 0
          ? `Add ${adds} members, update ${fills}`
          : adds === 1
            ? 'Add 1 member'
            : `Add ${adds} members`;
  return { adds, fills, terms, label, enabled: adds + fills + terms > 0 };
}

/**
 * The "Plans and payments" preview (C7-37): members with a plan, the plan names, and the money
 * already paid on EVERY row (a payments list repeats a member once per payment). PURE.
 */
export function termsPreview(rows: readonly ImportRow[]): { members: number; names: number; paidP: number } {
  const withTerm = rows.filter((r) => r.term && r.status !== 'problem');
  const firsts = withTerm.filter((r) => r.sameAsRow === null);
  return {
    members: firsts.length,
    names: new Set(firsts.map((r) => r.term!.planName.toLowerCase())).size,
    paidP: withTerm.reduce((sum, r) => sum + (r.term?.paidP ?? 0), 0),
  };
}

/** One plain line: what happens to this row. */
export function rowVerdict(row: ImportRow): string {
  if (row.status === 'add') return 'Will be added';
  // #36: a problem row can be fixed on the screen now ("Rows to check"), so it is not "skipped" yet.
  if (row.status === 'problem') return row.ownerSkipped ? 'Skipped' : 'Not added yet. See “Rows to check”';
  if (row.sameAsRow !== null) {
    // 16 Oct 2026: a payments list repeats the member; the row's plan and payment still count.
    if (row.term) {
      return `Same member as row ${row.sameAsRow}. This plan and payment are added to them`;
    }
    return `Same mobile as row ${row.sameAsRow} — skipped`;
  }
  const who = row.existing?.fullName ?? '';
  return row.existing?.archived
    ? `Already a member (${who}, archived)`
    : `Already a member (${who})`;
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
  // #47: extra details the member does not have yet; ones already there stay as they are.
  const had = existing.extra ?? {};
  const fresh = Object.entries(draft.extra ?? {}).filter(([k, v]) => v && blank(had[k]));
  if (fresh.length > 0) patch.extra = { ...had, ...Object.fromEntries(fresh) };
  return patch;
}

// ---------------------------------------------------------------- files out

/** Column names for the sample file (Hinglish and Hindi names are recognised too on the way in). */
export function templateHeaders(): string[] {
  return [
    'Name',
    'Mobile',
    'Joining date',
    'Gender',
    'Date of birth',
    'Address',
    'Batch',
    'Plan',
    'Fees',
    'Valid till',
    'Notes',
  ];
}

/**
 * The sample file: column names only, so nothing made-up gets imported by mistake.
 */
export function templateCsv(): string {
  return csvDocument(templateHeaders(), []);
}

/**
 * The rows that were not added, with the reason first, to fix and import again.
 */
export function skippedRowsCsv(
  headers: readonly string[],
  skipped: readonly { row: ImportRow; reason: string }[],
): string {
  const width = Math.max(headers.length, ...skipped.map((s) => s.row.cells.length));
  const head = ['Row', 'Why skipped', ...Array.from({ length: width }, (_, i) => headers[i] || columnLetter(i))];
  const body = skipped.map(({ row, reason }) => [
    row.rowNumber,
    reason,
    ...Array.from({ length: width }, (_, i) => row.cells[i] ?? ''),
  ]);
  return csvDocument(head, body);
}

/** Why a row was skipped, in one line, for the skipped-rows file. */
export function skipReason(row: ImportRow): string {
  if (row.status === 'problem') return row.problems.join(' ');
  return rowVerdict(row);
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
  /**
   * #36 "never stop halfway": after a batch fails, go on with the NEXT batches (their own saves);
   * only the failed batch's unsaved rows wait. `stopped` is the first failure's words.
   */
  keepGoing = false,
): Promise<BatchSaveOutcome> {
  const work = rows.filter((r) => r.draft !== null);
  const added: ImportRow[] = [];
  const duplicates: ImportRow[] = [];
  const notSaved: ImportRow[] = [];
  let stopped: string | null = null;
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
        const words = e instanceof Error && e.message ? e.message : 'Saving stopped.';
        if (!keepGoing) {
          return {
            added,
            duplicates,
            notSaved: [...batch.filter((r) => !savedHere.includes(r)), ...work.slice(start + size)],
            stopped: words,
          };
        }
        console.warn('[ForgeErr] import members: one batch not saved, going on with the next', e);
        notSaved.push(...batch.filter((r) => !savedHere.includes(r)));
        stopped ??= words;
        break;
      }
    }
    onProgress(Math.min(work.length, start + size));
  }
  return { added, duplicates, notSaved, stopped };
}
