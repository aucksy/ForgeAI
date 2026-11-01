/**
 * English or Hinglish (owner, 1 Nov 2026): the owner's first-day screens can read in Hinglish, the
 * way Indian gym owners type on WhatsApp ("Aaj ke check-in", "Member jodo"). Hindi words in Latin
 * letters only; never Devanagari.
 *
 * `t('English words')` returns the Hinglish line from hinglish.ts when Hinglish is on and the line is
 * there, and the English otherwise. So a screen not translated yet simply stays English. Values go in
 * as `{name}`: `t('{done} of {total} done', { done: 2, total: 6 })`.
 *
 * The choice is kept on this device (localStorage, like the Dark | Light switch). Screens follow a
 * switch because the app's root calls `useLang()` and draws again.
 */

import { useSyncExternalStore } from 'react';

import { HINGLISH } from './hinglish';

export type Lang = 'en' | 'hinglish';

export const LANG_KEY = 'forgeai.lang.v1';

type Vars = Record<string, string | number>;

/** The saved choice; English when nothing was saved or storage is blocked. */
export function savedLang(): Lang {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(LANG_KEY) === 'hinglish' ? 'hinglish' : 'en';
  } catch (e) {
    console.warn('[lang] the saved language could not be read; using English', e);
    return 'en';
  }
}

let current: Lang = savedLang();
const listeners = new Set<() => void>();

function markPage(lang: Lang): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'hinglish' ? 'hi-Latn' : 'en';
}
markPage(current);

export function getLang(): Lang {
  return current;
}

/** Switch, save on this device, and redraw every screen that reads the language. */
export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
    console.info('[lang] language set to', lang);
  } catch (e) {
    console.warn('[lang] could not save the language on this device; it lasts until the page closes', e);
  }
  markPage(lang);
  for (const f of listeners) f();
}

function subscribe(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** The language now; a component that calls this draws again on a switch. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => 'en');
}

/** `{name}` in the line, filled in. PURE. */
export function fill(line: string, vars?: Vars): string {
  if (!vars) return line;
  return line.replace(/\{(\w+)\}/g, (whole, k: string) => (k in vars ? String(vars[k]) : whole));
}

/** The line in `lang`; English when there is no Hinglish for it. PURE. */
export function translate(lang: Lang, english: string, vars?: Vars): string {
  const line = lang === 'hinglish' ? (HINGLISH[english] ?? english) : english;
  return fill(line, vars);
}

/** The line in the language chosen on this device. */
export function t(english: string, vars?: Vars): string {
  return translate(current, english, vars);
}
