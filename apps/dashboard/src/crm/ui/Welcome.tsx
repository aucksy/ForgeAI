/**
 * First run — a brand new, empty CRM.
 *
 * Since 14 Oct 2026 (Gym Panel step 1) three doors, the commonest first: SIGN IN with a mobile
 * number and the code the gym owner made; START MY GYM, online from the first minute; and the
 * demo. "Create my gym" no longer makes a gym that lives only in this browser.
 *
 * Two doors, stated plainly: start the demo (a real cloud gym with a join code and
 * a shop, plus sample members in this browser), or set up your own gym, empty. The
 * mobile app's Phase O2 lesson applies exactly here — a real gym owner must never
 * find someone else's fake members in their own roster, so the demo is always an
 * explicit choice and never the default. If the cloud cannot be reached, the
 * sample gym still opens without the shop, so a demo never dies on bad Wi-Fi.
 */

import { useState, type ReactNode } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { ThemeToggle } from './ThemeToggle';
import { SignInForm, StartGymForm } from '../auth/SignInForms';
import { isStartLink, START_PROMISE } from '../logic/trial';
import { useShop } from '../shop/ShopProvider';
import { useCrm } from '../store';
import { Button, Card, ErrorBanner, color, font, radius, space } from './kit';

export function Welcome() {
  // R-97: the direct sign-up link (https://app.mettleup.fit/start) puts "Start my gym" first.
  const startFirst = typeof window !== 'undefined' && isStartLink(window.location.pathname);
  const { loadDemoGym } = useCrm();
  const { startDemo, notice: shopNotice } = useShop();
  const { notice: authNotice } = useAuth();
  const notice = authNotice ?? shopNotice;
  const [busy, setBusy] = useState<'demo' | 'local' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoFailed, setDemoFailed] = useState(false);

  const run = async (which: 'demo' | 'local', fn: () => Promise<void>) => {
    setBusy(which);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (which === 'demo') setDemoFailed(true);
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setBusy(null);
    }
  };

  const signInCard: ReactNode = (
    <Card style={startFirst ? { marginTop: space.lg } : undefined}>
      <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
        {startFirst ? 'Already use MettleUp? Sign in' : 'Sign in'}
      </h2>
      <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
        Your gym already uses MettleUp? Sign in with your mobile number and the code from your gym owner.
      </p>
      <SignInForm />
    </Card>
  );

  const startCard: ReactNode = (
    <div
      style={{
        marginTop: startFirst ? 0 : space.lg,
        // Same inset as the cards around it, so all their text shares one left edge.
        padding: space.xl,
        border: startFirst ? `1px solid ${color.accent}` : `1px dashed ${color.borderStrong}`,
        borderRadius: radius.lg,
      }}
    >
      <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
        {startFirst ? 'Start your gym' : 'New here? Set up your gym'}
      </h2>
      <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink }}>{START_PROMISE}</p>
      <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
        Starts empty. You add your own members and prices.
      </p>
      <StartGymForm />
    </div>
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: color.bg,
        display: 'grid',
        placeItems: 'center',
        padding: space.xl,
      }}
    >
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: space.lg }}>
          <ThemeToggle />
        </div>
        <div style={{ textAlign: 'center', marginBottom: space.xxl }}>
          <div
            style={{
              fontFamily: font.display,
              fontSize: 30,
              fontWeight: 800,
              color: color.ink,
              letterSpacing: -0.5,
            }}
          >
            {/* R-105: a plain text wordmark until the logo is picked (#61). */}
            Mettle<span style={{ color: color.accent }}>Up</span>
          </div>
          <div style={{ marginTop: 2, fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.inkSecondary, letterSpacing: 0.4 }}>
            for Gyms
          </div>
          <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 15, color: color.inkSecondary }}>
            Run your gym: members, renewals, dues and attendance. Plus a shop your members order from in the MettleUp app.
          </p>
        </div>

        {notice && !error && (
          <div
            role="status"
            style={{
              marginBottom: space.lg,
              padding: `${space.md}px ${space.lg}px`,
              borderRadius: radius.md,
              border: `1px solid ${color.borderStrong}`,
              fontFamily: font.body,
              fontSize: 14,
              color: color.inkSecondary,
            }}
          >
            {notice}
          </div>
        )}

        {startFirst ? startCard : signInCard}

        {startFirst ? signInCard : startCard}

        <Card style={{ marginTop: space.lg }}>
          <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
            See it working
          </h2>
          <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            Opens a sample gym with made-up members, payments and a shop. You get a real gym code. A phone with the MettleUp app can join and order, and you see the order here.
          </p>

          {error && (
            <div style={{ marginTop: space.md }}>
              <ErrorBanner>{error}</ErrorBanner>
            </div>
          )}

          <div style={{ marginTop: space.lg }}>
            <Button full disabled={busy !== null} onClick={() => run('demo', startDemo)}>
              {busy === 'demo'
                ? 'Starting your demo gym…'
                : demoFailed
                  ? 'Try again'
                  : 'Start demo'}
            </Button>
          </div>

          {demoFailed && (
            <div style={{ marginTop: space.sm, textAlign: 'center' }}>
              {/* U-A9 (17 Oct 2026): `wrap`. On one line this label is ~430px, so on a 390px phone the
                  whole welcome screen went wider than the phone and its right edge was cut off. */}
              <Button variant="quiet" wrap disabled={busy !== null} onClick={() => run('local', loadDemoGym)}>
                Open the demo without the shop (works without internet)
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
