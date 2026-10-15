/**
 * The two doors into an online gym: SIGN IN (mobile + the code the owner made) and START MY GYM
 * (gym name, your name, your mobile). One screen each, every field on it at once — fewer steps
 * for owners and desk staff who are not at home with apps.
 */

import { useState, type FormEvent } from 'react';

import { tr } from '../i18n';
import { Button, ErrorBanner, TextField, color, font, space } from '../ui/kit';
import { replace } from '../ui/router';
import * as authApi from './api';
import { useAuth } from './AuthProvider';
import { authErrorWords, cleanCode, normalizeMobile } from './signin';

const badPhone = () => tr('Type a 10-digit mobile number, like 98290 12345.', '10 digit ka mobile number likho, jaise 98290 12345.');

export function SignInForm({ submitLabel = tr('Sign in', 'Sign in') }: { submitLabel?: string }) {
  const { adopt } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ten = normalizeMobile(phone);
    if (!ten) return setError(badPhone());
    if (code.length !== 6) return setError(tr('Type the 6-digit code your gym owner gave you.', 'Gym owner ka diya 6 digit ka code likho.'));
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
      <TextField label={tr('Your mobile number', 'Aapka mobile number')} prefix="+91" inputMode="tel" value={phone} onChange={setPhone} placeholder="98290 12345" />
      <TextField
        label={tr('Sign-in code (6 digits)', 'Sign-in code (6 digit)')}
        inputMode="numeric"
        value={code}
        onChange={(v) => setCode(cleanCode(v))}
        placeholder="000000"
        hint={tr('Your gym owner makes this code in Settings → Staff & sign-in.', 'Gym owner yeh code settings → Staff ka login mein banata hai.')}
      />
      {error && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      <div style={{ marginTop: space.lg }}>
        <Button type="submit" full disabled={busy}>
          {busy ? tr('Signing in…', 'Sign in ho raha hai…') : submitLabel}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ten = normalizeMobile(phone);
    if (gymName.trim().length < 2) return setError(tr('Type your gym’s name.', 'Apne gym ka naam likho.'));
    if (!name.trim()) return setError(tr('Type your name.', 'Apna naam likho.'));
    if (!ten) return setError(badPhone());
    setBusy(true);
    setError(null);
    try {
      const signed = await authApi.createOnlineGym(gymName, name, ten);
      replace('/');
      adopt(signed, { online: true });
    } catch (err) {
      setError(authErrorWords(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <TextField label={tr('Gym name', 'Gym ka naam')} value={gymName} onChange={setGymName} placeholder="Iron Temple Fitness" />
      <TextField label={tr('Your name', 'Aapka naam')} value={name} onChange={setName} placeholder="Ramesh Sharma" />
      <TextField
        label={tr('Your mobile number', 'Aapka mobile number')}
        prefix="+91"
        inputMode="tel"
        value={phone}
        onChange={setPhone}
        placeholder="98290 12345"
        hint={tr('You sign in with this number on any phone or computer.', 'Is number se aap kisi bhi phone ya computer par sign in kar sakte hain.')}
      />
      {error && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      <div style={{ marginTop: space.lg }}>
        <Button type="submit" variant="ghost" full disabled={busy}>
          {busy ? tr('Setting up…', 'Ban raha hai…') : tr('Create my gym', 'Mera gym banao')}
        </Button>
      </div>
      <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
        {tr('Your records are kept online, safe if a phone or computer breaks.', 'Aapke records online rehte hain, phone ya computer kharab ho to bhi safe.')}
      </p>
    </form>
  );
}
