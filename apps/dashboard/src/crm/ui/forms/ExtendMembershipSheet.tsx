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
import { tr } from '../../i18n';
import { addDays, formatDay, relativeDay } from '../../logic/dates';
import { parseCount } from '../../logic/money';
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

  const submit = async () => {
    if (days === null) return setError(tr('Days must be a whole number from 1 to 365.', 'Din 1 se 365 ke beech poora number likho.'));
    setSaving(true);
    setError(null);
    try {
      await extendMembership(membership.id, days, reasonText(reason, other));
      onDone(days);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Could not move the plan. Try again.', 'Plan aage nahi badha. Phir se try karo.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={tr('Freeze / extra days', 'Freeze / Extra din')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr('Cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={saving || days === null}>
            {saving
              ? tr('Saving…', 'Save ho raha hai…')
              : days !== null
                ? tr(`Add ${days} days`, `${days} din badhao`)
                : tr('Add days', 'Din badhao')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        <strong style={{ color: color.ink }}>{membership.planName}</strong>
        {wasEnded
          ? tr(` ended on ${formatDay(membership.endsOn)}.`, ` ${formatDay(membership.endsOn)} ko khatam hua.`)
          : tr(` last day: ${formatDay(membership.endsOn)}.`, ` aakhri din: ${formatDay(membership.endsOn)}.`)}
      </p>

      <div style={{ marginTop: space.md, fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>
        {tr('Reason', 'Kyon')}
      </div>
      <ChipToggle
        label={tr('Reason', 'Kyon')}
        value={reason}
        onChange={(v) => setReason(v as Reason)}
        options={[
          { value: 'medical', label: tr('Freeze – Medical', 'Freeze – Bimari') },
          { value: 'travel', label: tr('Freeze – Travel', 'Freeze – Bahar gaye') },
          { value: 'other', label: tr('Freeze – Other', 'Freeze – Kuch aur') },
          { value: 'gift', label: tr('Gift – Extra days', 'Gift – Extra din') },
        ]}
      />
      {reason === 'other' && (
        <TextField
          label={tr('What happened (optional)', 'Kya hua (zaroori nahi)')}
          value={other}
          onChange={setOther}
          placeholder={tr('Wedding in the family', 'Ghar mein shaadi')}
        />
      )}

      <div style={{ marginTop: space.md, fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>
        {tr('How many days', 'Kitne din')}
      </div>
      <ChipToggle
        label={tr('How many days', 'Kitne din')}
        value={days !== null && QUICK_DAYS.includes(days) ? String(days) : ''}
        onChange={(v) => {
          setDaysText(v);
          setError(null);
        }}
        options={QUICK_DAYS.map((d) => ({ value: String(d), label: tr(`${d} days`, `${d} din`) }))}
      />
      <TextField
        label={tr('Or type the days (1–365)', 'Ya din likho (1–365)')}
        value={daysText}
        onChange={(v) => {
          setDaysText(v);
          setError(null);
        }}
        inputMode="numeric"
        error={daysText.trim() !== '' && days === null ? tr('A whole number from 1 to 365.', '1 se 365 ke beech poora number.') : null}
      />

      <div
        role="status"
        aria-live="polite"
        style={{ marginTop: space.lg, fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink }}
      >
        {newEnd
          ? tr(`New last day: ${formatDay(newEnd)}`, `Naya aakhri din: ${formatDay(newEnd)}`)
          : tr('New last day: —', 'Naya aakhri din: —')}
        {newEnd && (
          <span style={{ display: 'block', marginTop: 4, fontSize: 13, fontWeight: 600, color: newEnd < today ? color.warning : color.goodText }}>
            {newEnd < today
              ? tr(
                  `Still ended (${relativeDay(newEnd, today)}) — add more days to cover today.`,
                  `Phir bhi khatam (${relativeDay(newEnd, today)}) — aaj tak ke liye aur din badhao.`,
                )
              : tr(`Covered until then (${relativeDay(newEnd, today)}).`, `Tab tak chalu (${relativeDay(newEnd, today)}).`)}
          </span>
        )}
      </div>
    </Sheet>
  );
}
