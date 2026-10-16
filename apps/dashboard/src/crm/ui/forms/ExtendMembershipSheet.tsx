/**
 * Freeze / Extra din — push a membership's last day later.
 *
 * Two reasons an owner does this: the member could not come (ill, out of town: a FREEZE, the
 * days are owed back) or the gym is being generous (a GIFT of extra days). Both are the same
 * write — the last day moves forward and a note records why — so one sheet does both. Works on a
 * plan that already ended too: the days are given back from its old last day, and the sheet says
 * plainly whether that brings the member back into cover today.
 */

import { useState } from 'react';

import { useCrm } from '../../store';
import { addDays, formatDay, relativeDay } from '../../logic/dates';
import { parseCount } from '../../logic/money';
import { isPtMembership, ptLeft } from '../../logic/pt';
import type { Membership } from '../../types';
import { Button, ChipToggle, ErrorBanner, Sheet, TextField, color, font, space } from '../kit';

type Reason = 'medical' | 'travel' | 'other' | 'gift';

const QUICK_DAYS = [7, 15, 30];

function reasonText(reason: Reason, other: string): string {
  // Stored in English so the membership's history reads the same in either language.
  switch (reason) {
    case 'medical':
      return 'Freeze - medical';
    case 'travel':
      return 'Freeze - travel';
    case 'gift':
      return 'Gift - extra days';
    default:
      return other.trim() ? `Freeze - ${other.trim()}` : 'Freeze';
  }
}

export function ExtendMembershipSheet({
  membership,
  onClose,
  onDone,
}: {
  membership: Membership;
  onClose: () => void;
  /** Handed the number of days added, for the caller's toast. */
  onDone: (days: number) => void;
}) {
  const { today, extendMembership } = useCrm();
  const [reason, setReason] = useState<Reason>('medical');
  const [other, setOther] = useState('');
  const [daysText, setDaysText] = useState('7');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const days = parseCount(daysText, 1, 365);
  const newEnd = days !== null ? addDays(membership.endsOn, days) : null;
  const wasEnded = membership.endsOn < today;
  const pt = isPtMembership(membership);

  const submit = async () => {
    if (days === null) return setError('Days must be a whole number from 1 to 365.');
    setSaving(true);
    setError(null);
    try {
      await extendMembership(membership.id, days, reasonText(reason, other));
      onDone(days);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the days to this membership. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={'Freeze / extra days'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {'Cancel'}
          </Button>
          <Button onClick={submit} disabled={saving || days === null}>
            {saving
              ? 'Saving…'
              : days !== null
                ? `Add ${days} days`
                : 'Add days'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        <strong style={{ color: color.ink }}>{membership.planName}</strong>
        {wasEnded
          ? ` ended on ${formatDay(membership.endsOn)}.`
          : ` last day: ${formatDay(membership.endsOn)}.`}
        {/* A PT pack: the days give its unused sessions time to be used. */}
        {pt &&
          (ptLeft(membership) === 1
            ? ' 1 PT session left.'
            : ` ${ptLeft(membership)} PT sessions left.`)}
      </p>

      <div style={{ marginTop: space.md, fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>
        {'Reason'}
      </div>
      <ChipToggle
        label={'Reason'}
        value={reason}
        onChange={(v) => setReason(v as Reason)}
        options={[
          { value: 'medical', label: 'Freeze – Medical' },
          { value: 'travel', label: 'Freeze – Travel' },
          { value: 'other', label: 'Freeze – Other' },
          { value: 'gift', label: 'Gift – Extra days' },
        ]}
      />
      {reason === 'other' && (
        <TextField
          label={'What happened (optional)'}
          value={other}
          onChange={setOther}
          placeholder={'Wedding in the family'}
        />
      )}

      <div style={{ marginTop: space.md, fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>
        {'How many days'}
      </div>
      <ChipToggle
        label={'How many days'}
        value={days !== null && QUICK_DAYS.includes(days) ? String(days) : ''}
        onChange={(v) => {
          setDaysText(v);
          setError(null);
        }}
        options={QUICK_DAYS.map((d) => ({ value: String(d), label: `${d} days` }))}
      />
      <TextField
        label={'Or type the days (1–365)'}
        value={daysText}
        onChange={(v) => {
          setDaysText(v);
          setError(null);
        }}
        inputMode="numeric"
        error={daysText.trim() !== '' && days === null ? 'A whole number from 1 to 365.' : null}
      />

      <div
        role="status"
        aria-live="polite"
        style={{ marginTop: space.lg, fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink }}
      >
        {newEnd
          ? `New last day: ${formatDay(newEnd)}`
          : 'New last day: —'}
        {newEnd && (
          <span style={{ display: 'block', marginTop: 4, fontSize: 13, fontWeight: 600, color: newEnd < today ? color.warning : color.goodText }}>
            {newEnd < today
              ? `Still ended (${relativeDay(newEnd, today)}) — add more days to cover today.`
              : `Covered until then (${relativeDay(newEnd, today)}).`}
          </span>
        )}
      </div>
    </Sheet>
  );
}
