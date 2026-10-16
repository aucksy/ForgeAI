/**
 * Take money against an existing due.
 *
 * This screen exists because review found the CRM could take a part-payment at the
 * point of sale and then had NO way to ever collect the rest: `recordPayment` was
 * implemented in the adapter but unreachable from the UI, so a member's balance
 * could only grow, and the owner's only escape was to cancel the membership —
 * which "cleared" the debt by hiding it. A dues ledger you cannot settle is worse
 * than no dues ledger.
 */

import { useMemo, useState } from 'react';

import { useCrm } from '../../store';
import { formatDay, isValidDateISO } from '../../logic/dates';
import { isChased, unpaidForMembership } from '../../logic/membership';
import { formatINR, parseRupeeInput } from '../../logic/money';
import { methodOptions } from '../../logic/payments';
import type { MemberView, Payment, PaymentMethod } from '../../types';
import { EARLIEST_DATE as EARLIEST_SENSIBLE_DAY } from '../../data/adapter';
import { newRequestId } from '../../data/local';
import { Button, ErrorBanner, Grid, Row, SelectField, Sheet, TextField, color, font, space } from '../kit';
import { tr } from '../../i18n';

export function CollectPaymentSheet({
  view,
  onClose,
  onCollected,
}: {
  view: MemberView;
  onClose: () => void;
  /** Handed the written receipt so the caller can offer to print it. */
  onCollected?: (payment: Payment) => void;
}) {
  const { snapshot, today, recordPayment } = useCrm();

  const owing = useMemo(() => {
    const payments = snapshot.payments.filter((p) => p.memberId === view.member.id);
    return snapshot.memberships
      .filter((m) => m.memberId === view.member.id && isChased(m))
      .map((m) => ({ membership: m, unpaidP: unpaidForMembership(m, payments) }))
      .filter((row) => row.unpaidP > 0)
      .sort((a, b) => a.membership.startsOn.localeCompare(b.membership.startsOn));
  }, [snapshot, view.member.id]);

  const [membershipId, setMembershipId] = useState<string>(owing[0]?.membership.id ?? '');
  const selected = owing.find((o) => o.membership.id === membershipId) ?? null;

  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // C7-1: one id for this sheet's save. "No internet" can still have saved it (the background
  // refresh sends it later); pressing again then finds that receipt instead of making a second.
  const [requestId] = useState(newRequestId);

  // Default to settling the balance in full — the common case at a counter.
  const amountP = amountText.trim() === '' ? (selected?.unpaidP ?? null) : parseRupeeInput(amountText);
  const remainingP =
    selected && amountP !== null ? Math.max(0, selected.unpaidP - amountP) : null;

  const submit = async () => {
    if (!selected) return setError(tr('Choose which membership this payment is for.', 'Chuno yeh fees kis plan ki hai.'));
    if (amountP === null) return setError(tr('That isn’t a valid amount.', 'Yeh sahi rakam nahi hai.'));
    if (amountP <= 0) return setError(tr('Enter an amount greater than zero.', 'Zero se zyada rakam likho.'));
    if (amountP > selected.unpaidP) {
      return setError(
        tr(
          `That's more than the ${formatINR(selected.unpaidP)} outstanding on this membership.`,
          `Yeh is plan ki ${formatINR(selected.unpaidP)} baaki fees se zyada hai.`,
        ),
      );
    }
    // Checked BEFORE the future test, because a half-typed or cleared date field
    // passes `paidOn > today` and then throws deep inside the receipt-number maths,
    // showing the desk "Not a YYYY-MM-DD date:". A mistyped year (0002) got as far
    // as storage and minted a receipt number nothing could read back.
    if (!isValidDateISO(paidOn)) return setError(tr('Enter the date this money was received.', 'Paisa kis din mila, woh tareekh likho.'));
    if (paidOn < EARLIEST_SENSIBLE_DAY) {
      return setError(tr('That date looks like a typo — check the year.', 'Tareekh galat lag rahi hai — saal check karo.'));
    }
    if (paidOn > today) return setError(tr('A payment can’t be dated in the future.', 'Aage ki tareekh ki payment nahi ho sakti.'));

    setSaving(true);
    setError(null);
    try {
      const payment = await recordPayment({
        memberId: view.member.id,
        membershipId: selected.membership.id,
        amountP,
        method,
        paidOn,
        reference: reference.trim() || null,
        note: null,
        collectedBy: null,
        requestId,
      });
      onCollected?.(payment);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Could not record this payment.', 'Yeh payment save nahi hui.'));
    } finally {
      setSaving(false);
    }
  };

  if (owing.length === 0) {
    return (
      <Sheet title={tr('Record a payment', 'Fees lo')} onClose={onClose}>
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          <strong style={{ color: color.ink }}>{view.member.fullName}</strong>{' '}
          {tr(
            'doesn’t owe anything — every membership is fully paid.',
            'ki koi fees baaki nahi — saare plan ki poori fees di hai.',
          )}
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={tr('Record a payment', 'Fees lo')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr('Cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('Saving…', 'Save ho raha hai…') : tr('Record payment', 'Fees lo')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div style={{ fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        {tr('From', 'Member')} <strong style={{ color: color.ink }}>{view.member.fullName}</strong> ·{' '}
        {formatINR(view.outstandingP)} {tr('outstanding in total', 'kul baaki')}
      </div>

      <SelectField
        label={tr('Against which membership', 'Kis plan ki fees')}
        value={membershipId}
        onChange={(v) => {
          setMembershipId(v);
          setAmountText('');
          setError(null);
        }}
        options={owing.map((o) => ({
          value: o.membership.id,
          label: tr(
          `${o.membership.planName} (${formatDay(o.membership.startsOn)}) — ${formatINR(o.unpaidP)} due`,
          `${o.membership.planName} (${formatDay(o.membership.startsOn)}) — ${formatINR(o.unpaidP)} baaki`,
        ),
        }))}
      />

      <TextField
        label={tr('Amount received', 'Kitne mile')}
        value={amountText}
        onChange={(v) => {
          setAmountText(v);
          setError(null);
        }}
        inputMode="decimal"
        placeholder={selected ? formatINR(selected.unpaidP) : ''}
        hint={tr('Leave blank to settle the balance in full.', 'Poori baaki fees ke liye khaali chhodo.')}
      />

      <Grid min={200}>
        <SelectField
          label={tr('Paid by', 'Kaise diya')}
          value={method}
          onChange={(v) => setMethod(v as PaymentMethod)}
          options={methodOptions()}
        />
        <TextField
          label={tr('Reference (optional)', 'Reference (zaroori nahi)')}
          value={reference}
          onChange={setReference}
          placeholder={method === 'upi' ? tr('UPI ref no.', 'UPI ref no.') : tr('Cheque / card last 4', 'Cheque / card ke last 4')}
        />
      </Grid>

      <TextField label={tr('Received on', 'Kis din mile')} value={paidOn} onChange={setPaidOn} type="date" />

      {remainingP !== null && (
        <Row>
          <span
            style={{
              marginTop: space.md,
              fontFamily: font.body,
              fontSize: 13,
              fontWeight: 600,
              color: remainingP > 0 ? color.warning : color.goodText,
            }}
          >
            {remainingP > 0
              ? tr(`Still due after this: ${formatINR(remainingP)}`, `Iske baad baaki: ${formatINR(remainingP)}`)
              : tr('This settles the membership in full.', 'Isse poori fees ho gayi.')}
          </span>
        </Row>
      )}
    </Sheet>
  );
}
