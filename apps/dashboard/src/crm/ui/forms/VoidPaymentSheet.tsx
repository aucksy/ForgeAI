/**
 * Void a receipt — one definition of the rule, used everywhere a receipt can be
 * voided (the member's page and the money ledger).
 *
 * Voiding is the only way to correct money in this system: the row is never edited
 * and never deleted, its receipt number is consumed rather than reissued, and the
 * amount goes straight back onto what the member owes. That last part is why this
 * cannot be a bare click — a mis-void quietly re-opens a settled debt, and a member
 * being chased for money they already paid is the worst call this product can cause.
 */

import { useState } from 'react';

import { useCrm } from '../../store';
import { formatDay } from '../../logic/dates';
import { formatINR } from '../../logic/money';
import type { Payment } from '../../types';
import { Button, ErrorBanner, Sheet, TextField, color, font } from '../kit';

/** A reason shorter than this is not a reason anyone can act on months later. */
const MIN_REASON = 3;

export function VoidPaymentSheet({
  payment,
  onClose,
  onVoided,
}: {
  payment: Payment;
  onClose: () => void;
  /** Told whether the money actually went back onto the member's dues. */
  onVoided?: (restoredDues: boolean) => void;
}) {
  const { snapshot, voidPayment } = useCrm();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A cancelled term is not chased, so voiding a receipt against one restores
  // nothing to the dues list. Promising otherwise would have the owner waiting for
  // a number that never appears.
  const membership = payment.membershipId
    ? (snapshot.memberships.find((m) => m.id === payment.membershipId) ?? null)
    : null;
  const restoresDues = membership !== null && !membership.cancelled;

  const submit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON) return setError('Say briefly why, so this makes sense later.');

    setSaving(true);
    setError(null);
    try {
      await voidPayment(payment.id, trimmed);
      onVoided?.(restoresDues);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not void this receipt.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Void this receipt?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button tone="danger" disabled={saving || reason.trim().length < MIN_REASON} onClick={submit}>
            {saving ? 'Voiding…' : 'Void receipt'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        Receipt <strong style={{ color: color.ink }}>{payment.receiptNo}</strong> for{' '}
        <strong style={{ color: color.ink }}>{formatINR(payment.amountP)}</strong>, taken on{' '}
        {formatDay(payment.paidOn)}, will stop counting as money received.{' '}
        {restoresDues ? (
          <>
            <strong style={{ color: color.ink }}>The amount goes back onto what this member owes.</strong>
          </>
        ) : membership ? (
          <>
            Because that membership is <strong style={{ color: color.ink }}>cancelled</strong>, this will
            not add anything back to their dues — the gym stopped chasing that term when it was cancelled.
          </>
        ) : (
          <>This receipt is not against a membership, so no balance changes.</>
        )}{' '}
        The row stays in the ledger and its number is never reused — that is what an auditor expects.
      </p>

      <TextField
        label="Reason"
        value={reason}
        onChange={(v) => {
          setReason(v);
          setError(null);
        }}
        autoFocus
        placeholder="Entered twice"
        hint="Recorded against the receipt so it makes sense months later."
      />
    </Sheet>
  );
}
