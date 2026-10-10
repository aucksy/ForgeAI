/**
 * Search and filter for the exercise lists (library, Add exercise, Swap). PURE.
 *
 * Audit Phase 4 (EX-01): search understands how people type, not just exact pieces of a name.
 *  - Words in any order: "curl dumbbell", "press incline", Hevy's "Squat (Barbell)".
 *  - Plurals and singulars: "curls", "calf raises", "flyes", "situps".
 *  - One typo per word (two in long words): "lat pulldwon", "romanain deadlift".
 *  - Spacing: "benchpress", "skullcrusher", "pull up" / "pullup".
 *  - Common spellings: "dumbell", "bicep / biceps", "db", "bb", "kb".
 *  - Every library entry's aliases (Hindi / Hinglish gym words too: "dand", "baithak") and
 *    its Hevy / Strong titles (`linkNames`), read from the bundled library at run time — so
 *    a library fix reaches every phone without rewriting the stored rows (EX-15).
 *  - The muscle and gear an exercise works count as words: "bicep curl" finds the curls.
 *
 * Ranking (lower is better): 0 the name (or a library title) IS what was typed, or starts with
 * it; 1 a word of the name starts with it; 2 the name contains it; 3 an alias or library title
 * contains it; 4 every word is in the name, any order; 5 every word is in an alias / title /
 * the muscle and gear; 6 it matches once the spaces are ignored; 7 it matches with a typo.
 * Inside a band: the exact match first, then (bands 4+) the closest fit, then A→Z.
 *
 * Muscle filters use the FINER muscles (front / side / rear shoulders…), matching an
 * exercise's main muscles only — "Side shoulders" lists lateral raises, not every press.
 */
import type { Exercise } from '@/types/models';

import { catalogEntry, catalogEntryByName } from '../catalog/exerciseCatalog';
import { MUSCLE_LABEL, type Muscle, type MuscleMap } from '../catalog/muscles';

export interface SearchableExercise {
  name: string;
  aliases: string[];
  equipment: Exercise['equipment'];
  muscles: MuscleMap;
  /** The library entry this row is (its aliases and Hevy / Strong titles are searched too). */
  catalogKey?: string | null;
}

/** lowercase, trim, collapse whitespace (kept: the Create row and name checks use it). */
export function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

const PLAIN = /^[\x00-\x7f]*$/;

/** Lowercase, accents off, every punctuation mark a space ("Push-Up (Weighted)" → "push up weighted"). */
export function fold(s: string): string {
  const lower = s.toLowerCase();
  // Plain English text (nearly every name): the same answer without the slow Unicode steps.
  if (PLAIN.test(lower)) return lower.replace(/['`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return lower
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    // Letters, their marks (Devanagari vowel signs) and digits stay; everything else is a space.
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

/** Spellings people use for the same word (after plurals are folded). */
const SPELLING: Record<string, string> = {
  dumbell: 'dumbbell',
  dumbel: 'dumbbell',
  dumbbel: 'dumbbell',
  dumbless: 'dumbbell',
  db: 'dumbbell',
  dbs: 'dumbbell',
  bb: 'barbell',
  barbel: 'barbell',
  kb: 'kettlebell',
  biceps: 'bicep',
  bi: 'bicep',
  triceps: 'tricep',
  tri: 'tricep',
  flye: 'fly',
  flie: 'fly',
  flyes: 'fly',
  flies: 'fly',
  calve: 'calf',
  calves: 'calf',
  deltoid: 'delt',
  ezbar: 'ez',
  treadmil: 'treadmill',
  excercise: 'exercise',
  machin: 'machine',
};

/** Words that say nothing about which exercise ("with", "the", "exercise"). */
const STOP = new Set(['with', 'the', 'and', 'a', 'an', 'on', 'of', 'for', 'exercise', 'exercises', 'workout', 'using', 'to']);

/** One word to its base: plurals off, then the common spelling. */
export function stem(w: string): string {
  let v = STEMS.get(w);
  if (v === undefined) {
    v = stemOf(w);
    // Words repeat across the whole library; typed words are few. A runaway list starts over.
    if (STEMS.size > 20000) STEMS.clear();
    STEMS.set(w, v);
  }
  return v;
}

const STEMS = new Map<string, string>();

function spelling(s: string): string | undefined {
  // Own keys only ("constructor" is a word, not Object's).
  return Object.prototype.hasOwnProperty.call(SPELLING, s) ? SPELLING[s] : undefined;
}

function stemOf(w: string): string {
  let s = w;
  const direct = spelling(s);
  if (direct) return direct;
  if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && /(ches|shes|sses|xes)$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  return spelling(s) ?? s;
}

export function tokens(s: string): string[] {
  return fold(s)
    .split(' ')
    .filter(Boolean)
    .map(stem);
}

/** Rows reused by every distance (no arrays made per call: this runs thousands of times a keystroke). */
let ROW0 = new Int32Array(64);
let ROW1 = new Int32Array(64);
let ROW2 = new Int32Array(64);

/**
 * Damerau–Levenshtein (optimal string alignment) distance between `a` and the first `bLen`
 * letters of `b`, stopping once it passes `max`.
 */
function osa(a: string, b: string, bLen: number, max: number): number {
  const m = a.length;
  const n = bLen;
  if (Math.abs(m - n) > max) return max + 1;
  if (n + 1 > ROW0.length) {
    ROW0 = new Int32Array(n + 1);
    ROW1 = new Int32Array(n + 1);
    ROW2 = new Int32Array(n + 1);
  }
  let prev2 = ROW0;
  let prev = ROW1;
  let cur = ROW2;
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const bj = b.charCodeAt(j - 1);
      const cost = ai === bj ? 0 : 1;
      let v = prev[j] + 1;
      if (cur[j - 1] + 1 < v) v = cur[j - 1] + 1;
      if (prev[j - 1] + cost < v) v = prev[j - 1] + cost;
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj && prev2[j - 2] + 1 < v) v = prev2[j - 2] + 1;
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  return prev[n];
}

/** Damerau–Levenshtein (optimal string alignment) distance, stopping once it passes `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  return osa(a, b, b.length, max);
}

/** Typos allowed in one typed word: none under 4 letters, one from 4, two from 8. */
function typoBudget(w: string): number {
  return w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0;
}

type Hit = 0 | 1 | 2; // 0 exact word, 1 prefix / joined words, 2 typo

/**
 * Review fix (search speed): the typo checks (edit distances) are the slow part, so they run in a
 * SECOND pass only when the exact / prefix / every-word levels found fewer than this many
 * exercises. A typo result never outranks an exact one, so the top of the list is the same.
 */
const TYPO_PASS_BELOW = 5;

/** One typed word against one word of a phrase, without typos: 0 same, 1 starts with it. */
function plainHitWord(q: string, w: string): Hit | null {
  if (w === q) return 0;
  if (q.length >= 2 && w.startsWith(q)) return 1;
  return null;
}

/** One typed word against a joined pair / triple ("pullup", "benchpress"), without typos. */
function plainHitJoined(q: string, j: string): boolean {
  return j === q || (q.length >= 4 && j.startsWith(q));
}

/** Is `w` one typo (two in long words) away from the typed word `q`? */
function typoHit(q: string, w: string, joined: boolean): boolean {
  const budget = typoBudget(q);
  if (budget === 0) {
    // A three-letter word gets one swapped pair only ("rwo" → "row"; "row" never finds "rope").
    return !joined && q.length === 3 && w.length === 3 && editDistance(q, w, 1) === 1 && [...q].sort().join('') === [...w].sort().join('');
  }
  if (w.length < 3) return false;
  // A longer form of a word ("woodchopper" → "woodchop").
  if (w.length >= 5 && q.startsWith(w) && q.length - w.length <= 3) return true;
  // Pre-filter: a whole-word typo needs the lengths within the budget (at most 2 apart).
  if (Math.abs(w.length - q.length) <= budget && editDistance(q, w, budget) <= budget) return true;
  // A word still being typed with a typo in it ("pulldwo" → "pulldown").
  return q.length >= 5 && w.length > q.length && osa(q, w, q.length, budget) <= budget;
}

/** One search's typed words, worked out once per search (not once per exercise). */
interface Query {
  /** The typed text folded ("Push-Up" → "push up"). */
  f: string;
  /** The same with plurals and spellings folded. */
  st: string;
  forms: string[];
  /** The typed words that say something (stop words dropped unless that leaves none). */
  words: string[];
  compact: string;
  /** Typo answers already worked out in this search (the same library words repeat a lot). */
  typoMemo: Map<string, boolean>;
  /** Per typed word: does vocabulary word #id match it at all (plain or typo)? -1 not worked out yet. */
  anyMemo: Map<string, Int8Array>;
  /** The same, exact / start-of-word / joined matches only (the first pass). */
  plainMemo: Map<string, Int8Array>;
}

function queryOf(text: string): Query {
  const f = fold(text);
  const all = tokens(text);
  const st = all.join(' ');
  const qs = all.filter((w) => !STOP.has(w));
  const words = qs.length > 0 ? qs : all;
  return { f, st, forms: st && st !== f ? [f, st] : [f], words, compact: words.join(''), typoMemo: new Map(), anyMemo: new Map(), plainMemo: new Map() };
}

function typoHitMemo(qy: Query, q: string, w: string, joined: boolean): boolean {
  const key = `${q}${joined ? '#' : '|'}${w}`;
  let v = qy.typoMemo.get(key);
  if (v === undefined) {
    v = typoHit(q, w, joined);
    qy.typoMemo.set(key, v);
  }
  return v;
}

/**
 * How one typed word matches one phrase's words (and their joined pairs and triples). Typos are
 * looked at only when a query is passed (the second pass).
 */
function wordHit(qy: Query | null, q: string, words: readonly string[], joined: readonly string[]): Hit | null {
  let best: Hit | null = null;
  for (const w of words) {
    const h = plainHitWord(q, w);
    if (h === 0) return 0;
    if (h != null) best = h;
  }
  if (best != null) return best;
  for (const j of joined) if (plainHitJoined(q, j)) return 1;
  if (!qy) return null;
  for (const w of words) if (typoHitMemo(qy, q, w, false)) return 2;
  for (const j of joined) if (typoHitMemo(qy, q, j, true)) return 2;
  return null;
}

interface Phrase {
  folded: string;
  /** The words with plurals folded ("calf raises" → "calf raise"). */
  stemmed: string;
  words: string[];
  joined: string[];
  /** The words, then the joined ones, as vocabulary numbers (the pre-filters). */
  ids: Int32Array;
}

/**
 * Every phrase made so far, by its text: a library title, an alias the row repeats and the
 * same title on the next re-read are worked out once. Phrases are never changed after.
 */
const PHRASES = new Map<string, Phrase>();

function phraseOf(text: string): Phrase {
  const hit = PHRASES.get(text);
  if (hit) return hit;
  const folded = fold(text);
  const words = folded.split(' ').filter(Boolean).map(stem);
  const joined: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i + 1 < words.length) joined.push(words[i] + words[i + 1]);
    if (i + 2 < words.length) joined.push(words[i] + words[i + 1] + words[i + 2]);
  }
  const ids = new Int32Array(words.length + joined.length);
  words.forEach((w, i) => (ids[i] = vocabId(w, false)));
  joined.forEach((j, i) => (ids[words.length + i] = vocabId(j, true)));
  const made: Phrase = { folded, stemmed: words.join(' '), words, joined, ids };
  // A runaway list (thousands of renames in one run) starts over.
  if (PHRASES.size > 50000) PHRASES.clear();
  PHRASES.set(text, made);
  return made;
}

interface Index {
  /** What the index was built from: a rename or new aliases build it again. */
  srcName: string;
  srcAliases: readonly string[];
  srcKey: string | null | undefined;
  name: Phrase;
  others: Phrase[];
  /** The muscle and gear words, usable alongside any phrase. */
  extra: string[];
  /** Every word of every phrase and the extras, as vocabulary numbers (the typo pre-filter). */
  vocab: Int32Array;
  /** The name for A→Z order, lowercased once. */
  sortKey: string;
  /** Every phrase's folded and plural-free text, one per line (one `includes` rules bands 0–3 out). */
  text: string;
  /** Every phrase without spaces, one per line (band 6). */
  compact: string;
  /** Each word of the name, as typed and plural-free ("a word of the name starts with it"). */
  nameStarts: string[];
}

const INDEX = new WeakMap<object, Index>();

/**
 * Every word (and joined pair / triple) any indexed exercise has, numbered once per app run. The
 * typo pass works out "does this typed word match vocabulary word #n?" once per search, then
 * throws out every exercise none of whose words can match — before any per-phrase work.
 */
const VOCAB_WORDS = new Map<string, number>();
const VOCAB_JOINS = new Map<string, number>();
const VOCAB_TEXT: string[] = [];
const VOCAB_JOINED: boolean[] = [];

function vocabId(w: string, joined: boolean): number {
  const map = joined ? VOCAB_JOINS : VOCAB_WORDS;
  let id = map.get(w);
  if (id === undefined) {
    id = VOCAB_TEXT.length;
    map.set(w, id);
    VOCAB_TEXT.push(w);
    VOCAB_JOINED.push(joined);
  }
  return id;
}

/** Marks for `vocabOf` (no Set made per exercise): STAMP[id] === pass means already taken. */
let STAMP = new Int32Array(4096);
let PASS = 0;

function vocabOf(phrases: readonly Phrase[], extra: readonly string[]): Int32Array {
  PASS += 1;
  if (STAMP.length < VOCAB_TEXT.length + extra.length + 1) {
    const grown = new Int32Array(Math.max(STAMP.length * 2, VOCAB_TEXT.length + extra.length + 1024));
    grown.set(STAMP);
    STAMP = grown;
  }
  const out: number[] = [];
  const take = (id: number): void => {
    if (id >= STAMP.length) {
      const grown = new Int32Array(id * 2 + 1);
      grown.set(STAMP);
      STAMP = grown;
    }
    if (STAMP[id] === PASS) return;
    STAMP[id] = PASS;
    out.push(id);
  };
  for (const p of phrases) for (let i = 0; i < p.ids.length; i++) take(p.ids[i]);
  for (const w of extra) take(vocabId(w, false));
  return Int32Array.from(out);
}

/**
 * Can typed word `q` match vocabulary word #id at all — with a typo when `typos`, else exactly /
 * as the start of a word / as joined words? Worked out once per search.
 */
function vocabHit(qy: Query, q: string, id: number, typos: boolean): boolean {
  const memos = typos ? qy.anyMemo : qy.plainMemo;
  let memo = memos.get(q);
  if (!memo || memo.length <= id) {
    const grown = new Int8Array(Math.max(VOCAB_TEXT.length, id + 1)).fill(-1);
    if (memo) grown.set(memo);
    memo = grown;
    memos.set(q, memo);
  }
  const v = memo[id];
  if (v !== -1) return v === 1;
  const w = VOCAB_TEXT[id];
  const joined = VOCAB_JOINED[id];
  const hit = (joined ? plainHitJoined(q, w) : plainHitWord(q, w) != null) || (typos && typoHit(q, w, joined));
  memo[id] = hit ? 1 : 0;
  return hit;
}

/** Pre-filter: can every typed word match SOME word this exercise has? (Never wrong to say yes.) */
function everyWordCanHit(qy: Query, idx: Index, typos: boolean): boolean {
  for (const q of qy.words) {
    let any = false;
    for (let i = 0; i < idx.vocab.length && !any; i++) any = vocabHit(qy, q, idx.vocab[i], typos);
    if (!any) return false;
  }
  return true;
}

/** A library entry's own phrases (its name, aliases and Hevy / Strong titles) never change: built once per app run. */
const LIBRARY_PHRASES = new Map<string, readonly Phrase[]>();
/** Muscle / gear words, built once per muscle and gear. */
const EXTRA_WORDS = new Map<string, readonly string[]>();

function libraryPhrases(ex: SearchableExercise): readonly Phrase[] {
  const entry = catalogEntry(ex.catalogKey) ?? (ex.catalogKey === undefined ? catalogEntryByName(ex.name) : null);
  if (!entry) return [];
  let made = LIBRARY_PHRASES.get(entry.key);
  if (!made) {
    made = [entry.name, ...entry.aliases, ...(entry.linkNames ?? [])].map(phraseOf);
    LIBRARY_PHRASES.set(entry.key, made);
  }
  return made;
}

function extraWords(tag: string, text: string): readonly string[] {
  let made = EXTRA_WORDS.get(tag);
  if (!made) {
    made = tokens(text);
    EXTRA_WORDS.set(tag, made);
  }
  return made;
}

function indexOf(ex: SearchableExercise): Index {
  const hit = INDEX.get(ex);
  if (hit && hit.srcName === ex.name && hit.srcAliases === ex.aliases && hit.srcKey === ex.catalogKey) return hit;
  const name = phraseOf(ex.name);
  const seen = new Set<string>([name.folded]);
  const others: Phrase[] = [];
  for (const t of ex.aliases) {
    const p = phraseOf(t);
    if (!p.folded || seen.has(p.folded)) continue;
    seen.add(p.folded);
    others.push(p);
  }
  for (const p of libraryPhrases(ex)) {
    if (!p.folded || seen.has(p.folded)) continue;
    seen.add(p.folded);
    others.push(p);
  }
  const extra = new Set<string>(extraWords(`g:${ex.equipment}`, ex.equipment));
  for (const m of ex.muscles.primary) {
    for (const w of extraWords(`m:${m}`, `${m} ${MUSCLE_LABEL[m] ?? ''}`)) extra.add(w);
  }
  const extraList = [...extra];
  let folds = name.folded;
  let text = name.folded === name.stemmed ? name.folded : `${name.folded}\n${name.stemmed}`;
  for (const p of others) {
    folds += `\n${p.folded}`;
    text += p.folded === p.stemmed ? `\n${p.folded}` : `\n${p.folded}\n${p.stemmed}`;
  }
  const made: Index = {
    srcName: ex.name,
    srcAliases: ex.aliases,
    srcKey: ex.catalogKey,
    name,
    others,
    extra: extraList,
    vocab: vocabOf([name, ...others], extraList),
    sortKey: name.folded,
    text,
    compact: folds.replace(/ /g, ''),
    nameStarts: name.folded === name.stemmed ? name.words : [...name.words, ...name.folded.split(' ')],
  };
  INDEX.set(ex, made);
  return made;
}

/**
 * Builds (or refreshes) the search index of every exercise in `all` ahead of the first search.
 * It is kept per exercise row and checked against the row's name, aliases and library key, so a
 * list read again after a create / rename / merge / hide (EX-03) re-indexes only what changed;
 * library titles are indexed once per app run. Optional — the first search does it otherwise.
 */
export function buildSearchIndex(all: readonly SearchableExercise[]): void {
  for (const ex of all) indexOf(ex);
}

/** Forgets the library-title phrases and the vocabulary (a cold start; the speed test times one). */
export function clearSearchCaches(): void {
  LIBRARY_PHRASES.clear();
  PHRASES.clear();
  EXTRA_WORDS.clear();
  STEMS.clear();
  VOCAB_WORDS.clear();
  VOCAB_JOINS.clear();
  VOCAB_TEXT.length = 0;
  VOCAB_JOINED.length = 0;
}

/** Every typed word against one phrase: worst hit, how many used the extras, or null. */
function phraseFit(qy: Query | null, qs: readonly string[], p: Phrase, extra: readonly string[] | null): { worst: Hit; viaExtra: number } | null {
  let worst: Hit = 0;
  let viaExtra = 0;
  for (const q of qs) {
    let h = wordHit(qy, q, p.words, p.joined);
    if (h == null && extra) {
      h = wordHit(qy, q, extra, []);
      if (h != null) viaExtra += 1;
    }
    if (h == null) return null;
    if (h > worst) worst = h;
  }
  return { worst, viaExtra };
}

interface Score {
  rank: number;
  exact: boolean;
  /** Share of the name's words the search covers (closer fit = higher). */
  fit: number;
}

/** Bands 0–6 (no typos). */
function score(ex: SearchableExercise, qy: Query): Score | null {
  const s = bandOf(ex, qy);
  if (!s || s.exact) return s;
  // Whatever the band, an alias or library title that IS the typed text leads ("squat" →
  // Barbell Squat, "bench" → Barbell Bench Press, "Bench Press (Barbell)").
  const idx = indexOf(ex);
  const exact = idx.others.some((p) => p.folded === qy.f || p.stemmed === qy.st);
  return exact ? { ...s, exact } : s;
}

/** Share of the phrase the search covers; a phrase starting with the first typed word fits a
 * little better ("dumbbell press" → Dumbbell Bench Press before Decline Dumbbell Press). */
function fitOf(qy: Query, p: Phrase): number {
  return Math.min(1, qy.words.length / Math.max(1, p.words.length)) + (p.words[0] === qy.words[0] ? 0.1 : 0);
}

function bandOf(ex: SearchableExercise, qy: Query): Score | null {
  if (!qy.f) return { rank: 0, exact: false, fit: 0 };
  const idx = indexOf(ex);
  const name = idx.name;
  // The same checks on the plural-free form too ("curls" → "curl", "calf raises" → "calf raise").
  const forms = qy.forms;
  const is = (p: Phrase, t: string): boolean => p.folded === t || p.stemmed === t;
  const has = (p: Phrase, t: string): boolean => p.folded.includes(t) || p.stemmed.includes(t);
  // Bands 0–3 all need the typed text inside some phrase: one look rules them out.
  if (forms.some((t) => idx.text.includes(t))) {
    if (forms.some((t) => is(name, t))) return { rank: 0, exact: true, fit: 1 };
    if (forms.some((t) => name.folded.startsWith(t) || name.stemmed.startsWith(t))) return { rank: 0, exact: false, fit: 1 };
    if (forms.some((t) => idx.nameStarts.some((w) => w.startsWith(t)))) return { rank: 1, exact: false, fit: 1 };
    if (forms.some((t) => has(name, t))) return { rank: 2, exact: false, fit: 1 };
    // An alias or a library title: the one that IS what was typed leads the band.
    if (forms.some((t) => idx.others.some((p) => is(p, t)))) return { rank: 3, exact: true, fit: 1 };
    if (forms.some((t) => idx.others.some((p) => has(p, t)))) return { rank: 3, exact: false, fit: 1 };
  }

  const words = qy.words;
  if (words.length === 0) return null;
  // Bands 4–5 need every typed word to match one of this exercise's words.
  if (everyWordCanHit(qy, idx, false)) {
    // Band 4: every word in the name (exact or the start of a word).
    if (phraseFit(null, words, name, null)) return { rank: 4, exact: false, fit: fitOf(qy, name) };
    // Band 5: every word in an alias / library title, or in the name with the muscle and gear.
    let best5 = -1;
    for (const p of idx.others) {
      const r = phraseFit(null, words, p, idx.extra);
      if (r) best5 = Math.max(best5, fitOf(qy, p) - r.viaExtra * 0.01);
    }
    const nameExtra = phraseFit(null, words, name, idx.extra);
    if (nameExtra) best5 = Math.max(best5, fitOf(qy, name) - nameExtra.viaExtra * 0.2);
    if (best5 >= 0) return { rank: 5, exact: false, fit: best5 };
  }
  // Band 6: spaces ignored ("benchpress", "skullcrushers").
  if (qy.compact.length >= 4 && idx.compact.includes(qy.compact)) return { rank: 6, exact: false, fit: fitOf(qy, name) };
  return null;
}

/** Band 7: with a typo or two (the second pass only). */
function typoBand(ex: SearchableExercise, qy: Query): Score | null {
  if (!qy.f || qy.words.length === 0) return null;
  const idx = indexOf(ex);
  // Pre-filter: every typed word must be able to match SOME word this exercise has.
  if (!everyWordCanHit(qy, idx, true)) return null;
  let best7 = -1;
  for (const p of [idx.name, ...idx.others]) {
    const r = phraseFit(qy, qy.words, p, idx.extra);
    if (r) best7 = Math.max(best7, fitOf(qy, p) - r.viaExtra * 0.2);
  }
  return best7 >= 0 ? { rank: 7, exact: false, fit: best7 } : null;
}

/** Rank 0 (best) … 7, or null when the query doesn't match. */
export function matchRank(ex: Pick<SearchableExercise, 'name' | 'aliases'> & Partial<SearchableExercise>, query: string): number | null {
  const full: SearchableExercise = {
    equipment: 'other',
    muscles: { primary: [], secondary: [] },
    ...ex,
  } as SearchableExercise;
  const qy = queryOf(query);
  return (score(full, qy) ?? typoBand(full, qy))?.rank ?? null;
}

/** A→Z, ignoring case and accents (a cached key: `localeCompare` per comparison is slow on a phone). */
function byName(a: SearchableExercise, b: SearchableExercise): number {
  const x = indexOf(a).sortKey;
  const y = indexOf(b).sortKey;
  return x < y ? -1 : x > y ? 1 : 0;
}

export function filterExercises<T extends SearchableExercise>(
  all: readonly T[],
  opts: { query: string; muscle: Muscle | null; equipment: Exercise['equipment'] | null },
): T[] {
  const qy = queryOf(opts.query);
  const ranked: { ex: T; s: Score }[] = [];
  const missed: T[] = [];
  for (const ex of all) {
    if (opts.muscle && !ex.muscles.primary.includes(opts.muscle)) continue;
    if (opts.equipment && ex.equipment !== opts.equipment) continue;
    const s = score(ex, qy);
    if (s == null) missed.push(ex);
    else ranked.push({ ex, s });
  }
  // Second pass, typos: only when the plain levels found next to nothing.
  if (ranked.length < TYPO_PASS_BELOW) {
    for (const ex of missed) {
      const s = typoBand(ex, qy);
      if (s) ranked.push({ ex, s });
    }
  }
  ranked.sort(
    (a, b) =>
      Number(b.s.exact) - Number(a.s.exact) ||
      a.s.rank - b.s.rank ||
      (a.s.rank >= 4 ? b.s.fit - a.s.fit : 0) ||
      byName(a.ex, b.ex),
  );
  return ranked.map((r) => r.ex);
}

/**
 * v0.28.0: the name to offer as "Create “…”" at the end of the search: what the member typed
 * (2+ letters), unless an exercise already has exactly that name. PURE.
 */
export function createOffer(query: string, all: readonly Pick<SearchableExercise, 'name'>[]): string | null {
  const typed = query.trim().replace(/\s+/g, ' ');
  if (typed.length < 2) return null;
  // Punctuation and case don't make a new name: "pull-up" is the existing "Pull Up".
  const q = fold(typed);
  return all.some((e) => fold(e.name) === q) ? null : typed;
}

/**
 * EX-01: "Did you mean Dumbbell Curl?" — shown above the Create row when nothing has exactly
 * the typed name: the best result, unless the typed text is already its name. Null when
 * nothing matched. PURE.
 */
export function didYouMean<T extends SearchableExercise>(query: string, results: readonly T[]): T | null {
  const top = results[0];
  if (!top || fold(query).length < 2) return null;
  return fold(top.name) === fold(query) ? null : top;
}
