/**
 * F187 (R-383): "Forgot your PIN?" by WhatsApp. Two steps on one card:
 *  1. Your mobile number -> "Send code on WhatsApp". The answer is the same for every number ("If this
 *     number has an account, a code is on its way"), so nobody learns who has an account.
 *  2. The 6-digit code + a new PIN (twice) -> "Set new PIN and sign in": the Worker checks the code and gives
 *     a proof, the gym server checks the proof and sets the PIN (0061), then the normal sign-in runs.
 * Shown only while the WhatsApp way is switched on (usePhoneCodeAvailable); otherwise Sign in keeps its
 * old "ask your gym owner" words.
 */

import { useEffect, useState, type FormEvent } from 'react';

import { t } from '../lang/lang';
import { Button, ErrorBanner, TextField, color, font, space } from '../ui/kit';
import { replace } from '../ui/router';
import * as authApi from './api';
import { useAuth } from './AuthProvider';
import { PinFields } from './PinForms';
import { PhoneCodeFailure, phoneCodeAvailable, phoneCodeWords, resetPinWithProof, sendPhoneCode, verifyPhoneCode } from './phoneCode';
import { authErrorWords, cleanCode, formatMobile, newPinError, normalizeMobile } from './signin';

/** Is the WhatsApp code switched on? false until the Worker says yes (asked once per screen). */
export function usePhoneCodeAvailable(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void phoneCodeAvailable().then((v) => {
      if (live) setOn(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return on;
}

/** A box people never see; a bot that fills every box fills it too (the Worker then drops the ask). */
export function BotTrap({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      name="website"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ position: 'absolute', left: -10000, top: 'auto', width: 1, height: 1, opacity: 0 }}
    />
  );
}

const note = { margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary } as const;

export function ForgotPinForm({ startPhone = '', onBack }: { startPhone?: string; onBack: () => void }) {
  const { adopt } = useAuth();
  const [phone, setPhone] = useState(startPhone);
  const [trap, setTrap] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    const ten = normalizeMobile(phone);
    if (!ten) return setError(t('Type a 10-digit mobile number, like 98290 12345.'));
    setBusy(true);
    setError(null);
    try {
      await sendPhoneCode(ten, 'pin');
      setSentTo(ten);
      setCode('');
      setProof(null);
    } catch (e) {
      setError(phoneCodeWords(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!sentTo) return;
    if (!proof && code.length !== 6) return setError(t('Type the 6-digit code from WhatsApp.'));
    const pinBad = newPinError(pin, again, sentTo);
    if (pinBad) return setError(t(pinBad));
    setBusy(true);
    setError(null);
    try {
      // A refused PIN (too easy) keeps the proof, so the code is not asked for again.
      const p = proof ?? (await verifyPhoneCode(sentTo, 'pin', code));
      setProof(p);
      await resetPinWithProof(p, pin);
      const signed = await authApi.signIn(sentTo, pin);
      replace('/');
      adopt(signed, { online: true });
    } catch (e) {
      if (e instanceof PhoneCodeFailure) {
        if (e.code === 'WRONG_CODE' && proof) setProof(null);
        setError(phoneCodeWords(e));
      } else {
        setError(authErrorWords(e));
      }
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void (sentTo ? finish() : ask());
  };

  return (
    <form onSubmit={submit} noValidate aria-label={t('Forgot your PIN?')}>
      <h3 style={{ margin: `${space.md}px 0 0`, fontFamily: font.display, fontSize: 16, fontWeight: 600, color: color.ink }}>{t('Forgot your PIN?')}</h3>
      {!sentTo ? (
        <>
          <p style={note}>{t('We send a 6-digit code to your mobile number on WhatsApp. Then you choose a new PIN.')}</p>
          <TextField label={t('Your mobile number')} prefix="+91" inputMode="tel" value={phone} onChange={setPhone} placeholder="98290 12345" />
          <BotTrap value={trap} onChange={setTrap} />
        </>
      ) : (
        <>
          <p role="status" style={note}>
            {t('If {phone} has an account, a code is on its way on WhatsApp. It works for 10 minutes.', { phone: `+91 ${formatMobile(sentTo)}` })}
          </p>
          {!proof && (
            <TextField
              label={t('Code from WhatsApp')}
              inputMode="numeric"
              value={code}
              onChange={(v) => setCode(cleanCode(v))}
              placeholder="000000"
            />
          )}
          <PinFields pin={pin} again={again} onPin={setPin} onAgain={setAgain} label={t('Choose a new 6-digit PIN')} />
        </>
      )}
      {error && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      <div style={{ marginTop: space.lg }}>
        <Button type="submit" full disabled={busy}>
          {busy ? t('Please wait…') : sentTo ? t('Set new PIN and sign in') : t('Send code on WhatsApp')}
        </Button>
      </div>
      {sentTo && !proof && (
        <div style={{ marginTop: space.sm }}>
          <Button variant="quiet" full disabled={busy} onClick={() => void ask()}>
            {t('Send a new code')}
          </Button>
        </div>
      )}
      <div style={{ marginTop: space.sm }}>
        <Button variant="ghost" full disabled={busy} onClick={onBack}>
          {t('Back to sign in')}
        </Button>
      </div>
    </form>
  );
}
