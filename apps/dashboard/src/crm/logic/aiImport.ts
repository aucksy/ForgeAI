/**
 * "Ask AI to match the columns" (Project Tracker #47, option A + owner R-82, 23 Oct 2026). PURE.
 *
 * Our own word lists and value checks (importMembers.ts) place the columns first, free and tested.
 * When the owner says yes, the AI is shown only the column names and up to 5 example rows, with
 * mobile numbers, emails and ID numbers hidden (masked here, and again by the server). It answers
 * only "column C is the expiry date / a new detail: Locker No. / not needed", with how sure it is.
 * Its answer is checked strictly against our field list; anything else is dropped. It fills only
 * what our rules left empty: a guess that disagrees with our rules is shown, never applied. Our
 * code then reads every date, mobile and rupee amount as before.
 *
 * The server half is deploy/panel/aiMatch.js (maskCell there is the same rule as here).
 */

import { cellText, columnLetter, fieldLabel, IMPORT_FIELDS, normalizeHeader, type ColumnMap, type ExtraColumn, type ImportField } from './importMembers';
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
  const body = dataRows(rows, headerRow, 200);
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

export interface AiColumn {
  header: string;
  examples: string[];
}

/**
 * What the AI is shown: every column's name and its cells in the first 5 data rows, masked. An
 * ID-number column shows only that it is one. PURE.
 */
export function aiColumnsPayload(rows: readonly (readonly unknown[])[], headerRow: number, width: number, idCols: readonly number[]): AiColumn[] {
  const header = rows[headerRow] ?? [];
  const sample = dataRows(rows, headerRow, AI_EXAMPLE_ROWS);
  const ids = new Set(idCols);
  return Array.from({ length: Math.min(width, AI_MAX_COLUMNS) }, (_, c) => ({
    header: maskCell(header[c]),
    examples: sample.map((r) => (ids.has(c) ? (cellText(r[c]) ? '[ID number]' : '') : maskCell(r[c]))),
  }));
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
  /** Fields the AI filled in (shown with an "AI" mark until the owner changes them). */
  aiFields: ImportField[];
  /** Extra-detail suggestions by column. */
  extras: Record<number, Pick<ExtraColumn, 'label' | 'on' | 'ai'>>;
  /** Guesses shown but not applied: they disagree with our rules, or the AI was not sure. */
  held: string[];
}

/**
 * Fill in what our rules left empty. A field already placed, a column already used, an ID column:
 * never changed. PURE.
 */
export function applyAiPicks(map: ColumnMap, picks: readonly AiPick[], idCols: readonly number[], headers: readonly string[]): AiApplied {
  const out: ColumnMap = { ...map };
  const ids = new Set(idCols);
  const used = () => new Set(IMPORT_FIELDS.map((f) => out[f]).filter((c): c is number => c !== null));
  const aiFields: ImportField[] = [];
  const extras: AiApplied['extras'] = {};
  const held: string[] = [];
  const sorted = [...picks].sort((a, b) => b.confidence - a.confidence);
  for (const p of sorted) {
    if (ids.has(p.column)) continue;
    const name = columnName(headers, p.column);
    if ('field' in p.target) {
      const field = p.target.field;
      if (out[field] === p.column) continue; // our rules agree
      const free = out[field] === null && !used().has(p.column);
      if (free && p.confidence >= AI_SURE) {
        out[field] = p.column;
        aiFields.push(field);
      } else if (p.confidence >= 0.4) {
        held.push(`AI thinks ${name} is “${fieldLabel(field)}”${p.confidence < AI_SURE ? ' (not sure)' : ''}.`);
      }
    } else if ('extra' in p.target) {
      if (used().has(p.column)) continue;
      extras[p.column] = { label: p.target.extra, on: p.confidence >= AI_SURE, ai: true };
    }
  }
  // An extra suggestion for a column a field just took is dropped.
  const taken = used();
  for (const c of Object.keys(extras).map(Number)) if (taken.has(c)) delete extras[c];
  return { map: out, aiFields, extras, held };
}

// ---------------------------------------------------------------- asking the server

export const AI_WORDS = {
  ask: 'Ask AI to match the columns? It sends the column names and 5 example rows. Phone numbers, emails and ID numbers are hidden.',
  asking: 'Asking AI…',
  off: 'AI matching is not switched on yet. Match the columns yourself below.',
  limit: 'Today’s AI matches for your gym are used up. Match the columns yourself below, or try tomorrow.',
  failed: 'The AI did not answer. Match the columns yourself below.',
  offline: 'Could not reach the AI. Check the internet, or match the columns yourself below.',
  owner: 'Only the owner can use AI matching. Match the columns yourself below.',
  signin: 'Sign in again to use AI matching. You can match the columns yourself below.',
} as const;

export type AiAnswer =
  | { ok: true; picks: AiPick[]; left: number | null }
  | { ok: false; words: string };

/** What the server's answer means for the owner. PURE. */
export function aiAnswer(status: number, body: unknown, width: number): AiAnswer {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (status === 200) {
    const left = typeof b.left === 'number' && Number.isFinite(b.left) ? b.left : null;
    return { ok: true, picks: parseAiPicks(b, width), left };
  }
  if (status === 429) return { ok: false, words: AI_WORDS.limit };
  if (status === 403) return { ok: false, words: AI_WORDS.owner };
  if (status === 401) return { ok: false, words: AI_WORDS.signin };
  if (status === 503 && b.reason === 'off') return { ok: false, words: AI_WORDS.off };
  if (status === 503 && b.reason === 'unreachable') return { ok: false, words: AI_WORDS.offline };
  return { ok: false, words: AI_WORDS.failed };
}

/**
 * POST /api/ai/match-columns (deploy/panel/aiMatch.js) with this device's sign-in key. Never throws:
 * every failure is a sentence, and the by-hand matching on the screen always works.
 */
export async function askAiForColumns(
  key: string,
  columns: readonly AiColumn[],
  fetcher: typeof fetch = fetch,
  timeoutMs = 30_000,
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
    if (res.status !== 200) console.warn('[ai-match] server answered', res.status);
    return aiAnswer(res.status, body, columns.length);
  } catch (e) {
    console.warn('[ai-match] could not ask', e);
    return { ok: false, words: AI_WORDS.offline };
  } finally {
    clearTimeout(timer);
  }
}
