/**
 * English | Hinglish (owner, 1 Nov 2026). Replaces the English-only guard of 16 Oct 2026: the owner
 * now wants Hinglish as a choice. What still holds:
 *  - every Hinglish line belongs to an English line that is really on a screen (no stale entries),
 *  - no Devanagari letters in the Hinglish (Hindi words in English letters only),
 *  - every `{value}` survives the translation,
 *  - every t('...') on the translated screens has its Hinglish (a gap would show English mid-screen),
 *  - Hinglish words live only in the dictionary, never typed into a screen directly.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HINGLISH } from '../../src/crm/lang/hinglish';
import { fill, getLang, savedLang, t, translate } from '../../src/crm/lang/lang';
import { getStartedSteps } from '../../src/crm/logic/getStarted';
import { QUICK_ACTIONS } from '../../src/crm/logic/quickActions';
import { TILE_FILTERS, tileLabel } from '../../src/crm/logic/homeTiles';
import { STATE_LABEL } from '../../src/crm/logic/membership';
import { START_PROMISE } from '../../src/crm/logic/trial';
import { CHECK_RAN_OUT, OTHER_WAYS, PIN_HINT, REMOVED_WORDS, SIGNED_OUT_WORDS } from '../../src/crm/auth/signin';

const ROOT = fileURLToPath(new URL('../../src/crm', import.meta.url));
const DICT = join('lang', 'hinglish.ts');
const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ]/;
// Words that only appear in Hinglish: outside the dictionary they mean a screen was typed in Hinglish.
const HINGLISH_WORD = /\b(karo|kijiye|karein|nahi|aapka|aapke|aapko|judiye|dabaiye|daaliye|kholiye|baaki|wapas|hazri|shubhkamnayein|dhanyavaad|raseed|namaste)\b/i;
// Import still READS Hinglish and Hindi column names in an owner's Excel file.
const SKIP_WORD_GUARD = new Set(['importMembers.ts', 'hinglish.ts']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

const rel = (f: string) => f.slice(ROOT.length + 1);
const sources = files(ROOT).filter((f) => rel(f) !== DICT);
const corpus = sources.map((f) => readFileSync(f, 'utf8')).join('\n');

const noComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The quoted strings and JSX text of a file, without its comments. */
function words(src: string): string[] {
  return noComments(src).match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`|>[^<>{}\n]+</g) ?? [];
}

/** Is this English line written somewhere in the app, as a string or as JSX text? */
function inApp(english: string): boolean {
  return [`'${english}'`, `"${english}"`, `\`${english}\``].some((q) => corpus.includes(q)) || corpus.includes(`>${english}<`);
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('the Hinglish dictionary', () => {
  const entries = Object.entries(HINGLISH);

  it('has lines', () => {
    expect(entries.length).toBeGreaterThan(150);
  });

  it('every Hinglish line is for an English line that is really in the app', () => {
    expect(entries.filter(([en]) => !inApp(en)).map(([en]) => en)).toEqual([]);
  });

  it('no Devanagari letters anywhere in it', () => {
    expect(entries.filter(([en, hi]) => DEVANAGARI.test(en) || DEVANAGARI.test(hi)).map(([en]) => en)).toEqual([]);
    expect(readFileSync(join(ROOT, DICT), 'utf8')).not.toMatch(DEVANAGARI);
  });

  it('keeps every {value}, and no line is empty', () => {
    const bad = entries.filter(([en, hi]) => !hi.trim() || placeholders(en).join() !== placeholders(hi).join());
    expect(bad.map(([en]) => en)).toEqual([]);
  });

  it('keeps MettleUp, ₹ and the numbers as they are', () => {
    for (const [en, hi] of entries) {
      if (en.includes('MettleUp')) expect(hi, en).toContain('MettleUp');
      if (en.includes('₹')) expect(hi, en).toContain('₹');
      for (const n of en.match(/\d+/g) ?? []) expect(hi, en).toContain(n);
    }
  });

  // R-449 (R-447 fresh eyes): "6 number ka PIN" read awkward. Owners say "6-digit PIN", so the Hinglish keeps
  // "digit" for a PIN, a code or a mobile number, the same on every screen.
  it('says "digit" the way owners do: "6-digit PIN", never "6 number ka PIN"', () => {
    const digitLines = entries.filter(([en]) => /\bdigits?\b/i.test(en));
    expect(digitLines.length).toBeGreaterThan(8);
    expect(digitLines.filter(([, hi]) => !/\bdigit\b/.test(hi)).map(([en]) => en)).toEqual([]);
    expect(entries.filter(([, hi]) => /\b\d+ number (ka|ke)\b|\(6 number\)|chhe baar/.test(hi)).map(([en]) => en)).toEqual([]);
    expect(HINGLISH['Choose a 6-digit PIN']).toBe('6-digit PIN chuno');
    expect(HINGLISH['Sign in with your mobile number and your 6-digit PIN.']).toBe('Apne mobile number aur 6-digit PIN se sign in karo.');
  });

  it('a sentence stays a sentence: an English line ending in a full stop ends in one in Hinglish', () => {
    const bad = entries.filter(([en, hi]) => /\.$/.test(en) && !/\.$/.test(hi));
    expect(bad.map(([en]) => en)).toEqual([]);
  });
});

describe('the translated screens are complete', () => {
  it('every t(\'…\') in the app has its Hinglish', () => {
    const keys = new Set<string>();
    for (const f of sources) {
      for (const m of noComments(readFileSync(f, 'utf8')).matchAll(/\bt\(\s*(?:'([^'\n]+)'|"([^"\n]+)")/g)) keys.add(m[1] ?? m[2]!);
    }
    expect(keys.size).toBeGreaterThan(150);
    expect([...keys].filter((k) => !(k in HINGLISH))).toEqual([]);
  });

  it('the words drawn through t(variable): Get started, quick buttons, tiles, member status, sign-in lines', () => {
    const dynamic = [
      ...getStartedSteps({ plans: [], members: [] }, new Set()).flatMap((s) => [s.title, s.hint]),
      ...QUICK_ACTIONS.map((a) => a.label),
      ...TILE_FILTERS.filter((f) => f !== 'visited-today').map(tileLabel),
      ...Object.values(STATE_LABEL),
      START_PROMISE,
      ...Object.values(OTHER_WAYS),
      PIN_HINT,
      CHECK_RAN_OUT,
      // R-449: the sign-in page's notice line after a sign-out (drawn through t(notice)).
      'You are signed out of this device.',
      SIGNED_OUT_WORDS,
      REMOVED_WORDS,
    ];
    expect(dynamic.filter((k) => !(k in HINGLISH))).toEqual([]);
  });

  it('Hinglish words are only in the dictionary, never typed into a screen', () => {
    const found: string[] = [];
    for (const f of sources) {
      if (SKIP_WORD_GUARD.has(f.split(/[\\/]/).pop()!)) continue;
      for (const w of words(readFileSync(f, 'utf8'))) if (HINGLISH_WORD.test(w)) found.push(`${rel(f)}: ${w.slice(0, 80)}`);
    }
    expect(found).toEqual([]);
  });
});

describe('t()', () => {
  it('is English by default (nothing saved, no storage)', () => {
    expect(savedLang()).toBe('en');
    expect(getLang()).toBe('en');
    expect(t('Today')).toBe('Today');
  });

  it('Hinglish when chosen; a line with no Hinglish falls back to English', () => {
    expect(translate('hinglish', 'Today')).toBe('Aaj');
    expect(translate('hinglish', 'Came in today')).toBe('Aaj ke check-in');
    expect(translate('hinglish', 'A line nobody translated.')).toBe('A line nobody translated.');
    expect(translate('en', 'Today')).toBe('Today');
  });

  it('fills {values}, in either language', () => {
    expect(translate('en', '{done} of {total} done', { done: 2, total: 6 })).toBe('2 of 6 done');
    expect(translate('hinglish', '{done} of {total} done', { done: 2, total: 6 })).toBe('6 mein se 2 ho gaye');
    expect(translate('hinglish', 'This month {amount}', { amount: '₹4,500' })).toBe('Is mahine ₹4,500');
    expect(fill('Hi {name}, {missing}', { name: 'Ravi' })).toBe('Hi Ravi, {missing}');
  });

  it('the owner’s own examples read as asked', () => {
    expect(HINGLISH['+ Add member']).toBe('+ Member jodo');
    expect(HINGLISH['Price (₹)']).toBe('Plan ka daam (₹)');
  });
});
