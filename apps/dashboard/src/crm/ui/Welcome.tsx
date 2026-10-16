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
import { LangToggle } from './LangToggle';
import { SignInForm, StartGymForm } from '../auth/SignInForms';
import { useShop } from '../shop/ShopProvider';
import { useCrm } from '../store';
import { tr } from '../i18n';
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
      setError(e instanceof Error ? e.message : tr('Something went wrong. Please try again.', 'Kuch gadbad hui. Phir se try karo.'));
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
          <LangToggle />
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
            {tr(
              'Run your gym: members, renewals, dues, attendance — and a shop your members order from in the ForgeAI app.',
              'Apna gym chalao: members, renew, fees baaki, hazri — aur ek shop jahan se members ForgeAI app mein order karte hain.',
            )}
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
            {tr('Sign in', 'Sign in karo')}
          </h2>
          <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            {tr(
              'Your gym already uses ForgeAI? Sign in with your mobile number and the code from your gym owner.',
              'Aapka gym pehle se ForgeAI par hai? Apne Mobile number aur gym owner ke diye Code se sign in karein.',
            )}
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
            {tr('New here? Set up your gym', 'Naye hain? Apna gym banao')}
          </h2>
          <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            {tr(
              'Starts empty. You add your members and your prices — nothing is made up for you.',
              'Khaali shuru hota hai. Aap apne members aur daam khud daalte hain — kuch bhi apne aap nahi banta.',
            )}
          </p>
          <StartGymForm />
        </div>

        <Card style={{ marginTop: space.lg }}>
          <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
            {tr('See it working', 'Chalta hua dekho')}
          </h2>
          <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            {tr(
              'Opens a sample gym with made-up members, payments and a shop. You get a real join code, so a phone with the ForgeAI app can join and order — and you see the order here.',
              'Ek Demo gym khulega — nakli members, payments aur ek shop ke saath. Aapko asli join Code milega, toh ForgeAI app wala phone join karke order kar sakta hai — aur order aapko yahan dikhega.',
            )}
          </p>

          {error && (
            <div style={{ marginTop: space.md }}>
              <ErrorBanner>{error}</ErrorBanner>
            </div>
          )}

          <div style={{ marginTop: space.lg }}>
            <Button full disabled={busy !== null} onClick={() => run('demo', startDemo)}>
              {busy === 'demo'
                ? tr('Starting your demo gym…', 'Demo gym shuru ho raha hai…')
                : demoFailed
                  ? tr('Try again', 'Phir se try karo')
                  : tr('Start demo', 'Demo shuru karo')}
            </Button>
          </div>

          {demoFailed && (
            <div style={{ marginTop: space.sm, textAlign: 'center' }}>
              <Button variant="quiet" disabled={busy !== null} onClick={() => run('local', loadDemoGym)}>
                {tr('Open the demo without the shop (works offline)', 'Shop ke bina demo kholo (bina internet chalega)')}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
