// AI column matching for the admin app's member import (Project Tracker #47, option A; owner R-82: the
// cheapest AI first, Claude as the fallback; R-157: runs by itself, no button). POST /api/ai/match-columns.
//
// What the AI is shown: the column names and up to 5 example rows of the gym's file, with mobile
// numbers, emails and ID numbers hidden, and names and addresses shown only as "[name]" /
// "[address]" (owner, 24 Oct 2026, #59) (the browser hides them, and this Worker hides them AGAIN
// before anything leaves, so a browser bug can never send a phone number). What it gives back: only
// which column is which ({ column -> one of our fields | "extra:<label>" | "ignore" } plus how sure it
// is). It never returns member data; the admin app's own tested code reads every date, mobile and
// rupee amount. Its answer is checked strictly here against the allowed field list; anything else
// is dropped (that column stays for the owner to match by hand).
//
// Who may ask: an owner of an online gym. The browser sends its sign-in key (X-Forge-Key); this
// Worker asks the gym server who that key is (`staff_me`, migration 0010: the same check every
// panel call goes through) and refuses anyone but an owner. Nothing from the file is stored here.
//
// Cost control: free to gyms, PER_GYM_PER_DAY reads per gym per India day and ALL_PER_DAY for all
// gyms together, counted in Cloudflare D1 `forgeai-web`, table `ai_usage`
// (migrations/0003_ai_usage.sql). About ₹0.40 per spreadsheet at the prices below. MettleUp HQ can set
// one gym's own daily limit (table ai_limits, migrations/0004; #51).
//
// Providers, in order (a provider without its key is skipped; an error, a 20-second timeout or an
// answer that is not the JSON we asked for moves on to the next, with a log line each time):
//   1. Google Gemini, REST generateContent, secret GEMINI_API_KEY. Model GEMINI_MODEL below.
//   2. Anthropic Claude, the official SDK, secret ANTHROPIC_API_KEY. Model CLAUDE_MODEL below.
// Neither key is ever logged, echoed or sent to the browser.

import Anthropic from '@anthropic-ai/sdk';

import { SUPABASE } from './proxy.js';

/**
 * Gemini 3.1 Flash-Lite: $0.25 in / $1.50 out per million tokens, paid tier (Google's pricing page,
 * https://ai.google.dev/gemini-api/docs/pricing, read 23 Oct 2026). The cheapest current Gemini a new
 * key can use: the cheaper 2.5 Flash-Lite ($0.10 / $0.40) is open only to projects that used it
 * before (deprecations page). Google shuts 3.1 Flash-Lite down on 7 May 2027; its named successor is
 * gemini-3.5-flash-lite ($0.30 / $2.50). Set the Worker variable GEMINI_MODEL to switch without a
 * code change. One spreadsheet is about 4,000 tokens in and 1,000 out: about $0.0025, ₹0.25.
 */
export const GEMINI_MODEL = 'gemini-3.1-flash-lite';
/** Claude Haiku 5.5: $0.10 in / $0.50 out per million tokens (owner R-82). Low effort. */
export const CLAUDE_MODEL = 'claude-haiku-5-5';

export const PER_GYM_PER_DAY = 20;
export const ALL_PER_DAY = 1000;
// R-157: 10 s was tight for a wide sheet (one owner import on 28 Oct 2026 failed on both providers);
// the match now runs by itself in the background, so a slower answer costs nothing.
export const TIMEOUT_MS = 20_000;
export const MAX_COLUMNS = 60;
export const MAX_EXAMPLES = 5;
export const MAX_CELL = 60;
export const MAX_BODY = 40_000;
export const MAX_LABEL = 40;

// The public, read-only app key (the same one in worker.js, the panel and the app).
const KEY = 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';

/**
 * The fields the admin app's import has (apps/dashboard/src/crm/logic/importMembers.ts
 * IMPORT_FIELDS; aiMatch.test.mjs fails if the two lists ever differ), with what each one means.
 */
export const FIELDS = {
  fullName: "The member's name",
  phone: 'Mobile or WhatsApp number',
  joinedOn: 'Date the member first joined the gym (admission / DOJ)',
  gender: 'Male / female',
  dateOfBirth: 'Date of birth',
  email: 'Email address',
  address: 'Home address or area',
  batch: 'Time slot or batch they train in (Morning 6-8, Ladies batch)',
  plan: 'Membership plan or package name (Monthly, 3 months, Annual + PT)',
  startDate: 'Date the current plan started (renewed on, from date)',
  total: "The plan's full price",
  amount: 'Money paid (fees paid, amount received)',
  paidOn: 'Date of the payment (receipt date)',
  due: 'Balance still due',
  expiry: 'Date the plan ends (valid till, expiry, next due date)',
  notes: 'Free-text notes or remarks about the member',
  branch: 'Which branch or centre of the gym the member belongs to (only for a gym with several branches)',
  paidFlag: 'Whether the fees were paid, written as yes / no or a tick (not an amount)',
};
export const FIELD_NAMES = Object.keys(FIELDS);

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
function digitsValue(text) {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const zero = DIGIT_ZEROS.find((z) => cp >= z && cp <= z + 9);
    if (zero === undefined) return null;
    n = n * 10 + (cp - zero);
  }
  return n;
}

/** Is this a real calendar day written d/m/y, m/d/y or y-m-d (two- or four-digit year)? PURE. */
export function isRealDate(text) {
  const m = DATE_SHAPE.exec(String(text).trim());
  if (!m) return false;
  const [a, b, c] = [m[1], m[2], m[3]].map(digitsValue);
  if (a === null || b === null || c === null) return false;
  const ok = (y, mo, d) => y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (m[1].length === 4) return m[3].length <= 2 && ok(a, b, c);
  if (m[1].length > 2 || (m[3].length !== 2 && m[3].length !== 4)) return false;
  const y = m[3].length === 2 ? 2000 + c : c;
  return ok(y, b, a) || ok(y, a, b);
}

/**
 * One cell made safe to show an AI: emails -> [email], PAN numbers -> [PAN], any run of 7 or more
 * digits (a mobile, an Aadhaar, a long account number), in any script and with any separators ->
 * its first 2 and last 2 digits with X in between ("98XXXXXX45"). A run is kept only when it is real
 * dates ("15-08-2026"): they tell a joining column from an expiry column. Cut to MAX_CELL letters.
 * PURE. The same rule as maskCell in apps/dashboard/src/crm/logic/aiImport.ts.
 */
export function maskCell(value) {
  let s = String(value ?? '').replace(/\s+/g, ' ').trim();
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
 * Owner, 24 Oct 2026 (tracker #59): "hide names and addresses from the AI import too". A column that
 * holds people's names or addresses goes to the AI only as "[name]" / "[address]" for each filled
 * cell (an empty cell stays empty). The browser does this first; this Worker does it AGAIN to
 * whatever arrives. Decided per column:
 *  1. a header with a word that is never about a person (plan, package, batch, time, trainer,
 *     status, gender, branch, date, id, no …) keeps its examples (matching needs them);
 *  2. a header with an address word (address, pata, पता, area, locality …) -> addresses;
 *  3. a header with a name word (name, naam, नाम, member, customer, ref by …) -> names, unless most
 *     cells are dates or numbers;
 *  4. otherwise by the cells: most of them like an address (road, nagar, sector …, or a comma between
 *     3+ words) -> addresses; most of them 2-4 words of letters, no digits, none a plan / status /
 *     batch word -> names. Then the header too is hidden when it looks like one more name or
 *     address (a file with no header row sends its first member as the "header").
 * The same rule as hidePeople in apps/dashboard/src/crm/logic/aiImport.ts (the dashboard's
 * aiImport.test.ts runs both on the same cases). PURE.
 */

export const PEOPLE_SHAPE = { name: '[name]', address: '[address]' };

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

/** Lower case, every run of punctuation one space. PURE. */
function plainWords(text) {
  return String(text).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

function hasWord(text, words) {
  const padded = ` ${plainWords(text)} `;
  return words.some((w) => padded.includes(` ${w} `));
}

/** Dates or numbers only (an Excel day number, an amount, a masked mobile): never a name. PURE. */
function numberish(cell) {
  return isRealDate(cell) || !/\p{L}/u.test(cell.replace(/X/g, '').replace(/\b(rs|inr)\b/gi, ''));
}

/** "12, MG Road" / "Near Bus Stand, Sector 4": an address. PURE. */
export function looksLikeAddress(cell) {
  if (PLACEHOLDER.test(cell) || numberish(cell)) return false;
  const words = plainWords(cell).split(' ').filter(Boolean);
  if (words.some((w) => ADDRESS_WORDS.has(w))) return true;
  const letterWords = words.filter((w) => w.length >= 2 && !/\p{N}/u.test(w));
  return cell.includes(',') && letterWords.length >= 3 && !letterWords.every((w) => NOT_NAME_WORDS.has(w));
}

/** "Ramesh Gupta" / "R. K. Sharma" / "राहुल शर्मा": 2-4 words of letters, no plan or status word. PURE. */
export function looksLikeName(cell) {
  if (PLACEHOLDER.test(cell)) return false;
  const words = cell.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  if (!words.every((w) => NAME_WORD.test(w))) return false;
  if (words.some((w) => NOT_NAME_WORDS.has(plainWords(w)))) return false;
  return !looksLikeAddress(cell);
}

/**
 * Does this column hold names or addresses? -> { kind: 'name' | 'address', fromHeader } | null.
 * `fromHeader`: its header said so (the header then stays). Works on masked cells. PURE.
 */
export function peopleColumnKind(header, cells) {
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
 * filled cell). The header and examples must already be through maskCell. PURE. The same rule as
 * hidePeople in apps/dashboard/src/crm/logic/aiImport.ts.
 */
export function hidePeople(header, examples, placed = null) {
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

/**
 * The checked request: columns with their header and up to 5 masked examples, names and addresses
 * as their shape only (hidePeople, whatever the browser did), or a reason. PURE.
 */
export function checkRequest(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.columns)) return { error: 'Send { columns: [...] }.' };
  if (body.columns.length === 0) return { error: 'No columns.' };
  if (body.columns.length > MAX_COLUMNS) return { error: `At most ${MAX_COLUMNS} columns.` };
  const columns = body.columns.map((c, i) => {
    const masked = maskCell(c && typeof c.header === 'string' ? c.header : '');
    const raw = c && Array.isArray(c.examples) ? c.examples : [];
    const cells = raw.slice(0, MAX_EXAMPLES).map((v) => maskCell(typeof v === 'string' || typeof v === 'number' ? v : ''));
    const { header, examples } = hidePeople(masked, cells);
    const stats = checkStats(c && c.stats);
    return stats ? { column: i, header, examples, stats } : { column: i, header, examples };
  });
  return { value: { columns } };
}

/** R-157: the counts the admin app works out per column (whole percentages of the rows it read). */
export const STAT_KEYS = ['filled', 'mobile', 'date', 'amount', 'email'];

/**
 * A column's counts, kept only when every one is a whole number 0..100 (anything else: dropped, the
 * column is still matched from its examples). Counts carry no member data. PURE.
 */
export function checkStats(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const k of STAT_KEYS) {
    const n = raw[k];
    if (!Number.isInteger(n) || n < 0 || n > 100) return null;
    out[k] = n;
  }
  return out;
}

// ---------------------------------------------------------------- the question and the answer

/** The JSON shape both providers are held to. */
export const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    columns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          column: { type: 'integer' },
          target: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['column', 'target', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['columns'],
  additionalProperties: false,
};

/** Gemini's own schema dialect (OpenAPI subset, upper-case types). */
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    columns: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { column: { type: 'INTEGER' }, target: { type: 'STRING' }, confidence: { type: 'NUMBER' } },
        required: ['column', 'target', 'confidence'],
      },
    },
  },
  required: ['columns'],
};

export const SYSTEM = [
  "You match the columns of an Indian gym's member spreadsheet to the fields of a gym app's member import.",
  'Headers may be English, Hinglish or Hindi, abbreviated or misspelt. Some columns have no header.',
  'You see each column number, its header, up to 5 example values from the same rows, and often "stats": the percentage of the rows read where that column is filled, a valid Indian mobile (10 digits starting 6-9), a date, a rupee amount, an email.',
  'Decide from the VALUES and the stats first, the header second: headers are often wrong or vague.',
  'Mobile numbers, emails and ID numbers are hidden (98XXXXXX45, [email], [PAN], [ID number]); that is expected. A hidden number keeps its first 2 and last 2 digits and its length: 98XXXXXX45 is a 10-digit mobile, 01XXXXXXX01 (starting 0, 11+ digits) is a landline.',
  'phone is the member\'s OWN mobile: when several columns hold phone numbers (Phone, Home phone, Cell phone, WhatsApp), pick the one with the highest mobile percentage; a column that is mostly empty or landlines is not phone (make it extra:<its name>). Emergency contact or a parent\'s number is never phone.',
  "People's names and addresses are shown only as [name] / [address]: such a column is the member's name or address (or a person such as \"referred by\").",
  'For EVERY column give exactly one target:',
  '- a field name from the list, when the column holds that information;',
  '- "extra:<label>" for useful information about the member that fits no field (locker number, blood group, referred by, trainer, weight, occupation); <label> is a short English name in Title Case, at most 40 letters, e.g. "extra:Locker No.";',
  '- "ignore" for serial numbers, member ids, blank columns, totals, signatures, and ID numbers such as Aadhaar or PAN (never extra).',
  'Use each field at most once; a field always wins over an extra. If unsure, use a lower confidence.',
  'confidence is from 0 to 1. Answer only with the JSON object, nothing else.',
].join('\n');

/** The user's turn: the field list, then the columns. PURE. */
export function buildPrompt(columns) {
  const fields = FIELD_NAMES.map((f) => `- ${f}: ${FIELDS[f]}`).join('\n');
  const cols = columns
    .map((c) => {
      const stats = c.stats ? `; stats % of rows: ${STAT_KEYS.map((k) => `${k} ${c.stats[k]}`).join(', ')}` : '';
      return `Column ${c.column}: header ${JSON.stringify(c.header || '(none)')}; examples ${JSON.stringify(c.examples)}${stats}`;
    })
    .join('\n');
  return `Fields:\n${fields}\n\nColumns:\n${cols}`;
}

const LABEL_OK = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'&/()#+-]*$/u;

/** "extra:Locker No." -> "Locker No."; null when the label is not a short, plain name. PURE. */
export function extraLabel(target) {
  if (typeof target !== 'string' || !target.startsWith('extra:')) return null;
  const label = target.slice(6).replace(/\s+/g, ' ').trim();
  if (!label || label.length > MAX_LABEL || !LABEL_OK.test(label)) return null;
  return label;
}

/**
 * The AI's answer, held strictly to the rules: a known column (0 .. columnCount-1), a target that is
 * one of FIELD_NAMES, "ignore" or "extra:<label>", a confidence from 0 to 1. Anything else is
 * dropped (that column stays unmatched). A column answered twice keeps its first answer; a field
 * given to two columns goes to the surer one. Returns null when the answer is not the shape at all.
 * PURE.
 */
export function validateAnswer(raw, columnCount) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.columns)) return null;
  const byColumn = new Map();
  for (const item of raw.columns) {
    if (!item || typeof item !== 'object') continue;
    const { column, target, confidence } = item;
    if (!Number.isInteger(column) || column < 0 || column >= columnCount) continue;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) continue;
    if (typeof target !== 'string') continue;
    let clean;
    if (target === 'ignore') clean = 'ignore';
    else if (FIELD_NAMES.includes(target)) clean = target;
    else {
      const label = extraLabel(target);
      if (!label) continue;
      clean = `extra:${label}`;
    }
    if (byColumn.has(column)) continue;
    byColumn.set(column, { column, target: clean, confidence: Math.round(confidence * 100) / 100 });
  }
  const bestForField = new Map();
  for (const m of byColumn.values()) {
    if (!FIELD_NAMES.includes(m.target)) continue;
    const held = bestForField.get(m.target);
    if (!held || m.confidence > held.confidence) bestForField.set(m.target, m);
  }
  return [...byColumn.values()]
    .filter((m) => !FIELD_NAMES.includes(m.target) || bestForField.get(m.target) === m)
    .sort((a, b) => a.column - b.column);
}

// ---------------------------------------------------------------- providers

/** A provider's error, with no key in it and short enough for a log line. PURE. */
export function safeMessage(e, env) {
  let s = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  for (const k of [env?.GEMINI_API_KEY, env?.ANTHROPIC_API_KEY]) if (k) s = s.split(k).join('***');
  return s.slice(0, 300);
}

function parseJsonText(text) {
  const t = String(text ?? '').trim();
  if (!t) throw new Error('empty answer');
  return JSON.parse(t);
}

/**
 * Gemini 3.x thinks by default. The lowest level is asked for: "minimal" (Google's thinking docs list
 * minimal / low / medium / high for its Flash-Lite models). Review of #47: should a model refuse
 * "minimal" (an HTTP 400 that names thinking), "low" is tried once more, inside the same provider.
 */
export const GEMINI_THINKING = ['minimal', 'low'];

function geminiBody(columns, level) {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: buildPrompt(columns) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_SCHEMA,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: level },
    },
  });
}

/**
 * R-162 (28 Oct 2026): Gemini 3.1 Flash-Lite answered 503 "high demand" on and off for hours, and the
 * Claude fallback had no credit, so every owner's import fell back to our own rules. A busy answer
 * (429 or any 5xx) is now asked once more after a short pause, then the same Google key asks the
 * backup models below, before Claude. Same key, same masked request: nothing else leaves the Worker.
 * Probed 28 Oct 2026: 3.5 Flash-Lite and 3.5 Flash answered while 3.1 Flash-Lite and 3.8 Flash were 503.
 */
export const GEMINI_BACKUP_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];
export const GEMINI_RETRY_PAUSE_MS = 1500;

/** 429 or 5xx: Google is busy, not refusing this request. PURE. */
export function geminiBusy(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

class GeminiBusy extends Error {}

async function askGemini(env, columns, fetchImpl, timeoutMs, log = console.warn, pauseMs = GEMINI_RETRY_PAUSE_MS) {
  const first = typeof env.GEMINI_MODEL === 'string' && env.GEMINI_MODEL ? env.GEMINI_MODEL : GEMINI_MODEL;
  // [model, tries]: the first model twice (one pause between), each backup once.
  const plan = [[first, 2], ...GEMINI_BACKUP_MODELS.filter((m) => m !== first).map((m) => [m, 1])];
  let last;
  for (const [model, tries] of plan) {
    for (let t = 1; t <= tries; t++) {
      try {
        return await askGeminiModel(env, model, columns, fetchImpl, timeoutMs, log);
      } catch (e) {
        if (!(e instanceof GeminiBusy)) throw e; // a timeout, a refusal, a bad answer: Claude next
        last = e;
        log(`[ai-match] gemini ${model} busy (${e.message.slice(0, 40)}), ${t < tries ? 'asking again' : 'trying the next model'}`);
        if (t < tries && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
      }
    }
  }
  throw last;
}

async function askGeminiModel(env, model, columns, fetchImpl, timeoutMs, log) {
  const signal = AbortSignal.timeout(timeoutMs);
  let res;
  for (const level of GEMINI_THINKING) {
    res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: geminiBody(columns, level),
      signal,
    });
    if (res.status !== 400 || level === GEMINI_THINKING[GEMINI_THINKING.length - 1]) break;
    // quiet: an unreadable error body is treated as "not about thinking", and fails below.
    const text = await res.clone().text().catch(() => '');
    if (!/thinking/i.test(text)) break;
    log(`[ai-match] gemini refused thinking level ${level}, trying the next: ${text.slice(0, 160)}`);
  }
  // quiet: an unreadable error body still fails with its status, and the chain logs that line.
  if (!res.ok) {
    const msg = `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`;
    throw geminiBusy(res.status) ? new GeminiBusy(msg) : new Error(msg);
  }
  const data = await res.json();
  const cand = data?.candidates?.[0];
  if (!cand) throw new Error(`no answer${data?.promptFeedback?.blockReason ? ` (${data.promptFeedback.blockReason})` : ''}`);
  // MAX_TOKENS (the answer was cut short), SAFETY, …: logged by the chain, then Claude is asked.
  if (cand.finishReason && cand.finishReason !== 'STOP') throw new Error(`stopped: ${cand.finishReason}`);
  const text = (cand.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  const usage = data.usageMetadata ?? {};
  return {
    model,
    json: parseJsonText(text),
    tokensIn: Number(usage.promptTokenCount) || 0,
    tokensOut: (Number(usage.candidatesTokenCount) || 0) + (Number(usage.thoughtsTokenCount) || 0),
  };
}

async function askClaude(env, columns, fetchImpl, timeoutMs) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, fetch: fetchImpl, maxRetries: 0, timeout: timeoutMs });
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt(columns) }],
    // Haiku 5.5 thinks by default (adaptive); low effort keeps a small job small. Structured outputs
    // hold the answer to ANSWER_SCHEMA. No prefill (refused on this model).
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ANSWER_SCHEMA } },
  });
  if (msg.stop_reason !== 'end_turn') throw new Error(`stop_reason ${msg.stop_reason}`);
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return {
    model: CLAUDE_MODEL,
    json: parseJsonText(text),
    tokensIn: Number(msg.usage?.input_tokens) || 0,
    tokensOut: Number(msg.usage?.output_tokens) || 0,
  };
}

/** The chain, cheapest first. `secret` names the Worker secret that turns a provider on. */
export const PROVIDERS = [
  { name: 'gemini', secret: 'GEMINI_API_KEY', ask: askGemini },
  { name: 'claude', secret: 'ANTHROPIC_API_KEY', ask: askClaude },
];

export function providersOn(env) {
  return PROVIDERS.filter((p) => typeof env?.[p.secret] === 'string' && env[p.secret].trim() !== '');
}

/**
 * Ask each provider that has its key, in order, until one gives a valid answer.
 * -> { provider, model, mapping, tokensIn, tokensOut } | { error: 'off' | 'failed', tried: [...] }
 */
export async function runChain(env, columns, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, log = console.warn, pauseMs = GEMINI_RETRY_PAUSE_MS } = {}) {
  const on = providersOn(env);
  if (on.length === 0) return { error: 'off', tried: [] };
  const tried = [];
  for (const p of on) {
    tried.push(p.name);
    try {
      const r = await p.ask(env, columns, fetchImpl, timeoutMs, log, pauseMs);
      const mapping = validateAnswer(r.json, columns.length);
      if (!mapping) throw new Error('answer is not the JSON shape asked for');
      return { provider: p.name, model: r.model, mapping, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
    } catch (e) {
      log(`[ai-match] ${p.name} failed, trying the next: ${safeMessage(e, env)}`);
    }
  }
  return { error: 'failed', tried };
}

// ---------------------------------------------------------------- who is asking, and how often

/** The India calendar day (the "daily" limit resets at midnight IST). PURE. */
export function indiaDay(now) {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Who this sign-in key is, from the gym server's own check (staff_me, migration 0010).
 * -> { gymId, owner: boolean } | { denied: true } | { unreachable: true }
 */
export async function whoIsAsking(key, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(`${SUPABASE}/rest/v1/rpc/staff_me`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: key }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.warn('[ai-match] gym server did not answer staff_me', safeMessage(e));
    return { unreachable: true };
  }
  if (res.status >= 500) {
    console.warn('[ai-match] gym server error on staff_me', res.status);
    return { unreachable: true };
  }
  if (!res.ok) {
    // quiet: an unreadable error body is not BAD_KEY, so it is logged below as a server problem.
    const body = await res.text().catch(() => '');
    if (res.status === 400 && /BAD_KEY/.test(body)) return { denied: true };
    console.warn('[ai-match] gym server refused staff_me', res.status, body.slice(0, 160));
    return { unreachable: true };
  }
  const me = await res.json().catch((e) => {
    console.warn('[ai-match] staff_me answer was not JSON', safeMessage(e));
    return null;
  });
  if (!me || typeof me.gymId !== 'string' || !me.gymId) return { denied: true };
  // An old owner key has no person; a signed-in person carries a role.
  const owner = me.person === null || me.person === undefined || me.person?.role === 'owner';
  return { gymId: me.gymId, owner };
}

/**
 * This gym's own daily allowance, when MettleUp HQ set one (D1 table ai_limits, migrations/0004;
 * 0 = off for this gym), else PER_GYM_PER_DAY. Before the table exists: PER_GYM_PER_DAY.
 */
export async function gymLimit(db, gymId) {
  try {
    const row = await db.prepare('SELECT per_day FROM ai_limits WHERE gym_id = ?').bind(gymId).first();
    const n = row ? Number(row.per_day) : NaN;
    return Number.isInteger(n) && n >= 0 ? n : PER_GYM_PER_DAY;
  } catch (e) {
    console.warn('[ai-match] ai_limits not readable, using the normal limit', safeMessage(e));
    return PER_GYM_PER_DAY;
  }
}

/**
 * Take one read from today's allowance for this gym. -> the count after taking it, or null when the
 * gym (or every gym together) has used today's allowance. One statement per step, so two tabs
 * asking at once cannot both take the last read.
 */
export async function takeOne(db, gymId, day, perDay = PER_GYM_PER_DAY) {
  // One statement: the gym's allowance and all gyms' together are checked and taken at once, so two
  // tabs (or two gyms) asking at the same moment cannot both take the last read.
  const row = await db
    .prepare(
      "INSERT INTO ai_usage (day, gym_id, kind, calls) SELECT ?1, ?2, 'columns', 1 " +
        'WHERE ?3 > 0 AND (SELECT COALESCE(SUM(calls), 0) FROM ai_usage WHERE day = ?1) < ?4 ' +
        'ON CONFLICT (day, gym_id, kind) DO UPDATE SET calls = calls + 1 ' +
        'WHERE calls < ?3 AND (SELECT COALESCE(SUM(calls), 0) FROM ai_usage WHERE day = ?1) < ?4 ' +
        'RETURNING calls',
    )
    .bind(day, gymId, perDay, ALL_PER_DAY)
    .first();
  return row ? Number(row.calls) : null;
}

async function noteResult(db, gymId, day, result) {
  const ok = !result.error;
  await db
    .prepare(
      "UPDATE ai_usage SET failed = failed + ?, tokens_in = tokens_in + ?, tokens_out = tokens_out + ?, provider = ? " +
        "WHERE day = ? AND gym_id = ? AND kind = 'columns'",
    )
    .bind(ok ? 0 : 1, ok ? result.tokensIn : 0, ok ? result.tokensOut : 0, ok ? result.provider : '', day, gymId)
    .run();
}

function answer(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/**
 * POST /api/ai/match-columns  (header X-Forge-Key: the panel's sign-in key)
 *   200 { columns: [{ column, target, confidence }], provider, left }
 *   400 bad body · 401 not signed in · 403 not the owner · 405 not POST · 413 too big
 *   429 { reason: 'limit' } · 502 { reason: 'failed' } · 503 { reason: 'off' | 'unreachable' }
 * The admin app falls back to matching by hand on every answer but 200.
 */
export async function handleMatchColumns(request, env, { now = new Date(), fetchImpl = fetch, timeoutMs = TIMEOUT_MS, log = console.warn, pauseMs = GEMINI_RETRY_PAUSE_MS } = {}) {
  if (request.method !== 'POST') return answer(405, { error: 'Use POST.' });
  if (providersOn(env).length === 0) {
    // quiet: no key made yet (the owner's setup step); the admin app shows the by-hand path.
    return answer(503, { reason: 'off', error: 'AI matching is not switched on yet.' });
  }
  if (!env.WEB) {
    console.error('[ai-match] not set up: D1 binding WEB missing');
    return answer(503, { reason: 'off', error: 'AI matching is not switched on yet.' });
  }
  const key = request.headers.get('X-Forge-Key') || '';
  if (key.length < 16 || key.length > 300 || /\s/.test(key)) return answer(401, { error: 'Sign in first.' });
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return answer(413, { error: 'Too big.' });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return answer(413, { error: 'Too big.' });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return answer(400, { error: 'Send a JSON object.' }); // quiet: the sender's mistake, answered
  }
  const checked = checkRequest(body);
  if (checked.error) return answer(400, { error: checked.error });

  const who = await whoIsAsking(key, fetchImpl);
  if (who.unreachable) return answer(503, { reason: 'unreachable', error: 'The gym server could not be reached.' });
  if (who.denied) return answer(401, { error: 'Sign in first.' });
  if (!who.owner) return answer(403, { error: 'Only the owner can use AI matching.' });

  const day = indiaDay(now);
  const perDay = await gymLimit(env.WEB, who.gymId);
  let used;
  try {
    used = await takeOne(env.WEB, who.gymId, day, perDay);
  } catch (e) {
    console.error('[ai-match] usage table not readable', e);
    return answer(503, { reason: 'off', error: 'AI matching is not switched on yet.' });
  }
  if (used === null) return answer(429, { reason: 'limit', error: 'Today’s AI matches are used up. Match the columns yourself, or try tomorrow.' });

  const result = await runChain(env, checked.value.columns, { fetchImpl, timeoutMs, log, pauseMs });
  try {
    await noteResult(env.WEB, who.gymId, day, result);
  } catch (e) {
    console.error('[ai-match] usage not noted', e);
  }
  if (result.error) {
    log(`[ai-match] every provider failed (${result.tried.join(', ')})`);
    return answer(502, { reason: 'failed', error: 'The AI did not answer. Match the columns yourself.' });
  }
  // Counts only, never the file: which provider, how many columns, tokens.
  console.log(`[ai-match] ok ${result.provider} ${result.model} cols=${checked.value.columns.length} in=${result.tokensIn} out=${result.tokensOut}`);
  return answer(200, { columns: result.mapping, provider: result.provider, left: Math.max(0, perDay - used) });
}
