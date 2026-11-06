/**
 * Billing step 3 (docs/overhaul/BILLING-DESIGN.md; server 0063_gym_checkout.sql, NOT APPLIED):
 *  - PayOnline: on Settings -> Pay MettleUp, "Pay online" (only while the server's switch is on) and
 *    "Your receipts" (whenever the gym has any).
 *  - useRenewWords + RenewReminder: the line on Today in the last 7 days of a paid plan, owner only, with
 *    "Pay now" (only while the server's switch is on).
 * Before 0063 is on the server, or on any error, nothing shows (logged). Words: logic/billing.ts.
 */
import { useCallback, useEffect, useState } from 'react';

import { BILLING_ONLINE_ON, FOUNDING_OFFER } from '@forgeai/theme';

import { useAuth, useRole } from '../auth/AuthProvider';
import {
  UPGRADE_NOTE,
  buyLabel,
  checkoutErrorWords,
  downgradeNote,
  receiptPath,
  receiptPlanText,
  reminderText,
  scheduledLine,
  upgradeLabel,
  type BillingInfo,
  type BuyBilling,
  type BuyPlan,
} from '../logic/billing';
import { PAY_NOW } from '../logic/gymState';
import { formatINR } from '../logic/money';
import { payDate, trialStartLine } from '../logic/payMettleUp';
import { PAY_PATH } from '../logic/trial';
import { billingNotLiveYet, loadBilling, startCheckout } from '../shop/billingApi';
import { Button, Card, ErrorBanner, SectionTitle, color, font, radius, space } from './kit';
import { navigate } from './router';

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13, color: color.inkMuted } as const;

/** owner_billing for this owner key; null while loading, before 0063, or on an error (logged). */
function useBilling(key: string): BillingInfo | null {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  useEffect(() => {
    setInfo(null);
    if (!key) return;
    let live = true;
    loadBilling(key)
      .then((b) => {
        if (live) setInfo(b);
      })
      .catch((e: unknown) => {
        if (billingNotLiveYet(e)) console.info('[billing] the gym server has no 0063 yet; nothing shown');
        else console.warn('[ForgeErr] billing: owner_billing failed', e);
      });
    return () => {
      live = false;
    };
  }, [key]);
  return info;
}

// ---------------------------------------------------------------- Pay MettleUp screen

export function PayOnline({ ownerKey }: { ownerKey: string }) {
  const info = useBilling(ownerKey);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = useCallback(
    async (plan: BuyPlan, billing: BuyBilling, tag: string) => {
      setError(null);
      setBusy(tag);
      const r = await startCheckout(ownerKey, plan, billing);
      if (r.ok) {
        window.location.assign(r.url);
        return;
      }
      setBusy(null);
      setError(checkoutErrorWords(r.code));
    },
    [ownerKey],
  );

  if (!info) return null;
  const lifetime = info.billing === 'lifetime';
  const showBuy = info.checkoutOn && !lifetime;
  const sched = scheduledLine(info);
  const down = sched ? null : downgradeNote(info);
  // Paying during the free trial: the paid plan starts when the trial ends (0063), shown before the tap.
  const trialLine = trialStartLine(info, 'both', Date.now());

  return (
    <>
      {showBuy && (
        <Card style={{ marginBottom: space.lg }}>
          <div data-testid="pay-online">
            <SectionTitle>Pay online</SectionTitle>
            <div style={{ display: 'grid', gap: space.md }}>
              <p style={quiet}>Pay by UPI, card or net banking on the payment company’s secure page. Your plan changes within seconds.</p>
              {error && <ErrorBanner>{error}</ErrorBanner>}
              {trialLine && (
                <p data-testid="pay-online-trial" style={{ ...quiet, color: color.ink }}>
                  {trialLine}
                </p>
              )}
              {sched && (
                <p data-testid="pay-scheduled" style={{ ...quiet, color: color.ink }}>
                  {sched}
                </p>
              )}
              {info.upgrade && (
                <div style={{ display: 'grid', gap: space.xs }}>
                  <div>
                    <Button needsInternet disabled={busy !== null} onClick={() => buy('pro', info.billing === 'yearly' ? 'yearly' : 'monthly', 'upgrade')}>
                      {busy === 'upgrade' ? 'Opening…' : upgradeLabel(info.upgrade)}
                    </Button>
                  </div>
                  <p style={small}>{UPGRADE_NOTE}</p>
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
                {(['starter', 'pro'] as const).flatMap((plan) =>
                  (['monthly', 'yearly'] as const)
                    // While Starter can move up, buying Pro IS the upgrade above: one button for it.
                    .filter(() => !(info.upgrade && plan === 'pro'))
                    .map((billing) => {
                      const tag = `${plan}-${billing}`;
                      return (
                        <Button key={tag} variant="ghost" needsInternet disabled={busy !== null} onClick={() => buy(plan, billing, tag)}>
                          {busy === tag ? 'Opening…' : buyLabel(plan, billing)}
                        </Button>
                      );
                    }),
                )}
              </div>
              {down && <p style={small}>{down}</p>}
              {info.founding.open && info.founding.left > 0 && (
                <div data-testid="pay-founding" style={{ display: 'grid', gap: space.xs }}>
                  <div>
                    <Button variant="ghost" needsInternet disabled={busy !== null} onClick={() => buy('pro', 'lifetime', 'founding')}>
                      {busy === 'founding' ? 'Opening…' : `Pro for life · ${formatINR(FOUNDING_OFFER.rupees * 100)}`}
                    </Button>
                  </div>
                  <p style={small}>
                    Founding gym offer: one payment, one branch. {info.founding.left} of {FOUNDING_OFFER.gyms} places left, until{' '}
                    {payDate(`${FOUNDING_OFFER.lastDay}T12:00:00+05:30`)}.
                  </p>
                </div>
              )}
              <p style={small}>The price for one branch. Pro + AI is not on sale yet.</p>
            </div>
          </div>
        </Card>
      )}
      {info.receipts.length > 0 && (
        <Card style={{ marginBottom: space.lg }}>
          <div data-testid="pay-receipts">
            <SectionTitle>Your receipts</SectionTitle>
            <div style={{ display: 'grid', gap: space.sm }}>
              {info.receipts.slice(0, 20).map((r) => (
                <div key={r.receiptNo} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.md, justifyContent: 'space-between' }}>
                  <span style={{ ...quiet, color: color.ink, minWidth: 0 }}>
                    {r.receiptNo} · {payDate(r.issuedAt)} · {receiptPlanText(r)} · {formatINR(r.amountPaise)}
                  </span>
                  <Button variant="ghost" onClick={() => navigate(receiptPath(r.receiptNo))}>
                    Open receipt
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Today

/** The plan-end reminder's words for this owner, or null (desk, demo, offline gym, switch off, not due). */
export function useRenewWords(): string | null {
  const { session } = useAuth();
  const role = useRole();
  // Off (BILLING_ONLINE_ON false): Today asks the server nothing.
  const key = BILLING_ONLINE_ON && session && session.online && !session.demo && role === 'owner' ? session.ownerKey : '';
  const info = useBilling(key);
  return key ? reminderText(info) : null;
}

export function RenewReminder({ text }: { text: string }) {
  return (
    <div
      role="status"
      data-testid="renew-reminder"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: `${space.sm}px ${space.lg}px`,
        marginBottom: space.lg,
        padding: `${space.md}px ${space.lg}px`,
        borderRadius: radius.md,
        border: `1px solid ${color.accent}`,
        background: color.accentSoft,
        fontFamily: font.body,
        fontSize: 14,
        color: color.ink,
      }}
    >
      <span style={{ flex: '1 1 240px', minWidth: 0 }}>{text}</span>
      <a href={`#${PAY_PATH}`} style={{ color: color.accentBright, fontWeight: 700, textDecoration: 'underline', whiteSpace: 'nowrap' }}>
        {PAY_NOW}
      </a>
    </div>
  );
}
