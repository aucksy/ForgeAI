/**
 * AI column matching for the member import (Project Tracker #47 + owner R-82, 23 Oct 2026; made
 * automatic by owner R-157, 28 Oct 2026: "I do not want manual ask AI button. It should just use AI
 * to identify the values and match with right fields automatically"). PURE.
 *
 * Our own word lists and value checks (importMembers.ts) place the columns first, free and tested.
 * Then, for the owner of an online gym, the sheet goes to the AI once, by itself: the column names,
 * up to 5 example rows with mobile numbers, emails and ID numbers hidden (their length and shape
 * kept: "98XXXXXX45"), names and addresses shown only as "[name]" / "[address]" (#59) (masked here,
 * and again by the server), and per column a few counts our code works out (columnStats: how many
 * cells are valid mobiles, dates, amounts, emails, empty), so it decides from the VALUES. It answers
 * only "column C is the expiry date / a new detail: Locker No. / not needed", with how sure it is.
 * Its answer is checked strictly against our field list. A sure answer (>= AI_SURE) is applied, and
 * may change a column our rules picked when the counts back it (applyAiPicks). Our code then reads
 * every date, mobile and rupee amount as before.
 *
 * The server half is deploy/panel/aiMatch.js (maskCell there is the same rule as here).
 */

import {
  cellText,
  columnLetter,
  fieldLabel,
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  normalizeHeader,
  parseImportMoney,
  parseImportPhone,
  type ColumnMap,
  type ExtraColumn,
  type ImportField,
} from './importMembers';
import { idColumnKind, isIdHeader, type IdKind } from './importIds';

export const AI_EXAMPLE_ROWS = 5;
export const AI_MAX_COLUMNS = 60;
const MAX_CELL = 60;
/** An AI guess at least this sure is filled in (marked "AI"); a less sure one is only shown. */
export const AI_SURE = 0.6;

// ---------------------------------------------------------------- hiding private details

const EMAIL = /[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+/g;
const PAN = /\b[A-Za-z]{5}\d{4}[A-Za-z]\b/g;
/**
 * A run of digits in ANY script (Devanagari ९८७६…, too) with spaces, dashes, dots, slashes or
 * brackets between them: "98765/43210" and "9876.54.3210" are one run (review of #47).
 */
const DIGIT_RUN = /\+?\p{Nd}(?:[\p{Nd}\s\-()./]*\p{Nd})?/gu;
const ONE_DIGIT = /\p{Nd}/u;
const DATE_SHAPE = /^(\p{Nd}{1,4})[-./](\p{Nd}{1,2})[-./](\p{Nd}{1,4})$/u;
/** The zero of each common digit script (ASCII, Arabic-Indic, Devanagari, Bengali … full-width). */
const DIGIT_ZEROS = [0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xde6, 0xe50, 0xed0, 0x1040, 0xff10];

/** "२०२६" -> 2026; null when a character is no digit we know. PURE. */
function digitsValue(text: string): number | null {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const zero = DIGIT_ZEROS.find((z) => cp >= z && cp <= z + 9);
    if (zero === undefined) return null;
    n = n * 10 + (cp - zero);
  }
  return n;
}

/** Is this a real calendar day written d/m/y, m/d/y or y-m-d (two- or four-digit year)? PURE. */
export function isRealDate(text: string): boolean {
  const m = DATE_SHAPE.exec(text.trim());
  if (!m) return false;
  const [a, b, c] = [m[1]!, m[2]!, m[3]!].map(digitsValue);
  if (a === null || b === null || c === null) return false;
  const ok = (y: number, mo: number, d: number) =>
    y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (m[1]!.length === 4) return m[3]!.length <= 2 && ok(a, b, c);
  if (m[1]!.length > 2 || (m[3]!.length !== 2 && m[3]!.length !== 4)) return false;
  const y = m[3]!.length === 2 ? 2000 + c : c;
  return ok(y, b, a) || ok(y, a, b);
}

/**
 * One cell made safe to show an AI: emails -> [email], PAN -> [PAN], any run of 7+ digits (a
 * mobile, an Aadhaar), in any script and with any separators -> its first 2 and last 2 digits with X
 * between ("98XXXXXX45"). A run kept as it is only when it is real dates ("15/08/2026",
 * "01-08-2026 - 31-10-2026"). Cut to 60 letters. PURE. The same rule as maskCell in
 * deploy/panel/aiMatch.js.
 */
export function maskCell(value: unknown): string {
  let s = cellText(value).replace(/\s+/g, ' ').trim();
  s = s.replace(EMAIL, '[email]');
  s = s.replace(PAN, '[PAN]');
  s = s.replace(DIGIT_RUN, (run) => {
    const digits = [...run].filter((ch) => ONE_DIGIT.test(ch));
    if (digits.length < 7) return run;
    const parts = run.trim().split(/\s+[-–]\s+|\s+/).filter(Boolean);
    if (parts.length > 0 && parts.every(isRealDate)) return run;
    return `${digits.slice(0, 2).join('')}${'X'.repeat(digits.length - 4)}${digits.slice(-2).join('')}`;
  });
  return s.length > MAX_CELL ? `${s.slice(0, MAX_CELL - 1)}…` : s;
}

// ---------------------------------------------------------------- names and addresses

/*
 * Owner, 24 Oct 2026 (tracker #59): "hide names and addresses from the AI import too". The AI needs
 * only the SHAPE of such a column, so a column that holds people's names or addresses is sent as
 * "[name]" / "[address]" for each filled cell (an empty cell stays empty). Decided here, per column:
 *  1. a header with a word that is never about a person (plan, package, batch, time, trainer,
 *     status, gender, branch, date, id, no …) keeps its examples (matching needs them);
 *  2. a header with an address word (address, pata, पता, area, locality …) -> addresses;
 *  3. a header with a name word (name, naam, नाम, member, customer, ref by …) -> names, unless most
 *     cells are dates or numbers;
 *  4. otherwise by the cells: most of them like an address (road, nagar, sector …, or a comma between
 *     3+ words) -> addresses; most of them 2-4 words of letters, no digits, none a plan / status /
 *     batch word -> names. Then the header too is hidden when it looks like one more name or
 *     address (a file with no header row sends its first member as the "header").
 * The same rule as hidePeople in deploy/panel/aiMatch.js, which applies it again to whatever the
 * browser sends. PURE.
 */

export type PeopleKind = 'name' | 'address';
export const PEOPLE_SHAPE: Readonly<Record<PeopleKind, string>> = { name: '[name]', address: '[address]' };

const KEEP_HEADER_WORDS = [
  'plan', 'plans', 'package', 'packages', 'pack', 'scheme', 'membership', 'subscription', 'batch', 'slot', 'shift',
  'timing', 'timings', 'time', 'trainer', 'coach', 'instructor', 'status', 'gender', 'sex', 'branch', 'centre',
  'center', 'outlet', 'gym', 'type', 'category', 'id', 'uid', 'code', 'no', 'number', 'sr', 'serial', 'roll',
  'receipt', 'mode', 'method', 'since', 'date', 'joined', 'joining', 'from', 'till', 'expiry', 'amount', 'fees',
  'fee', 'प्लान', 'पैकेज', 'बैच', 'लिंग', 'तारीख',
];
const ADDRESS_HEADER_WORDS = ['address', 'addr', 'pata', 'पता', 'area', 'locality', 'location', 'residence', 'colony', 'street', 'mohalla', 'house'];
const NAME_HEADER_WORDS = [
  'name', 'names', 'naam', 'नाम', 'member', 'members', 'customer', 'customers', 'client', 'clients', 'sadasya',
  'सदस्य', 'person', 'ref by', 'referred', 'reference', 'father', 'mother', 'husband', 'wife', 'guardian', 'nominee',
];
/** Header words that show a row really is a header (so a cell-judged column keeps it). */
const HEADER_HINT_WORDS = [
  'by', 'of', 'ref', 'refer', 'contact', 'emergency', 'remarks', 'remark', 'notes', 'note', 'comment', 'comments',
  'goal', 'occupation', 'profession', 'company', 'office', 'school', 'college', 'blood', 'group', 'locker', 'weight',
  'height', 'other', 'details', 'detail', 'info', 'extra', 'city', 'state',
];
/** Words in a cell that make it a plan, a status, a batch, a payment: never a person's name. */
const NOT_NAME_WORDS = new Set([
  'month', 'months', 'monthly', 'mth', 'mths', 'quarter', 'quarterly', 'half', 'year', 'years', 'yearly', 'yr', 'yrs',
  'annual', 'annually', 'week', 'weeks', 'weekly', 'day', 'days', 'daily', 'plan', 'package', 'pack', 'membership',
  'gold', 'silver', 'platinum', 'diamond', 'bronze', 'basic', 'premium', 'standard', 'elite', 'pro', 'plus', 'super',
  'combo', 'couple', 'family', 'student', 'students', 'corporate', 'senior', 'ladies', 'gents', 'men', 'women',
  'male', 'female', 'boys', 'girls', 'kids', 'morning', 'evening', 'afternoon', 'night', 'noon', 'batch', 'slot',
  'shift', 'am', 'pm', 'yes', 'no', 'paid', 'unpaid', 'pending', 'partial', 'full', 'fully', 'due', 'cash', 'upi',
  'online', 'card', 'cheque', 'gpay', 'paytm', 'phonepe', 'bank', 'transfer', 'active', 'inactive', 'expired',
  'expiring', 'left', 'frozen', 'freeze', 'hold', 'new', 'old', 'renewal', 'renewed', 'renew', 'joined', 'regular',
  'general', 'special', 'offer', 'trial', 'free', 'walk', 'not', 'done', 'open', 'closed', 'cardio', 'strength',
  'weight', 'weights', 'training', 'personal', 'pt', 'crossfit', 'zumba', 'yoga', 'aerobics', 'functional', 'gym',
  'fitness', 'steam', 'sauna', 'spa', 'swimming', 'pool', 'diet', 'loss', 'gain', 'muscle', 'fat', 'toning',
  'पुरुष', 'महिला', 'हाँ', 'हां', 'नहीं', 'मासिक', 'सालाना', 'सुबह', 'शाम', 'जमा', 'बाकी',
]);
/** Words that make a cell an address. */
const ADDRESS_WORDS = new Set([
  'road', 'rd', 'marg', 'nagar', 'colony', 'sector', 'street', 'lane', 'gali', 'mohalla', 'vihar', 'enclave',
  'apartment', 'apartments', 'apt', 'society', 'flat', 'house', 'plot', 'near', 'opp', 'opposite', 'behind',
  'chowk', 'bazaar', 'bazar', 'market', 'block', 'phase', 'layout', 'extension', 'tower', 'residency', 'ganj',
  'wadi', 'basti', 'kunj', 'sadan', 'bhawan', 'bhavan', 'niwas', 'nivas',
  'नगर', 'कॉलोनी', 'मार्ग', 'गली', 'रोड', 'सेक्टर', 'मोहल्ला', 'फ्लैट', 'मकान',
]);
const PLACEHOLDER = /^\[(name|address|email|PAN|ID number)\]$/;
const NAME_WORD = /^[\p{L}\p{M}][\p{L}\p{M}.'’-]*$/u;

/** Lower case, every run of punctuation one space (the same as normalizeHeader). PURE. */
function plainWords(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

function hasWord(text: string, words: readonly string[]): boolean {
  const padded = ` ${plainWords(text)} `;
  return words.some((w) => padded.includes(` ${w} `));
}

/** Dates or numbers only (an Excel day number, an amount, a masked mobile): never a name. PURE. */
function numberish(cell: string): boolean {
  return isRealDate(cell) || !/\p{L}/u.test(cell.replace(/X/g, '').replace(/\b(rs|inr)\b/gi, ''));
}

/** "12, MG Road" / "Near Bus Stand, Sector 4": an address. PURE. */
export function looksLikeAddress(cell: string): boolean {
  if (PLACEHOLDER.test(cell) || numberish(cell)) return false;
  const words = plainWords(cell).split(' ').filter(Boolean);
  if (words.some((w) => ADDRESS_WORDS.has(w))) return true;
  const letterWords = words.filter((w) => w.length >= 2 && !/\p{N}/u.test(w));
  return cell.includes(',') && letterWords.length >= 3 && !letterWords.every((w) => NOT_NAME_WORDS.has(w));
}

/** "Ramesh Gupta" / "R. K. Sharma" / "राहुल शर्मा": 2-4 words of letters, no plan or status word. PURE. */
export function looksLikeName(cell: string): boolean {
  if (PLACEHOLDER.test(cell)) return false;
  const words = cell.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  if (!words.every((w) => NAME_WORD.test(w))) return false;
  if (words.some((w) => NOT_NAME_WORDS.has(plainWords(w)))) return false;
  return !looksLikeAddress(cell);
}

/**
 * Does this column hold names or addresses? `fromHeader`: its header said so (the header then
 * stays, it is a real header). Works on cells already through maskCell. PURE.
 */
export function peopleColumnKind(header: string, cells: readonly string[]): { kind: PeopleKind; fromHeader: boolean } | null {
  const filled = cells.map((c) => c.trim()).filter((c) => c !== '' && !PLACEHOLDER.test(c));
  if (hasWord(header, KEEP_HEADER_WORDS)) return null;
  if (hasWord(header, ADDRESS_HEADER_WORDS)) return { kind: 'address', fromHeader: true };
  if (hasWord(header, NAME_HEADER_WORDS)) {
    const numbers = filled.filter(numberish).length;
    return filled.length > 0 && numbers * 2 > filled.length ? null : { kind: 'name', fromHeader: true };
  }
  if (filled.length === 0) return null;
  const addresses = filled.filter(looksLikeAddress).length;
  const names = filled.filter(looksLikeName).length;
  if (addresses * 2 > filled.length) return { kind: 'address', fromHeader: false };
  if (names * 2 > filled.length) return { kind: 'name', fromHeader: false };
  if ((addresses + names) * 2 > filled.length) return { kind: addresses > names ? 'address' : 'name', fromHeader: false };
  return null;
}

/**
 * One column as the AI may see it: a names or addresses column becomes its shape ("[name]" per
 * filled cell). `placed`: our own rules already put this column in the name or address box. The
 * header and examples must already be through maskCell. PURE. The same rule as hidePeople in
 * deploy/panel/aiMatch.js.
 */
export function hidePeople(header: string, examples: readonly string[], placed: PeopleKind | null = null): { header: string; examples: string[] } {
  const found = peopleColumnKind(header, examples) ?? (placed ? { kind: placed, fromHeader: false } : null);
  if (!found) return { header, examples: [...examples] };
  const shape = PEOPLE_SHAPE[found.kind];
  const looksSame = found.kind === 'name' ? looksLikeName(header) : looksLikeAddress(header);
  const hideHeader = !found.fromHeader && header.trim() !== '' && looksSame && !hasWord(header, HEADER_HINT_WORDS);
  return {
    header: hideHeader ? shape : header,
    examples: examples.map((e) => (e.trim() === '' || PLACEHOLDER.test(e.trim()) ? e : shape)),
  };
}

// ---------------------------------------------------------------- the columns of a sheet

function isBlank(row: readonly unknown[]): boolean {
  return row.every((c) => cellText(c) === '');
}

/** The data rows under the header (blank rows skipped), the first `n`. */
function dataRows(rows: readonly (readonly unknown[])[], headerRow: number, n: number): (readonly unknown[])[] {
  const out: (readonly unknown[])[] = [];
  for (let i = headerRow + 1; i < rows.length && out.length < n; i += 1) {
    const r = rows[i] ?? [];
    if (!isBlank(r)) out.push(r);
  }
  return out;
}

export interface IdColumn {
  col: number;
  kind: IdKind;
}

/**
 * Columns whose CELLS are mostly Aadhaar or PAN numbers. Not guessed into any box and not sent to
 * the AI; the owner can still pick one by hand, and the ID numbers are cut out of it. PURE.
 */
export function findIdColumns(rows: readonly (readonly unknown[])[], headerRow: number, width: number): IdColumn[] {
  const body = dataRows(rows, headerRow, 60);
  const out: IdColumn[] = [];
  for (let c = 0; c < width; c += 1) {
    const kind = idColumnKind(body.map((r) => cellText(r[c])));
    if (kind) out.push({ col: c, kind });
  }
  return out;
}

/**
 * Review of #47: columns only NAMED like ID columns ("Name as per Aadhaar", "Member UID") whose
 * cells are not ID numbers. They import normally; the screen only says that any ID number in them
 * is cut out. PURE.
 */
export function idNamedColumns(rows: readonly (readonly unknown[])[], headerRow: number, width: number, idCols: readonly number[]): number[] {
  const header = rows[headerRow] ?? [];
  const out: number[] = [];
  for (let c = 0; c < width; c += 1) if (!idCols.includes(c) && isIdHeader(normalizeHeader(header[c]))) out.push(c);
  return out;
}

/** "Column G “Aadhaar No.”" for the screen. PURE. */
export function columnName(headers: readonly string[], col: number): string {
  const h = (headers[col] ?? '').trim();
  return h ? `Column ${columnLetter(col)} “${h.slice(0, 40)}”` : `Column ${columnLetter(col)}`;
}

/** Columns no field uses, that are not ID numbers and have something in them. PURE. */
export function freeColumns(rows: readonly (readonly unknown[])[], headerRow: number, width: number, map: ColumnMap, idCols: readonly number[]): number[] {
  const used = new Set<number>([...IMPORT_FIELDS.map((f) => map[f]).filter((c): c is number => c !== null), ...idCols]);
  // #36: every row is looked at (it was the first 200): a column filled in only further down is
  // still a column to keep.
  const body = dataRows(rows, headerRow, MAX_IMPORT_ROWS);
  const out: number[] = [];
  for (let c = 0; c < width; c += 1) {
    if (used.has(c)) continue;
    if (body.some((r) => cellText(r[c]) !== '')) out.push(c);
  }
  return out;
}

/** A few values of a column, for "e.g. 12, 14, B-3" on screen (shown to the owner, not the AI). PURE. */
export function columnSamples(rows: readonly (readonly unknown[])[], headerRow: number, col: number, n = 3): string[] {
  const seen = new Set<string>();
  for (const r of dataRows(rows, headerRow, 200)) {
    const v = cellText(r[col]).replace(/\s+/g, ' ').trim();
    if (v && !seen.has(v)) seen.add(v);
    if (seen.size >= n) break;
  }
  return [...seen].map((v) => (v.length > 24 ? `${v.slice(0, 23)}…` : v));
}

// ---------------------------------------------------------------- what is sent

/**
 * R-157: what our own code sees in a column, as whole percentages of the data rows looked at (the
 * first STATS_ROWS): filled, valid Indian mobiles, dates, rupee amounts, emails. Counts only, never
 * a value: safe to send, and the AI decides from them rather than from the header.
 */
export interface ColumnStats {
  filled: number;
  mobile: number;
  date: number;
  amount: number;
  email: number;
}
export const STATS_ROWS = 200;
const STAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

function looksLikeDate(v: unknown): boolean {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v === 'number') return v >= 20000 && v <= 60000;
  const t = cellText(v).trim();
  return isRealDate(t) || ISO_DAY.test(t);
}

function looksLikeAmount(v: unknown): boolean {
  if (parseImportPhone(v).ok) return false;
  const p = parseImportMoney(cellText(v));
  return p !== null && p >= 100_00 && p <= 5_00_000_00;
}

/** One column's counts (see ColumnStats). PURE. */
export function columnStats(rows: readonly (readonly unknown[])[], headerRow: number, col: number): ColumnStats {
  const body = dataRows(rows, headerRow, STATS_ROWS);
  if (body.length === 0) return { filled: 0, mobile: 0, date: 0, amount: 0, email: 0 };
  const cells = body.map((r) => r[col]).filter((v) => cellText(v) !== '');
  const pct = (test: (v: unknown) => boolean) => Math.round((cells.filter(test).length * 100) / body.length);
  return {
    filled: Math.round((cells.length * 100) / body.length),
    mobile: pct((v) => parseImportPhone(v).ok),
    date: pct(looksLikeDate),
    amount: pct(looksLikeAmount),
    email: pct((v) => STAT_EMAIL.test(cellText(v).trim())),
  };
}

/** Every column's counts, for the AI and for checking its answer. PURE. */
export function sheetStats(rows: readonly (readonly unknown[])[], headerRow: number, width: number): ColumnStats[] {
  return Array.from({ length: width }, (_, c) => columnStats(rows, headerRow, c));
}

export interface AiColumn {
  header: string;
  examples: string[];
  stats?: ColumnStats;
}

/**
 * What the AI is shown: every column's name, its cells in the first 5 data rows, masked, and its
 * counts (columnStats; an ID column only how full it is). An
 * ID-number column shows only that it is one; a names or addresses column only "[name]" /
 * "[address]" (hidePeople; `placed` = the columns our own rules already put in the name and
 * address boxes, hidden too whatever they look like). PURE.
 */
export function aiColumnsPayload(
  rows: readonly (readonly unknown[])[],
  headerRow: number,
  width: number,
  idCols: readonly number[],
  placed: { fullName?: number | null; address?: number | null } = {},
): AiColumn[] {
  const header = rows[headerRow] ?? [];
  const sample = dataRows(rows, headerRow, AI_EXAMPLE_ROWS);
  const ids = new Set(idCols);
  return Array.from({ length: Math.min(width, AI_MAX_COLUMNS) }, (_, c) => {
    const head = maskCell(header[c]);
    const stats = columnStats(rows, headerRow, c);
    if (ids.has(c)) {
      const examples = sample.map((r) => (cellText(r[c]) ? '[ID number]' : ''));
      return { header: head, examples, stats: { filled: stats.filled, mobile: 0, date: 0, amount: 0, email: 0 } };
    }
    const kind: PeopleKind | null = placed.fullName === c ? 'name' : placed.address === c ? 'address' : null;
    return { ...hidePeople(head, sample.map((r) => maskCell(r[c])), kind), stats };
  });
}

// ---------------------------------------------------------------- what comes back

export type AiTarget = { field: ImportField } | { extra: string } | { ignore: true };

export interface AiPick {
  column: number;
  target: AiTarget;
  confidence: number;
}

const LABEL_OK = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'&/()#+-]*$/u;

/**
 * The server's answer, checked again here (the server already checked it; this screen trusts
 * nothing it did not check itself). Unknown fields, bad labels, unknown columns and confidences
 * outside 0..1 are dropped. PURE.
 */
export function parseAiPicks(raw: unknown, width: number): AiPick[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { columns?: unknown }).columns)) return [];
  const out: AiPick[] = [];
  const seen = new Set<number>();
  for (const item of (raw as { columns: unknown[] }).columns) {
    if (!item || typeof item !== 'object') continue;
    const { column, target, confidence } = item as { column?: unknown; target?: unknown; confidence?: unknown };
    if (typeof column !== 'number' || !Number.isInteger(column) || column < 0 || column >= width || seen.has(column)) continue;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) continue;
    if (typeof target !== 'string') continue;
    let t: AiTarget | null = null;
    if (target === 'ignore') t = { ignore: true };
    else if ((IMPORT_FIELDS as readonly string[]).includes(target)) t = { field: target as ImportField };
    else if (target.startsWith('extra:')) {
      const label = target.slice(6).replace(/\s+/g, ' ').trim();
      if (label && label.length <= 40 && LABEL_OK.test(label)) t = { extra: label };
    }
    if (!t) continue;
    seen.add(column);
    out.push({ column, target: t, confidence });
  }
  return out;
}

export interface AiApplied {
  map: ColumnMap;
  /** Fields the AI set (shown "Matched by AI" until the owner changes them). */
  aiFields: ImportField[];
  /** Extra-detail suggestions by column. */
  extras: Record<number, Pick<ExtraColumn, 'label' | 'on' | 'ai' | 'aiIgnored'>>;
  /** Guesses not applied: the AI was not sure, or the counts did not back it. */
  held: string[];
}

const DATE_FIELDS: readonly ImportField[] = ['joinedOn', 'dateOfBirth', 'startDate', 'paidOn', 'expiry'];
const MONEY_FIELDS: readonly ImportField[] = ['total', 'amount', 'due'];
const NO_STATS: ColumnStats = { filled: 0, mobile: 0, date: 0, amount: 0, email: 0 };

/**
 * R-157: do our own counts back putting `field` on the AI's column instead of `ruleCol` (the
 * column our rules picked, or null)? Mobile: at least as many valid mobiles (so a "Phone" column of
 * landlines loses to a "Cell phone" column of mobiles, never the other way). Email: at least as many
 * emails. Dates and money: the AI's column is mostly dates / amounts. Anything else (name, plan,
 * batch …): the AI's column has something in it and is not mostly mobiles, dates or amounts. PURE.
 */
export function statsBack(field: ImportField, aiCol: number, ruleCol: number | null, stats: readonly (ColumnStats | undefined)[]): boolean {
  const ai = stats[aiCol] ?? NO_STATS;
  const rule = ruleCol === null ? NO_STATS : stats[ruleCol] ?? NO_STATS;
  if (field === 'phone') return ai.mobile > 0 && ai.mobile >= rule.mobile;
  if (field === 'email') return ai.email > 0 && ai.email >= rule.email;
  const half = Math.max(1, ai.filled / 2);
  if (DATE_FIELDS.includes(field)) return ai.date >= half;
  if (MONEY_FIELDS.includes(field)) return ai.amount >= half;
  return ai.filled > 0 && ai.mobile < half && ai.date < half && ai.amount < half;
}

/**
 * Apply the AI's answer, surest first. A sure pick (>= AI_SURE) fills an empty field, and (R-157)
 * also moves a field our rules placed when `stats` back it (statsBack); a field that loses its
 * column to the AI is emptied (a later pick may fill it). The AI never changes its own earlier pick,
 * a column our rules and the AI agree on, or anything in `keep` (fields the owner chose by hand),
 * and never touches an ID column. Without `stats`, the old rule: fill only what our rules left
 * empty. PURE.
 */
export function applyAiPicks(
  map: ColumnMap,
  picks: readonly AiPick[],
  idCols: readonly number[],
  headers: readonly string[],
  stats?: readonly (ColumnStats | undefined)[],
  keep: readonly ImportField[] = [],
): AiApplied {
  const out: ColumnMap = { ...map };
  const ids = new Set(idCols);
  const used = () => new Set(IMPORT_FIELDS.map((f) => out[f]).filter((c): c is number => c !== null));
  const fieldAt = (col: number): ImportField | null => IMPORT_FIELDS.find((f) => out[f] === col) ?? null;
  const locked = new Set<ImportField>(keep);
  const aiFields: ImportField[] = [];
  const extras: AiApplied['extras'] = {};
  const held: string[] = [];
  const sorted = [...picks].sort((a, b) => b.confidence - a.confidence);
  for (const p of sorted) {
    if (ids.has(p.column)) continue;
    const name = columnName(headers, p.column);
    if ('field' in p.target) {
      const field = p.target.field;
      if (out[field] === p.column) {
        locked.add(field); // our rules agree: it stays
        continue;
      }
      const holder = fieldAt(p.column);
      const free = out[field] === null && holder === null;
      const backed = stats !== undefined && statsBack(field, p.column, out[field], stats);
      const allowed = free
        ? stats === undefined || backed
        : backed && !locked.has(field) && (holder === null || !locked.has(holder));
      if (p.confidence >= AI_SURE && allowed) {
        if (holder !== null) out[holder] = null;
        out[field] = p.column;
        locked.add(field);
        aiFields.push(field);
      } else if (p.confidence >= 0.4) {
        held.push(`AI thinks ${name} is “${fieldLabel(field)}”${p.confidence < AI_SURE ? ' (not sure)' : ''}.`);
      }
    } else if ('extra' in p.target) {
      if (used().has(p.column)) continue;
      // #36: every column is kept unless the owner says no; a name the AI is unsure of is still
      // only a name (the owner can change it).
      extras[p.column] = { label: p.target.extra, on: true, ai: true };
    } else if (p.confidence >= AI_SURE) {
      // #36: "not needed" is shown unticked with its own name, never hidden: one tick brings it back.
      if (used().has(p.column)) continue;
      extras[p.column] = { label: (headers[p.column] ?? '').trim() || `Column ${columnLetter(p.column)}`, on: false, ai: true, aiIgnored: true };
    }
  }
  // An extra suggestion for a column a field just took is dropped.
  const taken = used();
  for (const c of Object.keys(extras).map(Number)) if (taken.has(c)) delete extras[c];
  return { map: out, aiFields: aiFields.filter((f) => out[f] !== null), extras, held };
}

// ---------------------------------------------------------------- asking the server

/** R-157: one calm line each; the AI runs by itself, there is no button. */
export const AI_WORDS = {
  asking: 'Matching your columns with AI…',
  /** Shown while the AI matches: what leaves this browser. */
  privacy: 'Names, addresses, phone numbers, emails and ID numbers are hidden before anything is sent.',
  done: (n: number) => `AI matched ${n} ${n === 1 ? 'column' : 'columns'}. Check the boxes below and change any that are wrong.`,
  /** The AI agreed with every column our own rules had placed. */
  agreed: 'AI checked your columns and agrees with them. Check the boxes below.',
  /** The AI could not be used (off, offline, today's limit, an error): our own rules matched. */
  fallback: 'Matched without AI (it was not available). Check the columns below.',
  /** On a field the AI set. */
  tag: 'Matched by AI',
} as const;

export type AiAnswer =
  | { ok: true; picks: AiPick[]; left: number | null }
  | { ok: false; why: 'limit' | 'owner' | 'signin' | 'off' | 'unreachable' | 'failed' | 'offline' };

/** What the server's answer means for the owner. PURE. */
export function aiAnswer(status: number, body: unknown, width: number): AiAnswer {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  // R-157: a 200 without the answer's shape (an HTML page, a proxy's error) is a failure, not "no picks".
  if (status === 200 && Array.isArray(b.columns)) {
    const left = typeof b.left === 'number' && Number.isFinite(b.left) ? b.left : null;
    return { ok: true, picks: parseAiPicks(b, width), left };
  }
  if (status === 429) return { ok: false, why: 'limit' };
  if (status === 403) return { ok: false, why: 'owner' };
  if (status === 401) return { ok: false, why: 'signin' };
  if (status === 503 && b.reason === 'off') return { ok: false, why: 'off' };
  if (status === 503 && b.reason === 'unreachable') return { ok: false, why: 'unreachable' };
  return { ok: false, why: 'failed' };
}

/**
 * POST /api/ai/match-columns (deploy/panel/aiMatch.js) with this device's sign-in key. Never throws:
 * every failure is a logged reason, and our own matching on the screen always stands.
 */
export async function askAiForColumns(
  key: string,
  columns: readonly AiColumn[],
  fetcher: typeof fetch = fetch,
  timeoutMs = 45_000,
): Promise<AiAnswer> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetcher('/api/ai/match-columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forge-Key': key },
      body: JSON.stringify({ columns }),
      signal: ctrl.signal,
    });
    const body: unknown = await res.json().catch((e: unknown) => {
      console.warn('[ai-match] answer was not JSON', e);
      return null;
    });
    const answer = aiAnswer(res.status, body, columns.length);
    if (!answer.ok) console.warn('[ai-match] no AI match, our own rules stand:', res.status, answer.why);
    return answer;
  } catch (e) {
    console.warn('[ai-match] could not ask, our own rules stand', e);
    return { ok: false, why: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}
