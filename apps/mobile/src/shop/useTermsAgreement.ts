/**
 * D7 (owner, 10 Nov 2026, "all as recommended"): the "I'm 18 or older, and I agree to MettleUp's terms
 * and privacy notice" box before "Continue with Google" (welcome screen, Settings → Backup and restore).
 *
 * Remembered on this phone once ticked (joinTerms.ts AGREED_KEY, in `meta`): a member who ticked it once,
 * here or when joining a gym, is not asked again at every sign-in. Ticking saves it at once, so the box
 * also counts when the member then leaves the screen; unticking takes it back. Whether the box shows is
 * decided once per visit, from what is saved when the screen opens: it never vanishes under the finger.
 * A read that fails shows the box (asking again is the safe side).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { getMeta, setMeta } from '@/db';

import { agreementKept, agreementRecord, AGREED_KEY, signInAgreementWords } from './joinTerms';

/** Is the tick saved on this phone? Never throws (a failed read counts as no). */
export async function readTermsAgreed(): Promise<boolean> {
  try {
    return agreementKept(await getMeta(AGREED_KEY));
  } catch (e) {
    console.warn('[terms] could not read the saved tick', e);
    return false;
  }
}

/** Save the tick (or take it back). Never throws: the sign-in itself does not depend on the save. */
export async function saveTermsAgreed(agreed: boolean): Promise<void> {
  try {
    await setMeta(AGREED_KEY, agreed ? agreementRecord(Date.now()) : '');
  } catch (e) {
    console.warn('[terms] could not save the tick', e);
  }
}

export interface TermsAgreement {
  /** Show the box on this visit (null while the saved tick is still being read: show nothing yet). */
  ask: boolean | null;
  ticked: boolean;
  tick: (v: boolean) => void;
  /** Before Google's sign-in: null = go on; otherwise the line to show (the box was not ticked). */
  check: () => Promise<string | null>;
}

export function useTermsAgreement(): TermsAgreement {
  const [ask, setAsk] = useState<boolean | null>(null);
  const [ticked, setTicked] = useState(false);
  const askRef = useRef<boolean | null>(null);
  const tickedRef = useRef(false);

  useEffect(() => {
    let live = true;
    void readTermsAgreed().then((kept) => {
      if (!live || askRef.current != null) return;
      askRef.current = !kept;
      setAsk(!kept);
    });
    return () => {
      live = false;
    };
  }, []);

  const tick = useCallback((v: boolean) => {
    tickedRef.current = v;
    setTicked(v);
    void saveTermsAgreed(v);
  }, []);

  const check = useCallback(async (): Promise<string | null> => {
    // A tap before the saved tick was read: read it now, and show the box if it is needed.
    if (askRef.current == null) {
      const kept = await readTermsAgreed();
      askRef.current = !kept;
      setAsk(!kept);
    }
    const words = signInAgreementWords({ kept: askRef.current === false, ticked: tickedRef.current });
    if (words == null && askRef.current) await saveTermsAgreed(true);
    return words;
  }, []);

  return { ask, ticked, tick, check };
}
