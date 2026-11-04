/**
 * F79 online payments (R-328): "Pay online" inside the desk's money sheets (Collect payment, Sell /
 * Renew) and a shop order's pay sheet.
 *
 *  1. UPI QR (works today, no server needed): the gym's own UPI ID with the amount and the receipt
 *     number in the note. The member scans it with any UPI app; the desk sees the money in its UPI app
 *     or sound box and taps the sheet's own "Save payment" (the sheet switches "Paid by" to UPI).
 *     Owner research: scanning works for every UPI ID; tapping a upi:// link with an amount is often
 *     refused for a personal UPI ID. So: QR first, the UPI ID to copy as the fallback.
 *  2. Payment link (when the gym connected Razorpay, Cashfree, PayU or PhonePe in Settings -> Payments):
 *     a QR of the company's payment page (UPI, cards, net banking), a link to copy or send on WhatsApp,
 *     and "Waiting for the payment…". While the sheet is open it asks every 4 seconds; when the company
 *     says paid, the receipt is saved by itself (onPaid) with the company's payment id. If the sheet is
 *     closed first, the receipt is made the next time the admin app checks (PaidOnline.tsx).
 *  3. "Send to their app" (server on, no company connected): a UPI-only request the member sees on My
 *     membership in the MettleUp app. The desk still taps Save payment when the money shows.
 * Test mode: every company link says "Test mode: no real money moves." until MettleUp switches live on.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useCan } from '../auth/AuthProvider';
import { t } from '../lang/lang';
import { formatINR, type Paise } from '../logic/money';
import { upiPayLink, validUpiId } from '../logic/upiPay';
import { useCrm } from '../store';
import { Button, ErrorBanner, Pill, Row, color, font, space } from '../ui/kit';
import { navigate } from '../ui/router';
import { PayQr } from './PayQr';
import { PayRefused, checkRequest, claimReceipt, makeRequest, markRecorded, tenDigits, type PayRequest } from './payApi';
import { payCaption, requestLine } from './payWords';
import { activeProvider, useDeskPay } from './useDeskPay';

const POLL_MS = 4000;

export interface CollectOnlineProps {
  amountP: Paise | null;
  kind: 'fee' | 'shop';
  /** fee: the gym's member id; shop: unused. */
  memberId?: string;
  /** fee: the membership id; shop: the order id. Null = not ready yet (a sale not saved). */
  payRef: string | null;
  label: string;
  /** What the payer's UPI app shows: "Receipt 2026-27-0042" or "Order 12". */
  note: string;
  memberName?: string;
  phone?: string | null;
  /** The QR is on screen: the sheet switches "Paid by" to UPI. */
  onUpiShown?: () => void;
  /** Paid online: save the receipt (method, amount, reference) and return its number. */
  onPaid?: (r: PayRequest) => Promise<string | null>;
  /** Show nothing at all (not even the owner's "add your UPI ID" hint) when there is no way to pay online. */
  quietWhenEmpty?: boolean;
}

type Shown = 'none' | 'upi' | 'link';

export function CollectOnline(p: CollectOnlineProps) {
  const { gym } = useCrm().snapshot;
  const canManage = useCan()('manageGym');
  const upiId = validUpiId(gym.upiId);
  const { state, key } = useDeskPay();
  const provider = activeProvider(state);
  const serverOn = state?.on === true;
  const [shown, setShown] = useState<Shown>('none');
  const [req, setReq] = useState<PayRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [sentToApp, setSentToApp] = useState(false);
  const saving = useRef(false);
  const amountOk = p.amountP !== null && p.amountP >= 100;

  // A new amount or membership is a new payment: what was shown for the old one goes.
  useEffect(() => {
    setShown('none');
    setReq(null);
    setError(null);
    setSentToApp(false);
  }, [p.amountP, p.payRef]);

  const record = useCallback(
    async (r: PayRequest) => {
      if (!key || !p.onPaid || saving.current) return;
      saving.current = true;
      try {
        const { token } = await claimReceipt(key, r.id);
        if (!token) return; // another desk is making this receipt
        const receiptNo = await p.onPaid(r);
        await markRecorded(key, r.id, { token, receiptNo: receiptNo ?? '' });
      } catch (e) {
        console.warn('[pay] the receipt for an online payment was not saved here', e instanceof Error ? e.message : e);
        setError(t('Paid online, but the receipt was not saved here. It will be made by itself in a minute.'));
      } finally {
        saving.current = false;
      }
    },
    [key, p],
  );

  // While a link is on screen: ask every 4 seconds until it is paid, cancelled or ran out.
  useEffect(() => {
    if (!key || !req || req.status !== 'open') return;
    const id = window.setInterval(() => {
      checkRequest(key, req.id).then(
        (fresh) => {
          setReq(fresh);
          if (fresh.status === 'paid' && !fresh.recorded) void record(fresh);
        },
        (e) => console.warn('[pay] check failed; trying again', e instanceof Error ? e.message : e),
      );
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [key, req, record]);

  if (!amountOk) return null;
  if (p.quietWhenEmpty && !upiId && !(provider && p.payRef)) return null;
  const amount = p.amountP as Paise;
  const payee = gym.name;

  const showUpi = () => {
    setShown('upi');
    p.onUpiShown?.();
  };

  const makeLink = async (online: boolean) => {
    if (!key || !p.payRef) return;
    setBusy(true);
    setError(null);
    try {
      const made = await makeRequest(key, {
        kind: p.kind,
        memberId: p.memberId,
        ref: p.payRef,
        amountP: amount,
        label: p.label,
        note: p.note,
        upiId: upiId,
        payee,
        name: p.memberName,
        phone: tenDigits(p.phone),
        online,
      });
      setReq(made.request);
      if (online) {
        setShown('link');
        if (!made.request.url) {
          setError(
            made.linkError === 'NEEDS_PHONE'
              ? t('{name} needs the member’s mobile number for a payment link. Add it to the member, or show the UPI QR.', { name: provider?.name ?? '' })
              : t('The payment link could not be made just now. Show the UPI QR instead, or try again.'),
          );
        }
      } else {
        setSentToApp(true);
      }
      if (made.request.status === 'paid' && !made.request.recorded) void record(made.request);
    } catch (e) {
      setError(e instanceof PayRefused || (e instanceof Error && e.message === 'OFFLINE') ? t('No internet. Try again.') : t('Could not make the payment link. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch (e) {
      console.warn('[pay] copy refused by the browser', e);
      setCopied(null);
    }
  };

  const linkReady = shown === 'link' && req?.url;
  const waText = req?.url
    ? t('{payee}: please pay {amount} for {label}. Pay here: {url}', { payee, amount: formatINR(amount), label: p.label, url: req.url })
    : '';
  const wa = req?.url ? `https://wa.me/${tenDigits(p.phone) ? `91${tenDigits(p.phone)}` : ''}?text=${encodeURIComponent(waText)}` : '';

  return (
    <div
      style={{
        marginTop: space.md,
        padding: space.md,
        borderRadius: 14,
        border: `1px solid ${color.border}`,
        background: color.surface,
        display: 'grid',
        gap: space.sm,
      }}
    >
      <Row gap={space.sm} align="center">
        <span style={{ flex: 1, fontFamily: font.body, fontSize: 14, fontWeight: 700, color: color.ink }}>{t('Pay online')}</span>
        {provider?.connection?.testMode && shown === 'link' && <Pill tone="warn">{t('Test mode')}</Pill>}
      </Row>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {shown === 'none' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
          {upiId && (
            <Button variant="ghost" onClick={showUpi}>
              {t('Show UPI QR for {amount}', { amount: formatINR(amount) })}
            </Button>
          )}
          {provider && p.payRef && (
            <Button variant="ghost" disabled={busy} needsInternet onClick={() => makeLink(true)}>
              {busy ? t('Making the link…') : t('Make a payment link')}
            </Button>
          )}
          {serverOn && !provider && p.kind === 'fee' && p.payRef && upiId && !sentToApp && (
            <Button variant="quiet" disabled={busy} needsInternet onClick={() => makeLink(false)}>
              {t('Send to their app')}
            </Button>
          )}
        </div>
      )}

      {sentToApp && (
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 13, color: color.goodText }}>
          {t('Sent. They see it under My membership in the MettleUp app. Tap Save payment when the money shows.')}
        </p>
      )}

      {shown === 'none' && !upiId && canManage && (
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
          {t('Add your gym’s UPI ID in Settings to show a UPI QR here.')}{' '}
          <button type="button" onClick={() => navigate('/settings/payments')} style={linkStyle}>
            {t('Open payments')}
          </button>
        </p>
      )}

      {shown === 'upi' && upiId && (
        <div style={{ display: 'grid', justifyItems: 'center', gap: space.sm, textAlign: 'center' }}>
          <div style={{ fontFamily: font.display, fontSize: 18, fontWeight: 700, color: color.ink }}>{payCaption(amount, payee)}</div>
          <PayQr text={upiPayLink({ upiId, payee, amountP: amount, note: p.note })} label={t('UPI QR code to pay {amount}', { amount: formatINR(amount) })} />
          <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            {t('Scan with any UPI app: Google Pay, PhonePe, Paytm or BHIM.')}
          </div>
          <Row gap={space.sm} align="center">
            <span style={{ fontFamily: font.mono, fontSize: 14, color: color.ink }}>{upiId}</span>
            <Button variant="quiet" onClick={() => copy(upiId, 'upi')}>
              {copied === 'upi' ? t('Copied') : t('Copy UPI ID')}
            </Button>
          </Row>
          <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
            {t('When the money shows in your UPI app or sound box, tap Save payment.')}
          </div>
          <Button variant="quiet" onClick={() => setShown('none')}>
            {t('Hide QR')}
          </Button>
        </div>
      )}

      {linkReady && req && (
        <div style={{ display: 'grid', justifyItems: 'center', gap: space.sm, textAlign: 'center' }}>
          <div style={{ fontFamily: font.display, fontSize: 18, fontWeight: 700, color: color.ink }}>{payCaption(amount, payee)}</div>
          {req.status === 'open' && <PayQr text={req.url as string} label={t('QR code of the payment link for {amount}', { amount: formatINR(amount) })} />}
          {req.status === 'open' && (
            <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
              {t('Scan with the phone camera to pay by UPI, card or net banking on {name}.', { name: req.providerName ?? '' })}
            </div>
          )}
          {req.testMode && (
            <div style={{ fontFamily: font.body, fontSize: 13, fontWeight: 700, color: color.warning }}>{t('Test mode: no real money moves.')}</div>
          )}
          <div
            role="status"
            style={{ fontFamily: font.body, fontSize: 14, fontWeight: 600, color: req.status === 'paid' ? color.goodText : req.failed ? color.warning : color.ink }}
          >
            {requestLine(req)}
            {req.status === 'paid' && req.recorded ? ` ${t('Receipt saved.')}` : ''}
          </div>
          {req.status === 'open' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' }}>
              <Button variant="quiet" onClick={() => copy(req.url as string, 'link')}>
                {copied === 'link' ? t('Copied') : t('Copy link')}
              </Button>
              <Button variant="quiet" onClick={() => window.open(wa, '_blank', 'noopener')}>
                {t('Send on WhatsApp')}
              </Button>
            </div>
          )}
          {req.status === 'expired' && (
            <Button variant="ghost" disabled={busy} onClick={() => makeLink(true)}>
              {t('Make a payment link')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const linkStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  color: color.accentBright,
  textDecoration: 'underline',
  cursor: 'pointer',
} as const;
