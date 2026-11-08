/**
 * "Verify with WhatsApp" (8 Nov 2026, owner approved; design "MettleUp Verify with WhatsApp": Main, Waiting,
 * Done, Computer, Problems). The person sends ONE WhatsApp message FROM their phone TO the MettleUp number:
 * "MettleUp code 123456". The Worker checks the code and that WhatsApp's sender is the number they typed
 * (deploy/panel/phoneInbound.js), then hands out the same proof as the old "we send you a code" way, so the next
 * step (a new PIN, or the new gym) is unchanged. Meta blocks the messages WE send (131042); this way sends none.
 *
 *  - On a phone the green button opens WhatsApp (wa.me) with the message typed in.
 *  - On a computer it shows a QR code of the same link, to scan with the phone that has the number.
 *  - Then this screen asks the Worker every 2.5 seconds, pauses while the tab is hidden, asks at once when the
 *    tab comes back, and stops when the code runs out (10 minutes).
 * Used by "Forgot your PIN?" (ForgotPin.tsx) and "Set up a new gym" (SignInForms.tsx).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { t } from '../lang/lang';
import { PayQr } from '../pay/PayQr';
import { ErrorBanner, color, font, radius, space } from '../ui/kit';
import {
  PhoneCodeFailure,
  formatWaNumber,
  inboundLink,
  inboundStatus,
  minutesLeft,
  phoneCodeWords,
  startInbound,
  type CodePurpose,
  type InboundStart,
  type InboundStatus,
} from './phoneCode';
import { formatMobile } from './signin';

export const POLL_MS = 2500;

const GREEN = '#25D366';
const ON_GREEN = '#07240F';

/** Words for a refused start. */
export function inboundWords(err: unknown): string {
  if (err instanceof PhoneCodeFailure) {
    switch (err.code) {
      case 'TOO_SOON':
        return t('You tapped "Verify with WhatsApp" a moment ago. Wait {n} seconds, then try again.', { n: err.retryAfter ?? 60 });
      case 'TOO_MANY':
        return t('Too many tries for this number. Wait an hour, then try again.');
      case 'NOT_AVAILABLE':
        return t('Checking by WhatsApp is not working right now. Please try again later.');
      default:
        break;
    }
  }
  return phoneCodeWords(err);
}

/** Opens WhatsApp with the message typed in. False when the browser blocked it (the button is there). */
export function openWhatsApp(start: Pick<InboundStart, 'waNumber' | 'waText'>): boolean {
  try {
    const w = window.open(inboundLink(start), '_blank');
    if (!w) {
      console.warn('[phone-inbound] the browser did not open WhatsApp; the "Open WhatsApp" button is on screen');
      return false;
    }
    try {
      w.opener = null;
    } catch {
      // quiet: another site's window; it opened, which is all that matters.
    }
    return true;
  } catch (e) {
    console.warn('[phone-inbound] WhatsApp could not be opened', e);
    return false;
  }
}

export interface Begun {
  ten: string;
  start: InboundStart;
  opened: boolean;
}

/** Start: get the code, and on a phone open WhatsApp straight away. Throws PhoneCodeFailure. */
export async function beginInbound(ten: string, purpose: CodePurpose, phone: boolean, website = ''): Promise<Begun> {
  const start = await startInbound(ten, purpose, website);
  return { ten, start, opened: phone ? openWhatsApp(start) : false };
}

function WhatsAppMark() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ON_GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.6L3 21z" />
      <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2L9 9.5z" />
    </svg>
  );
}

const greenStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  width: '100%',
  minHeight: 52,
  padding: '10px 18px',
  boxSizing: 'border-box',
  border: 'none',
  borderRadius: radius.md,
  background: GREEN,
  color: ON_GREEN,
  fontFamily: font.body,
  fontWeight: 700,
  fontSize: 16,
  textAlign: 'center',
  textDecoration: 'none',
} as const;

/** The green "Verify with WhatsApp" button. */
export function WhatsAppButton({ type = 'button', disabled, onClick, children }: { type?: 'button' | 'submit'; disabled?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} style={{ ...greenStyle, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1 }}>
      <WhatsAppMark />
      {children}
    </button>
  );
}

const small = { margin: 0, fontFamily: font.body, fontSize: 13, lineHeight: '19px', color: color.inkSecondary } as const;
const tiny = { margin: 0, fontFamily: font.body, fontSize: 12, lineHeight: '18px', color: color.inkMuted } as const;

/** "What happens": the three steps, under the green button. */
export function WhatsAppSteps() {
  return (
    <div style={{ display: 'grid', gap: space.sm, marginTop: space.md, padding: space.md, borderRadius: radius.sm, background: color.surfaceSunken }}>
      <div style={{ ...small, fontWeight: 600, color: color.ink }}>{t('What happens')}</div>
      <div style={small}>{t('1. WhatsApp opens with a message ready to send.')}</div>
      <div style={small}>{t('2. Tap Send. Do not change the message.')}</div>
      <div style={small}>{t('3. Come back here. We check it in a few seconds.')}</div>
    </div>
  );
}

export function SameNumberNote() {
  return <p style={{ ...tiny, marginTop: space.sm }}>{t('Send it from the WhatsApp on this number. A message from another number does not work.')}</p>;
}

/** The green "Number checked" line. */
export function NumberChecked({ ten }: { ten: string }) {
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: space.md, marginTop: space.md, padding: space.md, borderRadius: radius.sm, background: 'rgba(37, 211, 102, 0.12)' }}>
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color.good} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.7 2.7L16 9.8" />
      </svg>
      <div style={{ display: 'grid', gap: 2 }}>
        <span style={{ fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink }}>{t('Number checked')}</span>
        <span style={small}>{t('{phone} is yours.', { phone: `+91 ${formatMobile(ten)}` })}</span>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color.accent} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

/** What went wrong, in the Problems board's words; null while all is well. PURE apart from t(). */
export function problemWords(status: InboundStatus, offline: boolean, ten: string): string | null {
  if (status.state === 'wrong_number') return t('We got your message from a different number. Send it from the WhatsApp on {phone}.', { phone: `+91 ${formatMobile(ten)}` });
  if (status.state === 'expired') return t('This code has run out. Tap "Verify with WhatsApp" to get a new one.');
  if (status.state === 'too_many') return t('Too many tries for this number. Wait an hour, then try again.');
  if (offline) return t('Can’t reach the internet. We keep checking when it is back.');
  if (status.hint === 'no_code') return t('We could not find the code in your message. Tap "Open WhatsApp again" and send it without changes.');
  return null;
}

/**
 * Waiting for the message: the message to send, a countdown, "Open WhatsApp again" (phone) or the QR code
 * (computer), the problems, and "Use a different number". Calls onVerified(proof) once.
 */
export function WhatsAppWaiting({
  begun,
  phone,
  busy,
  onVerified,
  onRestart,
  onChangeNumber,
}: {
  begun: Begun;
  /** true on a phone (opens WhatsApp); false on a computer (QR code). */
  phone: boolean;
  busy?: boolean;
  onVerified: (proof: string) => void;
  /** "Verify with WhatsApp" again after the code ran out (same number). */
  onRestart: () => void;
  onChangeNumber: () => void;
}) {
  const { start, ten } = begun;
  const [status, setStatus] = useState<InboundStatus>({ state: 'waiting' });
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const verified = useRef(onVerified);
  useEffect(() => {
    verified.current = onVerified;
  }, [onVerified]);

  useEffect(() => {
    let live = true;
    let finished = false;
    let asking = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      stop();
      if (live && !finished && !document.hidden) timer = setTimeout(() => void ask().catch(fail), POLL_MS);
    };
    const fail = (e: unknown) => console.error('[phone-inbound] status check failed', e);
    const ask = async () => {
      if (!live || finished || asking) return;
      if (Date.now() >= start.expiresAt) {
        finished = true;
        setStatus({ state: 'expired' });
        return;
      }
      asking = true;
      try {
        const s = await inboundStatus(start.id);
        if (!live) return;
        setOffline(false);
        if (s.state === 'verified') {
          finished = true;
          if (s.proof) {
            console.info('[phone-inbound] number checked');
            verified.current(s.proof);
          } else {
            // The proof went out already (another tab?): start again.
            setStatus({ state: 'expired' });
          }
          return;
        }
        setStatus(s);
        if (s.state === 'expired' || s.state === 'too_many') finished = true;
      } catch (e) {
        if (!live) return;
        if (e instanceof PhoneCodeFailure && e.code === 'OFFLINE') setOffline(true);
        else console.warn('[phone-inbound] status refused; asking again', e);
      } finally {
        asking = false;
      }
      schedule();
    };
    // Back from WhatsApp: ask at once. Hidden: no asking (the timer is not set again).
    const wake = () => {
      if (document.hidden) return stop();
      stop();
      void ask().catch(fail);
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    schedule();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live = false;
      stop();
      clearInterval(tick);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
    };
  }, [start.id, start.expiresAt]);

  const ended = status.state === 'expired' || status.state === 'too_many';
  const number = formatWaNumber(start.waNumber);
  const left = minutesLeft(start.expiresAt - now);
  const problem = problemWords(status, offline, ten);
  const link = inboundLink(start);

  const waitingLine = !ended && (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.sm, background: color.accentSoft }}>
      <Spinner />
      {phone ? (
        <div style={{ display: 'grid', gap: 2 }}>
          <span style={{ fontFamily: font.body, fontSize: 15, fontWeight: 600, color: color.ink }}>{t('Waiting for your message')}</span>
          <span style={small}>{t('This code works for {time} more minutes.', { time: left })}</span>
        </div>
      ) : (
        <span style={{ ...small, fontSize: 14, color: color.ink }}>{t('Waiting for your message. The code works for {time} more minutes.', { time: left })}</span>
      )}
    </div>
  );

  const problemBox = problem && (
    <div style={{ marginTop: space.md }}>
      <ErrorBanner>{problem}</ErrorBanner>
    </div>
  );

  const restart = ended && status.state === 'expired' && (
    <div style={{ marginTop: space.md }}>
      <WhatsAppButton disabled={busy} onClick={onRestart}>
        {t('Verify with WhatsApp')}
      </WhatsAppButton>
    </div>
  );

  const different = (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: space.md }}>
      <button
        type="button"
        onClick={onChangeNumber}
        style={{ minHeight: 44, padding: '0 12px', border: 'none', background: 'transparent', color: color.accentBright, fontFamily: font.body, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
      >
        {t('Use a different number')}
      </button>
    </div>
  );

  if (!phone) {
    return (
      <section aria-label={t('Verify with WhatsApp')} style={{ marginTop: space.md }}>
        {!ended && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.xl, alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 220, maxWidth: '100%', flexShrink: 0, borderRadius: 14, overflow: 'hidden' }}>
              <PayQr text={link} label={t('QR code that opens WhatsApp with the message ready')} />
            </div>
            <div style={{ display: 'grid', gap: space.md, flex: '1 1 260px', minWidth: 0 }}>
              <h4 style={{ margin: 0, fontFamily: font.display, fontSize: 18, fontWeight: 700, color: color.ink }}>
                {t('Scan with the phone that has {phone}', { phone: `+91 ${formatMobile(ten)}` })}
              </h4>
              <div style={small}>{t('1. Open the camera on that phone and point it at the code.')}</div>
              <div style={small}>{t('2. WhatsApp opens with the message ready. Tap Send.')}</div>
              <div style={small}>{t('3. This page turns green by itself.')}</div>
              {waitingLine}
              <p style={tiny}>{t('No camera? Send "{text}" to {number} on WhatsApp.', { text: start.waText, number })}</p>
            </div>
          </div>
        )}
        {problemBox}
        {restart}
        {different}
      </section>
    );
  }

  return (
    <section aria-label={t('Verify with WhatsApp')} style={{ display: 'grid', gap: space.md, marginTop: space.md }}>
      {!ended && (
        <>
          <h4 style={{ margin: 0, fontFamily: font.display, fontSize: 18, fontWeight: 700, color: color.ink }}>{t('Send the message in WhatsApp')}</h4>
          <p style={{ ...small, fontSize: 15, lineHeight: '22px' }}>{t('Send it from {phone} to the MettleUp number. Then come back here.', { phone: `+91 ${formatMobile(ten)}` })}</p>
          <div style={{ display: 'grid', gap: 6, padding: 14, borderRadius: radius.sm, border: `1px dashed ${color.borderStrong}`, background: color.surfaceSunken }}>
            <span style={tiny}>{t('The message')}</span>
            <span style={{ fontFamily: font.body, fontSize: 17, fontWeight: 600, color: color.ink }}>{start.waText}</span>
            <span style={tiny}>{t('To: MettleUp, {number}', { number })}</span>
          </div>
          {waitingLine}
        </>
      )}
      {problemBox}
      {!ended && (
        <>
          <a href={link} target="_blank" rel="noopener noreferrer" style={greenStyle}>
            <WhatsAppMark />
            {begun.opened ? t('Open WhatsApp again') : t('Open WhatsApp')}
          </a>
          <p style={tiny}>{t('WhatsApp did not open? Send the message above to {number} yourself. Type it exactly.', { number })}</p>
        </>
      )}
      {restart}
      {different}
    </section>
  );
}
