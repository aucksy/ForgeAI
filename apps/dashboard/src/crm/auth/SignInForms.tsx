/**
 * The two doors into an online gym: SIGN IN (mobile + the code the owner made) and START MY GYM
 * (gym name, your name, your mobile). One screen each, every field on it at once — fewer steps
 * for owners and desk staff who are not at home with apps.
 */

import { useState, type FormEvent } from 'react';

import { isStartLink } from '../logic/trial';
import { Button, CheckField, ErrorBanner, TextField, color, font, space } from '../ui/kit';
import { replace } from '../ui/router';
import * as authApi from './api';
import { useAuth } from './AuthProvider';
import { authErrorWords, cleanCode, normalizeMobile } from './signin';
import { TermsWords, TERMS_VERSION } from './TermsGate';

const badPhone = () => 'Type a 10-digit mobile number, like 98290 12345.';

export function SignInForm({ submitLabel = 'Sign in' }: { submitLabel?: string }) {
  const { adopt } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ten = normalizeMobile(phone);
    if (!ten) return setError(badPhone());
    if (code.length !== 6) return setError('Type the 6-digit code your gym owner gave you.');
    setBusy(true);
    setError(null);
    try {
      const signed = await authApi.signIn(ten, code);
      replace('/');
      adopt(signed, { online: true });
    } catch (err) {
      setError(authErrorWords(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <TextField label="Your mobile number" prefix="+91" inputMode="tel" value={phone} onChange={setPhone} placeholder="98290 12345" />
      <TextField
        label="Sign-in code (6 digits)"
        inputMode="numeric"
        value={code}
        onChange={(v) => setCode(cleanCode(v))}
        placeholder="000000"
        hint="Your gym owner makes this code in Settings → Staff & sign-in."
      />
      {error && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      <div style={{ marginTop: space.lg }}>
        <Button type="submit" full disabled={busy}>
          {busy ? 'Signing in…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function StartGymForm() {
  const { adopt } = useAuth();
  const [gymName, setGymName] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // #38: the owner agrees to the terms online, here, before the gym is made.
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ten = normalizeMobile(phone);
    if (gymName.trim().length < 2) return setError('Type your gym’s name.');
    if (!name.trim()) return setError('Type your name.');
    if (!ten) return setError(badPhone());
    if (!agreed) return setError('Tick the box to agree to the terms. Then tap “Create my gym” again.');
    setBusy(true);
    setError(null);
    try {
      const signed = await authApi.createOnlineGym(gymName, name, ten, TERMS_VERSION);
      // Came by the sign-up link (/start): the address becomes the app's own, so a refresh or a
      // bookmark later opens the gym, not the sign-up page.
      if (isStartLink(window.location.pathname)) window.history.replaceState(null, '', '/');
      replace('/');
      adopt(signed, { online: true });
    } catch (err) {
      setError(authErrorWords(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <TextField label="Gym name" value={gymName} onChange={setGymName} placeholder="Iron Temple Fitness" />
      <TextField label="Your name" value={name} onChange={setName} placeholder="Ramesh Sharma" />
      <TextField
        label="Your mobile number"
        prefix="+91"
        inputMode="tel"
        value={phone}
        onChange={setPhone}
        placeholder="98290 12345"
        hint="You sign in with this number on any phone or computer."
      />
      <CheckField checked={agreed} onChange={setAgreed}>
        <TermsWords />
      </CheckField>
      {error && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      <div style={{ marginTop: space.lg }}>
        <Button type="submit" variant="ghost" full disabled={busy}>
          {busy ? 'Setting up…' : 'Create my gym'}
        </Button>
      </div>
      <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
        Your members and payments are kept online. They stay safe if a phone or computer breaks.
      </p>
    </form>
  );
}
