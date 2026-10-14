/**
 * English | Hinglish (14 Oct 2026; Gym Panel step 2). Owners in Jaipur read Hinglish in Latin
 * letters more easily than English, so every word on screen has both, side by side in the code:
 *
 *   tr('Add member', 'Naya member jodo')
 *
 * One call, both languages, no keys to keep in step. `tr` works everywhere — in a component, in
 * a plain function that builds a sentence, in an error message. Switching the language redraws the
 * screens (CrmApp keys its routes on the language), so every `tr` is read again; the gym's records,
 * sign-in and shop stay loaded. An open form loses its typing, fine for a switch flipped once.
 *
 * The words follow the glossary and rules in Audit/crm-research/RESEARCH.md §5: the same word for
 * the same thing everywhere; keep the English words owners already use (Due, Fees, Plan, Renew,
 * Receipt, Enquiry, Batch, PT, UPI, Cash); verbs on buttons ("Fees lo", "Renew karo"); polite
 * "aap" in messages to members; Indian number grouping.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'hi';

export const LANG_KEY = 'forgeai.lang.v1';

let current: Lang = 'en';

function readSaved(): Lang {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(LANG_KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

/** The panel's language right now. */
export function currentLang(): Lang {
  return current;
}

/** For tests and the provider: set the language every `tr` reads. */
export function setCurrentLang(lang: Lang): void {
  current = lang;
}

/**
 * Run `fn` with English words, whatever the panel shows: for downloads (CSV) an accountant opens,
 * which must read the same in every language.
 */
export function inEnglish<T>(fn: () => T): T {
  const was = current;
  current = 'en';
  try {
    return fn();
  } finally {
    current = was;
  }
}

/** The words in the panel's language: English first, Hinglish second. */
export function tr(en: string, hi: string): string {
  return current === 'hi' ? hi : en;
}

interface LangValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LangContext = createContext<LangValue>({ lang: 'en', setLang: () => undefined });

export function useLang(): LangValue {
  return useContext(LangContext);
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = readSaved();
    current = saved;
    if (typeof document !== 'undefined') document.documentElement.lang = saved === 'hi' ? 'hi-Latn' : 'en';
    return saved;
  });
  const setLang = useCallback((next: Lang) => {
    current = next;
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // quiet: a private window cannot save it; the choice still lasts until the page closes.
    }
    document.documentElement.lang = next === 'hi' ? 'hi-Latn' : 'en';
    setLangState(next);
  }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return (
    <LangContext.Provider value={value}>
      {children}
    </LangContext.Provider>
  );
}
