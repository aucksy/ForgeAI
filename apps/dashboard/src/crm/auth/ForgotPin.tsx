/**
 * F187 (R-383): "Forgot your PIN?" by WhatsApp. Two steps on one card:
 *  1. Your mobile number -> "Send code on WhatsApp". The answer is the same for every number ("If this
 *     number has an account, a code is on its way"), so nobody learns who has an account.
 *  2. The 6-digit code + a new PIN (twice) -> "Set new PIN and sign in": the Worker checks the code and gives
 *     a proof, the gym server checks the proof and sets the PIN (0061), then the normal sign-in runs.
 * Shown only while the WhatsApp way is switched on (usePhoneCodeAvailable); otherwise Sign in keeps its
 * old "ask your gym owner" words.
 *
 * 8 Nov 2026: while "Verify with WhatsApp" is on (mode 'inbound', WhatsAppVerify.tsx) the card is: the number ->
 * the green button -> the person sends us one WhatsApp message -> "Number checked" -> a new PIN. The code form
 * stays for the old way, hidden while inbound is on.
 */

import { useEffect, useState, type FormEvent } from 'react';

import { t } from '../lang/lang';
import { Button, ErrorBanner, TextField, color, font, space, useIsCompact } from '../ui/kit';
import { replace } from '../ui/router';
import * as authApi from './api';
import { useAuth } from './AuthProvider';
import { PinFields } from './PinForms';
import { PhoneCodeFailure, phoneCodeMode, phoneCodeWords, resetPinWithProof, sendPhoneCode, verifyPhoneCode, type PhoneCodeMode } from './phoneCode';
import { authErrorWords, CHECK_RAN_OUT, cleanCode, formatMobile, newPinError, normalizeMobile } from './signin';
import { NumberChecked, SameNumberNote, WhatsAppButton, WhatsAppSteps, WhatsAppWaiting, beginInbound, inboundWords, type Begun } from './WhatsAppVerify';

/** Which WhatsApp way is on: 'off' until the Worker says otherwise (asked once per screen). */
export function usePhoneCodeMode(): PhoneCodeMode {
  const [mode, setMode] = useState<PhoneCodeMode>('off');
  useEffect(() => {
    let live = true;
    void phoneCodeMode()
      .then((v) => {
        if (live) setMode(v);
      })
      .catch((e: unknown) => console.warn('[phone-code] status check failed', e));
    return () => {
      live = false;
    };
  }, []);
  return mode;
}

/** Is the WhatsApp code switched on? false until the Worker says yes (asked once per screen). */
export function usePhoneCodeAvailable(): boolean {
  return usePhoneCodeMode() !== 'off';
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

export function ForgotPinForm({ startPhone = '', onBack, mode = 'send' }: { startPhone?: string; onBack: () => void; mode?: PhoneCodeMode }) {
  if (mode === 'inbound') return <ForgotPinInbound startPhone={startPhone} onBack={onBack} />;
  return <ForgotPinByCode startPhone={startPhone} onBack={onBack} />;
}

/** "Verify with WhatsApp": the person sends us one message; then a new PIN. */
function ForgotPinInbound({ startPhone, onBack }: { startPhone: string; onBack: () => void }) {
  const { adopt } = useAuth();
  const phoneScreen = useIsCompact();
  const [phone, setPhone] = useState(startPhone);
  const [trap, setTrap] = useState('');
  const [begun, setBegun] = useState<Begun | null>(null);
  const [checked, setChecked] = useState<{ ten: string; proof: string } | null>(null);
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    const ten = normalizeMobile(phone);
    if (!ten) return setError(t('Type a 10-digit mobile number, like 98290 12345.'));
    setBusy(true);
    setError(null);
    try {
      setBegun(await beginInbound(ten, 'pin', phoneScreen, trap));
    } catch (e) {
      setBegun(null);
      setError(inboundWords(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!checked) return;
    const pinBad = newPinError(pin, again, checked.ten);
    if (pinBad) return setError(t(pinBad));
    setBusy(true);
    setError(null);
    try {
      await resetPinWithProof(checked.proof, pin);
      const signed = await authApi.signIn(checked.ten, pin);
      replace('/');
      adopt(signed, { online: true });
    } catch (e) {
      if (e instanceof PhoneCodeFailure && e.code === 'WRONG_CODE') {
        // The gym server did not take the proof (used, or too old): check the number again.
        setChecked(null);
        setBegun(null);
        setError(t(CHECK_RAN_OUT));
      } else {
        setError(e instanceof PhoneCodeFailure ? phoneCodeWords(e) : authErrorWords(e));
      }
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (checked) void save();
    else if (!begun) void verify();
  };

  return (
    <form onSubmit={submit} noValidate aria-label={t('Forgot your PIN?')}>
      <h3 style={{ margin: `${space.md}px 0 0`, fontFamily: font.display, fontSize: 16, fontWeight: 600, color: color.ink }}>{t('Forgot your PIN?')}</h3>
      {checked ? (
        <>
          <NumberChecked ten={checked.ten} />
          <PinFields pin={pin} again={again} onPin={setPin} onAgain={setAgain} label={t('Choose a new 6-digit PIN')} />
        </>
      ) : begun ? (
        <WhatsAppWaiting
          begun={begun}
          phone={phoneScreen}
          busy={busy}
          onVerified={(proof) => {
            setChecked({ ten: begun.ten, proof });
            setBegun(null);
            setError(null);
          }}
          onRestart={() => void verify()}
          onChangeNumber={() => {
            setBegun(null);
            setError(null);
          }}
        />
      ) : (
        <>
          <p style={note}>{t('First we check that this mobile number is yours. You send us one WhatsApp message. It is free.')}</p>
          <TextField label={t('Your mobile number')} prefix="+91" inputMode="tel" value={phone} onChange={setPhone} placeholder="98290 12345" />
          <BotTrap value={trap} onChange={setTrap} />
        </>
      )}
      {error && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      {!begun && (
        <div style={{ marginTop: space.lg }}>
          {checked ? (
            <Button type="submit" full wrap disabled={busy}>
              {busy ? t('Please wait…') : t('Save new PIN')}
            </Button>
          ) : (
            <>
              <WhatsAppButton type="submit" disabled={busy}>
                {busy ? t('Please wait…') : t('Verify with WhatsApp')}
              </WhatsAppButton>
              <WhatsAppSteps />
              <SameNumberNote />
            </>
          )}
        </div>
      )}
      {!begun && (
        <div style={{ marginTop: space.sm }}>
          <Button variant="ghost" full disabled={busy} onClick={onBack}>
            {t('Back to sign in')}
          </Button>
        </div>
      )}
    </form>
  );
}

/** The old way: we send a 6-digit code on WhatsApp (F187). Kept for when Meta lets our messages through. */
function ForgotPinByCode({ startPhone, onBack }: { startPhone: string; onBack: () => void }) {
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
        <Button type="submit" full wrap disabled={busy}>
          {busy ? t('Please wait…') : sentTo ? t('Set new PIN and sign in') : t('Send code on WhatsApp')}
        </Button>
      </div>
      {sentTo && !proof && (
        <div style={{ marginTop: space.sm }}>
          <Button variant="quiet" full wrap disabled={busy} onClick={() => void ask()}>
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
