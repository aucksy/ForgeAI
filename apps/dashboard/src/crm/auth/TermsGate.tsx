/**
 * #38 (24 Oct 2026): an existing gym's owner is asked ONCE to agree to the MettleUp terms and the
 * data agreement, the next time they open the admin app signed in. Until they tick the box and
 * press "Agree and continue", the owner sees only this card (or can sign out). Front-desk staff are
 * never asked (the business agrees through its owner). On a server without 0033 nothing is asked.
 *
 * While the check runs (at most CHECK_WAIT_MS) a small "Opening your gym" line shows, so the panel
 * never flashes up and is then covered. When the check fails or takes longer (no internet: a front
 * desk must still work), the failure is logged, the panel opens, and the check runs again the next
 * time the app opens (and late answers still bring the card up). Old admin apps that never ask are
 * not refused by the server (0033 accepts a gym made without a version); its owner is asked once the
 * new app is open.
 *
 * The answer also feeds Settings -> Your data ("You accepted the terms on ... (version ...)").
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { Button, Card, CheckField, ErrorBanner, SectionTitle, color, font, space } from '../ui/kit';
import { useAuth } from './AuthProvider';
import { authErrorWords } from './signin';
import { acceptTerms, DATA_AGREEMENT_URL, getTerms, needsTerms, TERMS_URL, TERMS_VERSION, type TermsState } from './terms';

export { TERMS_VERSION } from './terms';

/** "I agree to the MettleUp terms and the data agreement", with both links (they open a new tab). */
export function TermsWords() {
  const link = { color: color.accentBright, textDecoration: 'underline' } as const;
  return (
    <>
      I agree to the MettleUp{' '}
      <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" style={link}>
        terms
      </a>{' '}
      and the{' '}
      <a href={DATA_AGREEMENT_URL} target="_blank" rel="noopener noreferrer" style={link}>
        data agreement
      </a>
      .
    </>
  );
}

const TermsContext = createContext<TermsState | null>(null);

/** How long the panel waits for the answer before opening anyway (offline desks). */
export const CHECK_WAIT_MS = 4000;

/** What this gym accepted (null: not known, a browser-only gym, or a server without 0033). */
export function useTerms(): TermsState | null {
  return useContext(TermsContext);
}

export function TermsGate({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth();
  const key = session?.online && session.person ? session.ownerKey : null;
  const [state, setState] = useState<TermsState | null>(null);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  /** The key whose check has finished OR waited long enough: the panel may show. */
  const [readyFor, setReadyFor] = useState<string | null>(null);

  useEffect(() => {
    if (!key) {
      setState(null);
      setCheckedFor(null);
      setReadyFor(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      if (live) setReadyFor(key);
    }, CHECK_WAIT_MS);
    getTerms(key)
      .then((s) => {
        if (live) setState(s);
      })
      .catch((e: unknown) => {
        // Offline or a hiccup: the desk is never blocked; the check runs again next time the app opens.
        console.warn('[ForgeErr] owner_terms: not checked this time, asked again next open', e);
        if (live) setState(null);
      })
      .finally(() => {
        if (!live) return;
        window.clearTimeout(timer);
        setCheckedFor(key);
        setReadyFor(key);
      });
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [key]);

  const accepted = useCallback((s: TermsState) => setState(s), []);

  if (key && checkedFor === key && needsTerms(state)) {
    return <AskTerms sessionKey={key} onAccepted={accepted} onSignOut={() => void signOut()} />;
  }
  if (key && readyFor !== key) {
    return (
      <main role="status" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: color.bg, color: color.inkSecondary, fontFamily: font.body }}>
        Opening your gym…
      </main>
    );
  }
  return <TermsContext.Provider value={state}>{children}</TermsContext.Provider>;
}

function AskTerms({ sessionKey, onAccepted, onSignOut }: { sessionKey: string; onAccepted: (s: TermsState) => void; onSignOut: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agree = async () => {
    if (!agreed) return setError('Tick the box first. Then tap “Agree and continue”.');
    setBusy(true);
    setError(null);
    try {
      onAccepted(await acceptTerms(sessionKey, TERMS_VERSION));
    } catch (e) {
      console.warn('[ForgeErr] owner_accept_terms', e);
      setError(authErrorWords(e));
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: space.lg, background: color.bg, color: color.ink }}>
      <div style={{ maxWidth: 480, width: '100%' }}>
        <Card>
          <SectionTitle>Before you go on</SectionTitle>
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, lineHeight: 1.5, color: color.inkSecondary }}>
            Please read and accept the MettleUp terms and the data agreement. They say how MettleUp keeps your gym’s
            records and your members’ details safe. You do this once. Your staff are not asked.
          </p>
          <CheckField checked={agreed} onChange={setAgreed}>
            <TermsWords />
          </CheckField>
          {error && (
            <div style={{ marginTop: space.md }}>
              <ErrorBanner>{error}</ErrorBanner>
            </div>
          )}
          <div style={{ marginTop: space.lg, display: 'grid', gap: space.sm }}>
            <Button full disabled={busy} onClick={() => void agree()}>
              {busy ? 'Saving…' : 'Agree and continue'}
            </Button>
            <Button full variant="quiet" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
