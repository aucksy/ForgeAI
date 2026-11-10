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
import { LangToggle } from './LangToggle';
import { t } from '../lang/lang';
import { SignInForm, StartGymForm } from '../auth/SignInForms';
import { isStartLink, START_PROMISE } from '../logic/trial';
import { useShop } from '../shop/ShopProvider';
import { useCrm } from '../store';
import { Button, Card, ErrorBanner, color, font, radius, space } from './kit';
import { SupportLine } from './SupportLine';
import { SteelLockup } from '../../components/SteelLockup';

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
  // UAT B-11 (30 Oct 2026): staff who only sign in scrolled past the whole set-up form. Two tabs, one form at a time.
  const [tab, setTab] = useState<'signin' | 'start'>(startFirst ? 'start' : 'signin');
  // UAT 1 Nov 2026: "Create my gym" got no answer: Sign in opens with the mobile already typed.
  const [signInPhone, setSignInPhone] = useState('');

  const run = async (which: 'demo' | 'local', fn: () => Promise<void>) => {
    setBusy(which);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (which === 'demo') setDemoFailed(true);
      setError(e instanceof Error ? e.message : t('Something went wrong. Please try again.'));
      setBusy(null);
    }
  };

  const signInCard: ReactNode = (
    <Card>
      <SignInForm
        key={signInPhone}
        startPhone={signInPhone}
        heading={
          <>
            <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
              {t('Sign in')}
            </h2>
            <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
              {t('Sign in with your mobile number and your 6-digit PIN.')}
            </p>
          </>
        }
      />
    </Card>
  );

  const startCard: ReactNode = (
    <div
      style={{
        // Same inset as the cards around it, so all their text shares one left edge.
        padding: space.xl,
        border: startFirst ? `1px solid ${color.accent}` : `1px dashed ${color.borderStrong}`,
        borderRadius: radius.lg,
      }}
    >
      <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
        {startFirst ? t('Start your gym') : t('New here? Set up your gym')}
      </h2>
      <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink }}>{t(START_PROMISE)}</p>
      <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
        {t('Starts empty. You add your own members and prices.')}
      </p>
      <StartGymForm
        onSignInInstead={(phone) => {
          setSignInPhone(phone);
          setTab('signin');
        }}
      />
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
        {/* 1 Nov 2026: English | Hinglish beside Dark | Light; both wrap under each other on a narrow phone. */}
        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg }}>
          <LangToggle />
          <ThemeToggle />
        </div>
        <div style={{ textAlign: 'center', marginBottom: space.xxl }}>
          {/* R-259: the steel-plate lockup (mark + name), 48 px: the name's cap height is 21 px. */}
          <h1 style={{ margin: 0, display: 'flex', justifyContent: 'center' }}>
            <SteelLockup height={56} />
          </h1>
          <div style={{ marginTop: 2, fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.inkSecondary, letterSpacing: 0.4 }}>
            {t('for Gyms')}
          </div>
          <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 15, color: color.inkSecondary }}>
            {t('Run your gym: members, renewals, dues and attendance. Plus a shop your members order from in the MettleUp app.')}
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

        {/* R-447 (10 Nov 2026): two equal tabs side by side let an owner with a gym tap "Set up a new gym" by
            mistake. Sign in is the one form and the one bright button; the other door is a quiet line under it. */}
        {tab === 'start' ? startCard : signInCard}
        <OtherDoor
          question={tab === 'start' ? t('Already use MettleUp?') : t('New to MettleUp?')}
          label={tab === 'start' ? t('Sign in') : t('Set up a new gym')}
          onClick={() => {
            setTab(tab === 'start' ? 'signin' : 'start');
            // The other form starts at the top of the page, not where the finger was.
            window.scrollTo({ top: 0 });
          }}
        />

        <Card style={{ marginTop: space.lg }}>
          <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
            {t('See it working')}
          </h2>
          <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            {t('Opens a sample gym with made-up members, payments and a shop. You get a real gym code. A phone with the MettleUp app can join and order, and you see the order here.')}
          </p>

          {error && (
            <div style={{ marginTop: space.md }}>
              <ErrorBanner>{error}</ErrorBanner>
            </div>
          )}

          <div style={{ marginTop: space.lg }}>
            {/* R-447: never bright. The bright button on this page is "Sign in" (or "Create my gym"). */}
            <Button full variant="ghost" disabled={busy !== null} onClick={() => run('demo', startDemo)}>
              {busy === 'demo'
                ? t('Starting your demo gym…')
                : demoFailed
                  ? t('Try again')
                  : t('Start demo')}
            </Button>
          </div>

          {demoFailed && (
            <div style={{ marginTop: space.sm, textAlign: 'center' }}>
              {/* U-A9 (17 Oct 2026): `wrap`. On one line this label is ~430px, so on a 390px phone the
                  whole welcome screen went wider than the phone and its right edge was cut off. */}
              <Button variant="quiet" wrap disabled={busy !== null} onClick={() => run('local', loadDemoGym)}>
                {t('Open the demo without the shop. It works without internet.')}
              </Button>
            </div>
          )}
        </Card>

        {/* Launch audit 3 Nov 2026: a locked-out owner can reach MettleUp from the first screen. */}
        <SupportLine center />
      </div>
    </div>
  );
}

/** R-447: the way to the other form, set apart under a line: "New to MettleUp?" -> "Set up a new gym". */
function OtherDoor({ question, label, onClick }: { question: string; label: string; onClick: () => void }) {
  const line = <span aria-hidden style={{ flex: 1, height: 1, background: color.border }} />;
  return (
    <div style={{ marginTop: space.lg, display: 'grid', justifyItems: 'center', gap: space.xs }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.md, width: '100%' }}>
        {line}
        <span style={{ fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>{question}</span>
        {line}
      </div>
      <button
        type="button"
        onClick={onClick}
        style={{
          appearance: 'none',
          minHeight: 44,
          padding: `0 ${space.md}px`,
          border: 'none',
          background: 'transparent',
          color: color.accentBright,
          fontFamily: font.body,
          fontSize: 15,
          fontWeight: 700,
          textDecoration: 'underline',
          textUnderlineOffset: 3,
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    </div>
  );
}
