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
import { MIN_VOID_REASON } from '../../logic/receiptRules';
import type { Payment } from '../../types';
import { Button, ErrorBanner, Sheet, TextField, color, font } from '../kit';

/** A reason shorter than this is not a reason anyone can act on months later (the server's rule too, 0021). */
const MIN_REASON = MIN_VOID_REASON;

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
    if (trimmed.length < MIN_REASON) return setError('Write a short reason, so it is clear later.');

    setSaving(true);
    setError(null);
    try {
      await voidPayment(payment.id, trimmed);
      onVoided?.(restoresDues);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel this receipt. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Cancel this receipt?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button tone="danger" disabled={saving || reason.trim().length < MIN_REASON} onClick={submit}>
            {saving ? 'Cancelling…' : 'Cancel receipt'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        Receipt <strong style={{ color: color.ink }}>{payment.receiptNo}</strong>{' '}
        for <strong style={{ color: color.ink }}>{formatINR(payment.amountP)}</strong>
        , taken on {formatDay(payment.paidOn)}
        , will no longer count as money received.{' '}
        {restoresDues ? (
          <>
            <strong style={{ color: color.ink }}>
              The amount is added back to this member’s dues.
            </strong>
          </>
        ) : membership ? (
          <>
            That membership is <strong style={{ color: color.ink }}>cancelled</strong>, so nothing is
            added back to their dues.
          </>
        ) : (
          <>
            This receipt is not for a membership, so no dues change.
          </>
        )}{' '}
        The receipt stays in the list, marked cancelled. Its number is never used again.
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
        hint="Saved with the receipt, so it is clear months later."
      />
    </Sheet>
  );
}
