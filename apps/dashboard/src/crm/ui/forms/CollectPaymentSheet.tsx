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

import { useEffect, useMemo, useState } from 'react';

import { useCrm } from '../../store';
import { useAuth, useRole } from '../../auth/AuthProvider';
import { takerOf } from '../../auth/permissions';
import { formatDay, isValidDateISO } from '../../logic/dates';
import { isChased, unpaidForMembership } from '../../logic/membership';
import { formatINR, parseRupeeInput } from '../../logic/money';
import { DEFAULT_PAYMENT_METHOD, methodOptions } from '../../logic/payments';
import { DESK_BACKDATE_DAYS, receiptDateProblem } from '../../logic/receiptRules';
import type { MemberView, Payment, PaymentMethod } from '../../types';
import { EARLIEST_DATE as EARLIEST_SENSIBLE_DAY } from '../../data/adapter';
import { newRequestId } from '../../data/local';
import { Button, ErrorBanner, Grid, Row, SelectField, Sheet, TextField, color, font, space } from '../kit';

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
  const { snapshot, today, recordPayment, prepareOffline } = useCrm();
  // Offline front desk (review SHOULD 5): the first money sheet opened online gives this device its
  // own receipt series, so it can take payments if the internet goes later.
  useEffect(() => prepareOffline(), [prepareOffline]);
  // C7-12: the receipt says who took the money (the server stamps the same from the session).
  const taker = takerOf(useAuth().session);
  const role = useRole();

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
  const [method, setMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD);
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // C7-1: one id for this sheet's save. "No internet" can still have saved it (the background
  // refresh sends it later); pressing again then finds that receipt instead of making a second.
  const [requestId] = useState(newRequestId);

  // Default to settling the balance in full — the common case at a counter.
  const amountP = amountText.trim() === '' ? (selected?.unpaidP ?? null) : parseRupeeInput(amountText);
  // UAT A-29 (30 Oct 2026): an amount above the due (refused on save) no longer shows "clears all dues".
  const remainingP =
    selected && amountP !== null && amountP > 0 && amountP <= selected.unpaidP ? selected.unpaidP - amountP : null;

  const submit = async () => {
    if (!selected) return setError('Pick the membership this payment is for.');
    if (amountP === null) return setError('That amount looks wrong. Type it again.');
    if (amountP <= 0) return setError('Type an amount more than zero.');
    if (amountP > selected.unpaidP) {
      return setError(
        `That is more than the ${formatINR(selected.unpaidP)} due on this membership.`,
      );
    }
    // Checked BEFORE the future test, because a half-typed or cleared date field
    // passes `paidOn > today` and then throws deep inside the receipt-number maths,
    // showing the desk "Not a YYYY-MM-DD date:". A mistyped year (0002) got as far
    // as storage and minted a receipt number nothing could read back.
    if (!isValidDateISO(paidOn)) return setError('Pick the date you got this money.');
    if (paidOn < EARLIEST_SENSIBLE_DAY) {
      return setError('That date looks wrong. Check the year.');
    }
    // UAT F-02: never ahead; the front desk at most 31 days back (the server refuses the same, 0021).
    const dateProblem = receiptDateProblem(paidOn, today, role);
    if (dateProblem) return setError(dateProblem);

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
        collectedBy: taker.id,
        collectedByName: taker.name,
        requestId,
      });
      onCollected?.(payment);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this payment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (owing.length === 0) {
    return (
      <Sheet title="Collect payment" onClose={onClose}>
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          <strong style={{ color: color.ink }}>{view.member.fullName}</strong>{' '}
          has no dues. Every membership is fully paid.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Collect payment"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save payment'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div style={{ fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        From <strong style={{ color: color.ink }}>{view.member.fullName}</strong> ·{' '}
        {formatINR(view.outstandingP)} due in total
      </div>

      <SelectField
        label="For which membership"
        value={membershipId}
        onChange={(v) => {
          setMembershipId(v);
          setAmountText('');
          setError(null);
        }}
        options={owing.map((o) => ({
          value: o.membership.id,
          label: `${o.membership.planName} (${formatDay(o.membership.startsOn)}) — ${formatINR(o.unpaidP)} due`,
        }))}
      />

      <TextField
        label="Amount received"
        value={amountText}
        onChange={(v) => {
          setAmountText(v);
          setError(null);
        }}
        inputMode="decimal"
        placeholder={selected ? formatINR(selected.unpaidP) : ''}
        hint="Leave blank to collect the full amount due."
      />

      <Grid min={200}>
        <SelectField
          label="Paid by"
          value={method}
          onChange={(v) => setMethod(v as PaymentMethod)}
          options={methodOptions()}
        />
        <TextField
          label="Reference (optional)"
          value={reference}
          onChange={setReference}
          placeholder={method === 'upi' ? 'UPI ref no.' : 'Cheque / card last 4'}
        />
      </Grid>

      <TextField
        label="Received on"
        value={paidOn}
        onChange={(v) => {
          setPaidOn(v);
          setError(null);
        }}
        type="date"
        hint={role === 'staff' ? `Today, or up to ${DESK_BACKDATE_DAYS} days back.` : undefined}
      />

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
              ? `Still due after this: ${formatINR(remainingP)}`
              : 'This clears all dues on this membership.'}
          </span>
        </Row>
      )}
    </Sheet>
  );
}
