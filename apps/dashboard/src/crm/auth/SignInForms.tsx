/**
 * The two doors into an online gym: SIGN IN (mobile + your own PIN, or a one-time code the owner
 * made) and START MY GYM (gym name, your name, your mobile, your PIN). One screen each, every field
 * on it at once — fewer steps for owners and desk staff who are not at home with apps.
 */

import { useState, type FormEvent } from 'react';

import { t } from '../lang/lang';
import { rememberNewGym } from '../logic/newGymReady';
import { isStartLink } from '../logic/trial';
import { Button, CheckField, ErrorBanner, TextField, color, font, space } from '../ui/kit';
import { replace } from '../ui/router';
import * as authApi from './api';
import { useAuth } from './AuthProvider';
import { PinFields } from './PinForms';
import { rememberAskPin, shouldOfferPin } from './pinPrompt';
import { authErrorWords, cleanCode, createGymErrorWords, createGymUnsure, FORGOT_PIN_WORDS, newPinError, normalizeMobile } from './signin';
import { TermsWords, TERMS_VERSION } from './TermsGate';

const badPhone = () => t('Type a 10-digit mobile number, like 98290 12345.');

export function SignInForm({ submitLabel, startPhone = '' }: { submitLabel?: string; startPhone?: string }) {
  const { adopt } = useAuth();
  const [phone, setPhone] = useState(startPhone);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ten = normalizeMobile(phone);
    if (!ten) return setError(badPhone());
    if (code.length !== 6) return setError(t('Type your 6-digit PIN, or the code your gym owner gave you.'));
    setBusy(true);
    setError(null);
    try {
      const signed = await authApi.signIn(ten, code);
      // R-117: came in with a one-time code and has no PIN yet: offer one, once, on the next screen.
      if (shouldOfferPin(signed)) rememberAskPin(signed.person.staffId);
      replace('/');
      adopt(signed, { online: true });
    } catch (err) {
      setError(authErrorWords(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <TextField label={t('Your mobile number')} prefix="+91" inputMode="tel" value={phone} onChange={setPhone} placeholder="98290 12345" />
      <TextField
        label={t('PIN (6 digits)')}
        type="password"
        inputMode="numeric"
        value={code}
        onChange={(v) => setCode(cleanCode(v))}
        placeholder="000000"
        hint={t('No PIN yet? Type the one-time code your gym owner gives you (Settings → Staff & sign-in).')}
      />
      {error && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      <div style={{ marginTop: space.lg }}>
        <Button type="submit" full disabled={busy}>
          {busy ? t('Signing in…') : (submitLabel ?? t('Sign in'))}
        </Button>
      </div>
      <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>{t(FORGOT_PIN_WORDS)}</p>
    </form>
  );
}

/** `onSignInInstead`: opens Sign in with this mobile typed in (after a "Create my gym" with no answer). */
export function StartGymForm({ onSignInInstead }: { onSignInInstead?: (phone: string) => void } = {}) {
  const { adopt } = useAuth();
  const [gymName, setGymName] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // R-117: the owner's own PIN, chosen here, so there is always a way back in.
  const [pin, setPin] = useState('');
  const [pinAgain, setPinAgain] = useState('');
  // #38: the owner agrees to the terms online, here, before the gym is made.
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // UAT 1 Nov 2026: no answer from the server: the gym may exist, so offer Sign in before a second try.
  const [unsure, setUnsure] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setUnsure(false);
    const ten = normalizeMobile(phone);
    if (gymName.trim().length < 2) return setError(t('Type your gym’s name.'));
    if (!name.trim()) return setError(t('Type your name.'));
    if (!ten) return setError(badPhone());
    const pinBad = newPinError(pin, pinAgain, ten);
    if (pinBad) return setError(t(pinBad));
    if (!agreed) return setError(t('Tick the box to agree to the terms. Then tap “Create my gym” again.'));
    setBusy(true);
    setError(null);
    try {
      const signed = await authApi.createOnlineGym(gymName, name, ten, TERMS_VERSION, pin);
      // A server without 0034 made the gym but kept no PIN (the panel goes live after 0034, so this
      // is only a safety net): Staff & sign-in offers "Set my PIN" once the server has PINs.
      if (signed.hasPin !== true) console.warn('[ForgeErr] gym_create_online: the PIN was not kept (server before 0034)');
      // Came by the sign-up link (/start): the address becomes the app's own, so a refresh or a
      // bookmark later opens the gym, not the sign-up page.
      if (isStartLink(window.location.pathname)) window.history.replaceState(null, '', '/');
      // Owner, 1 Nov 2026: the gym code and join link are shown once on the next screen (ui/NewGymReady).
      rememberNewGym({ gymId: signed.gymId, name: signed.name, joinCode: signed.joinCode });
      replace('/');
      adopt(signed, { online: true });
    } catch (err) {
      setError(createGymErrorWords(err));
      setUnsure(createGymUnsure(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <TextField label={t('Gym name')} value={gymName} onChange={setGymName} placeholder="Iron Temple Fitness" />
      <TextField label={t('Your name')} value={name} onChange={setName} placeholder="Ramesh Sharma" />
      <TextField
        label={t('Your mobile number')}
        prefix="+91"
        inputMode="tel"
        value={phone}
        onChange={setPhone}
        placeholder="98290 12345"
        hint={t('You sign in with this number on any phone or computer.')}
      />
      <PinFields pin={pin} again={pinAgain} onPin={setPin} onAgain={setPinAgain} />
      <CheckField checked={agreed} onChange={setAgreed}>
        <TermsWords />
      </CheckField>
      {error && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      {unsure && onSignInInstead && (
        <div style={{ marginTop: space.sm }}>
          <Button variant="ghost" full onClick={() => onSignInInstead(normalizeMobile(phone) ?? phone)}>
            {t('Sign in instead')}
          </Button>
        </div>
      )}
      <div style={{ marginTop: space.lg }}>
        {/* UAT 1 Nov 2026: the main button of this form (it was an outline, under a bright "Start demo"). */}
        <Button type="submit" full disabled={busy}>
          {busy ? t('Setting up…') : t('Create my gym')}
        </Button>
      </div>
      <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
        {t('Your members and payments are kept online. They stay safe if a phone or computer breaks.')}
      </p>
    </form>
  );
}
