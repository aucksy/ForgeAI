/**
 * The two doors into an online gym: SIGN IN (mobile + your own PIN, or a one-time code the owner
 * made) and START MY GYM (gym name, your name, your mobile, your PIN). One screen each, every field
 * on it at once — fewer steps for owners and desk staff who are not at home with apps.
 */

import { useState, type FormEvent, type ReactNode } from 'react';

import { t } from '../lang/lang';
import { rememberNewGym } from '../logic/newGymReady';
import { isStartLink } from '../logic/trial';
import { Button, CheckField, ErrorBanner, TextField, color, font, space, useIsCompact } from '../ui/kit';
import { replace } from '../ui/router';
import * as authApi from './api';
import { useAuth } from './AuthProvider';
import { BotTrap, ForgotPinForm, usePhoneCodeMode } from './ForgotPin';
import { phoneCodeWords, sendPhoneCode, verifyPhoneCode } from './phoneCode';
import { PinFields } from './PinForms';
import { NumberChecked, SameNumberNote, WhatsAppButton, WhatsAppWaiting, beginInbound, inboundWords, type Begun } from './WhatsAppVerify';
import { rememberAskPin, shouldOfferPin } from './pinPrompt';
import {
  authErrorCode,
  authErrorWords,
  CHECK_RAN_OUT,
  cleanCode,
  createGymErrorWords,
  createGymUnsure,
  formatMobile,
  FORGOT_PIN_WORDS,
  newPinError,
  normalizeMobile,
} from './signin';
import { TermsWords, TERMS_VERSION } from './TermsGate';

const badPhone = () => t('Type a 10-digit mobile number, like 98290 12345.');

/**
 * `heading`: the card's "Sign in" title and line. Drawn here so it hides while "Forgot your PIN?" is open
 * (fresh-eyes review, 8 Nov 2026: a "Sign in with your PIN" line above the forgot steps confused the reader).
 */
export function SignInForm({ submitLabel, startPhone = '', heading }: { submitLabel?: string; startPhone?: string; heading?: ReactNode }) {
  const { adopt } = useAuth();
  const [phone, setPhone] = useState(startPhone);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // F187: "Forgot your PIN?" by WhatsApp, only while the WhatsApp code is switched on.
  // 8 Nov 2026: 'inbound' = "Verify with WhatsApp" (the person sends us a message); 'send' = the old code.
  const mode = usePhoneCodeMode();
  const whatsApp = mode !== 'off';
  const [forgot, setForgot] = useState(false);

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

  if (forgot && whatsApp) {
    return <ForgotPinForm startPhone={phone} mode={mode} onBack={() => setForgot(false)} />;
  }

  return (
    <>
    {heading}
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
      {whatsApp ? (
        <div style={{ marginTop: space.sm }}>
          <Button variant="quiet" full wrap onClick={() => setForgot(true)}>
            {mode === 'inbound' ? t('Forgot your PIN?') : t('Forgot your PIN? Get a code on WhatsApp')}
          </Button>
        </div>
      ) : (
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>{t(FORGOT_PIN_WORDS)}</p>
      )}
    </form>
    </>
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
  // F187: while the WhatsApp code is on, a code to the mobile proves the number before the gym is made.
  const mode = usePhoneCodeMode();
  const whatsApp = mode !== 'off';
  // 8 Nov 2026: "Verify with WhatsApp": the person sends us one message (WhatsAppVerify.tsx).
  const inbound = mode === 'inbound';
  const phoneScreen = useIsCompact();
  const [begun, setBegun] = useState<Begun | null>(null);
  const [trap, setTrap] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [checkCode, setCheckCode] = useState('');
  const [proof, setProof] = useState<{ phone: string; proof: string } | null>(null);

  const askCode = async (ten: string) => {
    setBusy(true);
    setError(null);
    try {
      if (trap.trim()) {
        // The Worker drops a bot's ask; say nothing different here either.
        console.warn('[phone-code] hidden box filled; no code asked');
      } else {
        await sendPhoneCode(ten, 'signup');
      }
      setCodeSentTo(ten);
      setCheckCode('');
    } catch (err) {
      setError(phoneCodeWords(err));
    } finally {
      setBusy(false);
    }
  };

  const beginCheck = async (ten: string) => {
    setBusy(true);
    setError(null);
    try {
      setBegun(await beginInbound(ten, 'signup', phoneScreen, trap));
    } catch (err) {
      setBegun(null);
      setError(inboundWords(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setUnsure(false);
    const ten = normalizeMobile(phone);
    if (gymName.trim().length < 2) return setError(t('Type your gym’s name.'));
    if (!name.trim()) return setError(t('Type your name.'));
    if (!ten) return setError(badPhone());
    const pinBad = newPinError(pin, pinAgain, ten);
    if (pinBad) return setError(t(pinBad));
    if (!agreed) {
      const verifyFirst = inbound && proof?.phone !== ten;
      return setError(verifyFirst ? t('Tick the box to agree to the terms. Then tap “Verify with WhatsApp”.') : t('Tick the box to agree to the terms. Then tap “Create my gym” again.'));
    }
    let phoneProof: string | undefined;
    if (inbound) {
      if (proof && proof.phone === ten) phoneProof = proof.proof;
      // First tap (or a changed number): the person sends us the message; the gym is made after.
      else if (begun?.ten !== ten) return beginCheck(ten);
      else return;
    } else if (whatsApp) {
      if (proof && proof.phone === ten) {
        phoneProof = proof.proof;
      } else {
        // First tap: the code goes out. The number was changed after that: a new code for the new number.
        if (codeSentTo !== ten) return askCode(ten);
        if (checkCode.length !== 6) return setError(t('Type the 6-digit code from WhatsApp.'));
        setBusy(true);
        setError(null);
        try {
          phoneProof = await verifyPhoneCode(ten, 'signup', checkCode);
          setProof({ phone: ten, proof: phoneProof });
        } catch (err) {
          setError(phoneCodeWords(err));
          setBusy(false);
          return;
        }
      }
    }
    setBusy(true);
    setError(null);
    try {
      const signed = await authApi.createOnlineGym(gymName, name, ten, TERMS_VERSION, pin, phoneProof);
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
      // F187: the server did not take the number check (used or expired proof): start the code again.
      const phoneCheck = authErrorCode(err) === 'PHONE_CHECK';
      if (phoneCheck) {
        setProof(null);
        setCodeSentTo(null);
        setBegun(null);
      }
      setError(phoneCheck && inbound ? t(CHECK_RAN_OUT) : createGymErrorWords(err));
      setUnsure(createGymUnsure(err));
      setBusy(false);
    }
  };

  const tenNow = normalizeMobile(phone);
  const checkedHere = inbound && proof !== null && proof.phone === tenNow;
  const waitingForMessage = inbound && begun !== null && begun.ten === tenNow && !checkedHere;
  const waitingForCode = !inbound && whatsApp && codeSentTo !== null && codeSentTo === normalizeMobile(phone) && proof?.phone !== codeSentTo;

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
        hint={
          inbound
            ? t('You sign in with this number. You check it by sending us one WhatsApp message. It is free.')
            : whatsApp
              ? t('You sign in with this number. We check it with a code on WhatsApp.')
              : t('You sign in with this number on any phone or computer.')
        }
      />
      {whatsApp && <BotTrap value={trap} onChange={setTrap} />}
      <PinFields pin={pin} again={pinAgain} onPin={setPin} onAgain={setPinAgain} />
      <CheckField checked={agreed} onChange={setAgreed}>
        <TermsWords />
      </CheckField>
      {checkedHere && proof && <NumberChecked ten={proof.phone} />}
      {waitingForMessage && begun && (
        <WhatsAppWaiting
          begun={begun}
          phone={phoneScreen}
          busy={busy}
          onVerified={(p) => {
            setProof({ phone: begun.ten, proof: p });
            setBegun(null);
            setError(null);
          }}
          onRestart={() => void beginCheck(begun.ten)}
          onChangeNumber={() => {
            setBegun(null);
            setError(null);
          }}
        />
      )}
      {waitingForCode && codeSentTo && (
        <div style={{ marginTop: space.md }}>
          <p role="status" style={{ margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            {t('We sent a 6-digit code to {phone} on WhatsApp. It works for 10 minutes.', { phone: `+91 ${formatMobile(codeSentTo)}` })}
          </p>
          <TextField label={t('Code from WhatsApp')} inputMode="numeric" value={checkCode} onChange={(v) => setCheckCode(cleanCode(v))} placeholder="000000" />
          <Button variant="quiet" full disabled={busy} onClick={() => void askCode(codeSentTo)}>
            {t('Send a new code')}
          </Button>
        </div>
      )}
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
      {inbound && !checkedHere ? (
        !waitingForMessage && (
          <div style={{ marginTop: space.lg }}>
            <WhatsAppButton type="submit" disabled={busy}>
              {busy ? t('Please wait…') : t('Verify with WhatsApp')}
            </WhatsAppButton>
            <SameNumberNote />
          </div>
        )
      ) : (
        <div style={{ marginTop: space.lg }}>
          {/* UAT 1 Nov 2026: the main button of this form (it was an outline, under a bright "Start demo"). */}
          <Button type="submit" full disabled={busy}>
            {busy
              ? t('Setting up…')
              : !inbound && whatsApp && !waitingForCode && proof?.phone !== normalizeMobile(phone)
                ? t('Get code on WhatsApp')
                : t('Create my gym')}
          </Button>
        </div>
      )}
      <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
        {t('Your members and payments are kept online. They stay safe if a phone or computer breaks.')}
      </p>
    </form>
  );
}
