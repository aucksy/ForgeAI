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

import { useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { ThemeToggle } from './ThemeToggle';
import { SignInForm, StartGymForm } from '../auth/SignInForms';
import { useShop } from '../shop/ShopProvider';
import { useCrm } from '../store';
import { Button, Card, ErrorBanner, color, font, radius, space } from './kit';

export function Welcome() {
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
            FORGE<span style={{ color: color.accent }}>AI</span>
          </div>
          <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 15, color: color.inkSecondary }}>
            {'Run your gym: members, renewals, dues, attendance — and a shop your members order from in the ForgeAI app.'}
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

        <Card>
          <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
            {'Sign in'}
          </h2>
          <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            {'Your gym already uses ForgeAI? Sign in with your mobile number and the code from your gym owner.'}
          </p>
          <SignInForm />
        </Card>

        <div
          style={{
            marginTop: space.lg,
            // Same inset as the cards around it, so all their text shares one left edge.
            padding: space.xl,
            border: `1px dashed ${color.borderStrong}`,
            borderRadius: radius.lg,
          }}
        >
          <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
            {'New here? Set up your gym'}
          </h2>
          <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            {'Starts empty. You add your members and your prices — nothing is made up for you.'}
          </p>
          <StartGymForm />
        </div>

        <Card style={{ marginTop: space.lg }}>
          <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
            {'See it working'}
          </h2>
          <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            {'Opens a sample gym with made-up members, payments and a shop. You get a real gym code, so a phone with the ForgeAI app can join and order — and you see the order here.'}
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
              <Button variant="quiet" disabled={busy !== null} onClick={() => run('local', loadDemoGym)}>
                {'Open the demo without the shop (works offline)'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
