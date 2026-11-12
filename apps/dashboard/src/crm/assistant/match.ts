/**
 * F201 (03-design §2 C): the member the owner named, found in OUR list, never invented by the AI. Owners type
 * and speak names many ways ("Priti" / "Preeti", "Puja" / "Pooja", "Wikas" / "Vikas", "राहुल" from voice), often
 * the first name only. One match -> that member; two or more -> he picks; none -> "Add as new member?". The same
 * matcher finds a plan, a batch or a trainer by name. PURE.
 */
import { withoutTitle } from '../logic/members';
import type { MemberView } from '../types';

// ------------------------------------------------------------------ Devanagari to Latin letters

const VOWELS: Record<string, string> = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au',
};
const SIGNS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
};
const CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh',
  ष: 'sh', स: 's', ह: 'h', ळ: 'l',
};
const VIRAMA = '्';
const NUKTA = '़';

/** Devanagari written in Latin letters the way names are usually spelled ("प्रीति" -> "preeti"). */
export function devanagariToLatin(text: string): string {
  let out = '';
  const chars = [...text.normalize('NFC')];
  for (let i = 0; i < chars.length; i += 1) {
    const c = chars[i];
    if (c === NUKTA) continue;
    if (c in CONSONANTS) {
      out += CONSONANTS[c];
      let j = i + 1;
      while (chars[j] === NUKTA) j += 1;
      const next = chars[j];
      if (next === VIRAMA) {
        i = j;
      } else if (next !== undefined && next in SIGNS) {
        out += SIGNS[next];
        i = j;
      } else {
        // The inherent "a": kept inside a word or before an "n" sound, dropped at the word's end
        // ("राहुल" -> "rahul", "राम" -> "ram", "संजय" -> "sanjay").
        const inWord = next !== undefined && /[ऀ-ॿ]/.test(next);
        if (inWord) out += 'a';
        i = j - 1;
      }
      continue;
    }
    if (c in VOWELS) out += VOWELS[c];
    else if (c === 'ं' || c === 'ँ') out += 'n';
    else if (c === 'ः') out += 'h';
    else if (/[ऀ-ॿ]/.test(c)) continue;
    else out += c;
  }
  return out;
}

// ------------------------------------------------------------------ one spelling key per sound

/**
 * A spelling key that is the same for the usual Hinglish spellings of one name: lower case, letters only,
 * aspirates and long vowels folded ("Preeti", "Priti", "प्रीति" -> "priti"), doubled letters once.
 */
export function nameKey(word: string): string {
  let s = devanagariToLatin(word).toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '');
  s = s
    .replace(/ph/g, 'f')
    .replace(/([bcdgjkpt])h/g, '$1')
    .replace(/sh/g, 's')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/q/g, 'k')
    .replace(/ck/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/ee|ii|ie|ey/g, 'i')
    .replace(/oo|ou|uu/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/y$/g, 'i')
    .replace(/(.)\1+/g, '$1');
  // A last "a" or "h" is how a spoken name often comes back ("Rahula", "Nehah"): kept only for short names.
  if (s.length > 4) s = s.replace(/[ah]$/, '');
  return s;
}

/** Edits (insert, delete, change one letter) between two short strings. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

const words = (text: string): string[] =>
  withoutTitle(text)
    .split(/[\s.,]+/)
    .map(nameKey)
    .filter((w) => w.length > 0);

/** Do two name keys sound like one word? Equal, or one letter apart in a longer name. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 5 && editDistance(a, b) <= 1;
}

/**
 * How well a typed name fits a full name: 4 = every word, in order, and nothing more; 3 = every typed word
 * (the full name has more, e.g. a surname); 2 = the typed word is the first name; 1 = it is another part
 * (a surname); 0.5 = a typed word only starts a name word (3+ letters, "Prak" for "Prakash"); 0 = no fit.
 */
export function nameScore(typed: string, fullName: string): number {
  const q = words(typed);
  const n = words(fullName);
  if (q.length === 0 || n.length === 0) return 0;
  if (q.length === 1) {
    if (sameWord(q[0], n[0])) return n.length === 1 ? 4 : 2;
    if (n.some((w) => sameWord(q[0], w))) return 1;
    return q[0].length >= 3 && n.some((w) => w.startsWith(q[0])) ? 0.5 : 0;
  }
  let at = 0;
  for (const w of q) {
    const found = n.findIndex((x, i) => i >= at && sameWord(w, x));
    if (found < 0) return q.every((w2) => n.some((x) => sameWord(w2, x))) ? 1 : 0;
    at = found + 1;
  }
  return q.length === n.length ? 4 : 3;
}

export type Match<T> =
  | { kind: 'one'; item: T }
  /** Two or more fit equally well: he picks (at most `MAX_CHOICES`). */
  | { kind: 'choose'; items: T[] }
  | { kind: 'none'; typed: string };

export const MAX_CHOICES = 5;

/** The best fits for a typed name among `items`, by `nameOf`. */
export function bestMatch<T>(typed: string, items: readonly T[], nameOf: (item: T) => string): Match<T> {
  const clean = typed.trim();
  if (!clean) return { kind: 'none', typed: clean };
  let best = 0;
  let hits: T[] = [];
  for (const item of items) {
    const s = nameScore(clean, nameOf(item));
    if (s <= 0 || s < best) continue;
    if (s > best) {
      best = s;
      hits = [];
    }
    hits.push(item);
  }
  if (hits.length === 0) return { kind: 'none', typed: clean };
  if (hits.length === 1) return { kind: 'one', item: hits[0] };
  return { kind: 'choose', items: hits.slice(0, MAX_CHOICES) };
}

/**
 * The member the owner named, among members not archived. Two with the same fit -> he picks; a member
 * whose plan is running comes first in the choices (the one he more likely means).
 */
export function matchMember(typed: string, views: readonly MemberView[]): Match<MemberView> {
  const live = views.filter((v) => !v.member.archived);
  const m = bestMatch(typed, live, (v) => v.member.fullName);
  if (m.kind !== 'choose') return m;
  const running = (v: MemberView) => (v.state === 'active' || v.state === 'expiring' ? 0 : 1);
  return { kind: 'choose', items: [...m.items].sort((a, b) => running(a) - running(b) || a.member.fullName.localeCompare(b.member.fullName)) };
}
