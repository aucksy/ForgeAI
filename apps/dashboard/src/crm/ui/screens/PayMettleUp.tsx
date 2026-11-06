/**
 * T79 "Pay MettleUp" (owner R-380/R-381, 6 Nov 2026): Settings -> Pay MettleUp (/settings/mettleup), also
 * reached from the free-trial line on Today. The OWNER picks Starter or Pro, monthly or yearly (the approved
 * prices), pays by UPI (QR code, or "Pay with a UPI app" on a phone) or bank transfer, then sends the
 * reference number and the amount. MettleUp confirms it in HQ, and this screen shows: waiting for
 * confirmation / confirmed, paid until a date / not confirmed, with the reason.
 *
 * NOT LIVE: needs supabase/migrations/0060_pay_mettleup.sql (NOT APPLIED). Before it, the screen says paying
 * here is not ready. MettleUp's UPI ID and bank account come only from the server (never in this code); with
 * none saved the screen says payment is not available yet and shows no QR code.
 * Words and rules: logic/payMettleUp.ts.
 */
import { useCallback, useEffect, useState } from 'react';

import { useAuth, useRole } from '../../auth/AuthProvider';
import { formatINR } from '../../logic/money';
import {
  PLAN_NAMES,
  amountFromText,
  amountText,
  cleanReference,
  mettleUpUpiLink,
  payErrorWords,
  paymentStatus,
  planNow,
  priceOf,
  referenceError,
  type PayBilling,
  type PayMethod,
  type PayOverview,
  type PayPlan,
} from '../../logic/payMettleUp';
import { PayQr } from '../../pay/PayQr';
import { loadPayMettleUp, payNotLiveYet, reportMettleUpPayment } from '../../shop/payMettleUpApi';
import { errorWords } from '../../shop/logic';
import { Button, Card, ChipToggle, EmptyState, ErrorBanner, PageHeader, Pill, SectionTitle, TextField, Toast, color, font, space } from '../kit';
import { navigate } from '../router';

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13, color: color.inkMuted } as const;

type Load = { state: 'loading' } | { state: 'notLive' } | { state: 'error'; message: string } | { state: 'ready'; data: PayOverview };

/** The owner's key of an online, real gym; '' otherwise (the desk, the demo, a browser-only gym). */
function useOwnerKey(): string {
  const { session } = useAuth();
  const role = useRole();
  return session && session.online && !session.demo && role === 'owner' ? session.ownerKey : '';
}

// ---------------------------------------------------------------- Settings card

/** Settings -> Gym: the owner's way in (the screen says itself when paying here is not ready). */
export function PayMettleUpCard() {
  const key = useOwnerKey();
  if (!key) return null;
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Your MettleUp plan</SectionTitle>
      <p style={quiet}>Pay for MettleUp by UPI or bank transfer, and see when your payment is confirmed.</p>
      <div style={{ marginTop: space.lg }}>
        <Button variant="ghost" needsInternet onClick={() => navigate('/settings/mettleup')}>
          Pay MettleUp
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- the screen

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <span style={small}>{label}</span>
      <span style={{ fontFamily: font.body, fontSize: 15, color: color.ink, overflowWrap: 'anywhere', userSelect: 'all' }}>{value}</span>
    </div>
  );
}

export function PayMettleUpScreen() {
  const key = useOwnerKey();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [plan, setPlan] = useState<PayPlan>('pro');
  const [billing, setBilling] = useState<PayBilling>('monthly');
  const [method, setMethod] = useState<PayMethod>('upi');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState(amountText(priceOf('pro', 'monthly') ?? 0));
  const [amountTouched, setAmountTouched] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!key) return;
    try {
      setLoad({ state: 'ready', data: await loadPayMettleUp(key) });
    } catch (e: unknown) {
      if (payNotLiveYet(e)) {
        console.info('[pay mettleup] the gym server has no 0060 yet; the screen says so');
        setLoad({ state: 'notLive' });
      } else {
        console.warn('[ForgeErr] pay mettleup: owner_pay_mettleup failed', e);
        setLoad({ state: 'error', message: payErrorWords(e) ?? errorWords(e) });
      }
    }
  }, [key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const price = priceOf(plan, billing) ?? 0;
  // The amount box follows the picked plan until the owner types in it.
  useEffect(() => {
    if (!amountTouched) setAmount(amountText(price));
  }, [price, amountTouched]);

  const header = (
    <PageHeader
      title="Pay MettleUp"
      subtitle="Pay for your MettleUp plan by UPI or bank transfer"
      actions={
        <Button variant="ghost" onClick={() => navigate('/settings')}>
          Back to Settings
        </Button>
      }
    />
  );

  if (!key) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="Only the gym owner can pay MettleUp" body="Sign in as the owner, with the gym online, to pay." />
        </Card>
      </>
    );
  }
  if (load.state === 'loading') {
    return (
      <>
        {header}
        <p style={quiet}>Loading…</p>
      </>
    );
  }
  if (load.state === 'notLive') {
    return (
      <>
        {header}
        <Card>
          <div data-testid="pay-not-ready">
            <EmptyState
              title="Paying MettleUp here is not ready yet"
              body="To pay now, message MettleUp and we will send you the payment details. Your gym keeps working as it is."
            />
          </div>
        </Card>
      </>
    );
  }
  if (load.state === 'error') {
    return (
      <>
        {header}
        <ErrorBanner>{load.message}</ErrorBanner>
        <Button variant="ghost" onClick={() => void refresh()}>
          Try again
        </Button>
      </>
    );
  }

  const data = load.data;
  const link = mettleUpUpiLink(data.payTo, price, data.gymCode);
  const lifetime = data.billing === 'lifetime';

  const send = async () => {
    const rErr = referenceError(reference, method);
    const amountP = amountFromText(amount);
    const aErr = amountP === null ? 'Type the amount you paid, in rupees, like 1499.' : null;
    setRefError(rErr);
    setAmountError(aErr);
    setSendError(null);
    if (rErr || aErr || amountP === null) return;
    setSending(true);
    try {
      await reportMettleUpPayment(key, { plan, billing, amountPaise: amountP, reference: cleanReference(reference), method });
      setReference('');
      setToast('Sent. MettleUp will check the payment and confirm it here.');
      await refresh();
    } catch (e: unknown) {
      console.warn('[ForgeErr] pay mettleup: owner_report_mettleup_payment failed', e);
      setSendError(payErrorWords(e) ?? errorWords(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {header}
      <Card style={{ marginBottom: space.lg }}>
        <p data-testid="pay-plan-now" style={{ ...quiet, color: color.ink }}>
          {planNow(data, Date.now())}
        </p>
      </Card>

      {data.payments.length > 0 && (
        <Card style={{ marginBottom: space.lg }}>
          <SectionTitle>Your payments</SectionTitle>
          <div style={{ display: 'grid', gap: space.md }}>
            {data.payments.slice(0, 5).map((p) => {
              const s = paymentStatus(p);
              return (
                <div key={p.id} data-testid="pay-status" style={{ display: 'grid', gap: space.xs }}>
                  <div>
                    <Pill tone={s.tone === 'good' ? 'good' : s.tone === 'bad' ? 'critical' : 'warn'}>{s.title}</Pill>
                  </div>
                  <p style={quiet}>{s.text}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {lifetime ? null : !data.payTo ? (
        <Card>
          <div data-testid="pay-not-available">
            <EmptyState
              title="Payment is not available yet"
              body="MettleUp has not added its payment details here yet. Message MettleUp to pay. Your gym keeps working as it is."
            />
          </div>
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: space.lg }}>
            <SectionTitle>1. Pick your plan</SectionTitle>
            <div style={{ display: 'grid', gap: space.md }}>
              <ChipToggle
                label="Plan"
                variant="tabs"
                value={plan}
                onChange={(v) => setPlan(v === 'starter' ? 'starter' : 'pro')}
                options={[
                  { value: 'starter', label: PLAN_NAMES.starter },
                  { value: 'pro', label: PLAN_NAMES.pro },
                ]}
              />
              <ChipToggle
                label="Pay for"
                variant="tabs"
                value={billing}
                onChange={(v) => setBilling(v === 'yearly' ? 'yearly' : 'monthly')}
                options={[
                  { value: 'monthly', label: '1 month' },
                  { value: 'yearly', label: '1 year' },
                ]}
              />
              <p data-testid="pay-amount" style={{ margin: 0, fontFamily: font.display, fontSize: 28, fontWeight: 700, color: color.ink }}>
                {formatINR(price)}
                <span style={{ ...quiet, marginLeft: space.sm }}>{billing === 'yearly' ? 'for 1 year' : 'for 1 month'}</span>
              </p>
              <p style={small}>
                The price for one branch. More than one branch? Message MettleUp for your total before you pay. Pro + AI is not on sale yet.
              </p>
            </div>
          </Card>

          <Card style={{ marginBottom: space.lg }}>
            <SectionTitle>2. Pay {formatINR(price)}</SectionTitle>
            <div style={{ display: 'grid', gap: space.lg }}>
              {link && data.payTo.upiId && (
                <div style={{ display: 'grid', gap: space.md, justifyItems: 'start' }}>
                  <p style={quiet}>Scan with any UPI app (Google Pay, PhonePe, Paytm, your bank’s app). The amount is filled in.</p>
                  <div data-testid="pay-qr">
                    <PayQr text={link} label={`UPI QR code to pay ${formatINR(price)} to MettleUp`} px={220} />
                  </div>
                  <a
                    href={link}
                    data-testid="pay-upi-link"
                    style={{ color: color.accentBright, fontFamily: font.body, fontSize: 15, fontWeight: 600, textDecoration: 'underline' }}
                  >
                    On a phone? Pay with a UPI app
                  </a>
                  <Detail label="UPI ID" value={data.payTo.upiId} />
                  <Detail label="Name" value={data.payTo.payeeName} />
                </div>
              )}
              {data.payTo.bank && (
                <div data-testid="pay-bank" style={{ display: 'grid', gap: space.sm }}>
                  <p style={{ ...quiet, color: color.ink, fontWeight: 600 }}>{data.payTo.upiId ? 'Or pay by bank transfer (NEFT or IMPS)' : 'Pay by bank transfer (NEFT or IMPS)'}</p>
                  <Detail label="Account name" value={data.payTo.bank.accountName} />
                  <Detail label="Account number" value={data.payTo.bank.accountNumber} />
                  <Detail label="IFSC" value={data.payTo.bank.ifsc} />
                  {data.payTo.bank.bankName && <Detail label="Bank" value={data.payTo.bank.bankName} />}
                </div>
              )}
              <p style={small}>In the payment note, write your gym code {data.gymCode || '(on Settings)'} so we know it is you.</p>
            </div>
          </Card>

          <Card>
            <SectionTitle>3. I have paid</SectionTitle>
            <div style={{ display: 'grid', gap: space.md }}>
              <p style={quiet}>Send us the reference number, so MettleUp can find your payment and confirm it.</p>
              {sendError && <ErrorBanner>{sendError}</ErrorBanner>}
              <ChipToggle
                label="Paid by"
                variant="tabs"
                value={method}
                onChange={(v) => setMethod(v === 'bank' ? 'bank' : 'upi')}
                options={[
                  { value: 'upi', label: 'UPI' },
                  { value: 'bank', label: 'Bank transfer' },
                ]}
              />
              <TextField
                label="Reference number (UTR)"
                value={reference}
                onChange={setReference}
                error={refError}
                hint={method === 'upi' ? 'The 12-digit UPI reference number in your UPI app’s payment details.' : 'The UTR number your bank shows for the transfer.'}
              />
              <TextField
                label="Amount paid"
                prefix="₹"
                inputMode="decimal"
                value={amount}
                onChange={(v) => {
                  setAmountTouched(true);
                  setAmount(v);
                }}
                error={amountError}
              />
              <div>
                <Button needsInternet disabled={sending} onClick={() => void send()}>
                  {sending ? 'Sending…' : 'Send for confirmation'}
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}
