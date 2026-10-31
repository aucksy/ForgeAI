/**
 * R-250 (owner, 31 Oct 2026): "Change start date" for a plan that has not started yet. A plan sold
 * with a future start could not be changed (Edit on the member page changes only the joining date).
 * The plan keeps its length: the last day moves by the same days. Rules: logic/membership.ts
 * moveStartProblem.
 */

import { useState } from 'react';

import { useCrm } from '../../store';
import { formatDay, isValidDateISO } from '../../logic/dates';
import { movedEndDate, moveStartProblem } from '../../logic/membership';
import type { Membership } from '../../types';
import { Button, ErrorBanner, Sheet, TextField, color, font } from '../kit';

export function ChangeStartSheet({
  membership,
  others,
  onClose,
  onDone,
}: {
  membership: Membership;
  /** This member's plans, for the clash check. */
  others: readonly Membership[];
  onClose: () => void;
  /** Handed the new start, for the caller's toast. */
  onDone: (newStart: string) => void;
}) {
  const { snapshot, today, moveMembershipStart } = useCrm();
  const plan = (snapshot?.plans ?? []).find((p) => p.id === membership.planId) ?? null;
  const [startText, setStartText] = useState(membership.startsOn);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const valid = isValidDateISO(startText);
  const problem = valid ? moveStartProblem(membership, startText, today, others, plan) : 'Pick a start date.';
  const newEnd = valid ? movedEndDate(membership, startText, plan) : null;
  const unchanged = startText === membership.startsOn;

  const submit = async () => {
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      await moveMembershipStart(membership.id, startText);
      onDone(startText);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the start date. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Change start date"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || Boolean(problem)}>
            {saving ? 'Saving…' : 'Save start date'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        <strong style={{ color: color.ink }}>{membership.planName}</strong>
        {`: now ${formatDay(membership.startsOn)} → ${formatDay(membership.endsOn)}.`}
      </p>

      <TextField
        label="New start date"
        type="date"
        value={startText}
        onChange={(v) => {
          setStartText(v);
          setError(null);
        }}
        error={unchanged ? null : problem}
        hint={
          !problem && newEnd
            ? `The member keeps every day they paid for. The plan will end on ${formatDay(newEnd)}.`
            : unchanged
              ? 'Pick the day the member will start.'
              : undefined
        }
      />
    </Sheet>
  );
}
