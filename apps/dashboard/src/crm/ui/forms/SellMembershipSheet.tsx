/**
 * Sell or renew a membership — the money moment.
 *
 * The research is emphatic that Indian gyms live on annual prepay and the renewal
 * cliff, not monthly debits, so this screen optimises for: pick a plan, confirm the
 * dates it produces, adjust the price if a discount was agreed, and take whatever
 * the member is actually paying today (which is often not the full amount).
 *
 * Every default and every rule now comes from `logic/selling.ts` rather than
 * living in this file — review found two real bugs here that no test could see,
 * because form logic in JSX is untestable logic.
 */

import { useMemo, useState } from 'react';

import { useCrm } from '../../store';
import { addDays, formatDay, isValidDateISO } from '../../logic/dates';
import { endDateForPlan } from '../../logic/membership';
import { saleDefaults, validateSale, type SaleProblem } from '../../logic/selling';
import { formatINR, parseRupeeInput } from '../../logic/money';
import { methodOptions } from '../../logic/payments';
import type { MemberView, PaymentMethod, Plan } from '../../types';
import type { SellMembershipResult } from '../../data/adapter';
import { Button, ErrorBanner, Grid, Row, SelectField, Sheet, TextField, color, font, space } from '../kit';

export function SellMembershipSheet({
  view,
  onClose,
  onSold,
}: {
  view: MemberView;
  onClose: () => void;
  /** Handed the sale, including the receipt when money was taken at the counter. */
  onSold?: (result: SellMembershipResult) => void;
}) {
  const { snapshot, today, sellMembership } = useCrm();

  const plans = useMemo(
    () =>
      snapshot.plans
        .filter((p) => p.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [snapshot.plans],
  );

  const memberships = useMemo(
    () => snapshot.memberships.filter((m) => m.memberId === view.member.id),
    [snapshot.memberships, view.member.id],
  );

  const [planId, setPlanId] = useState<string>(plans[0]?.id ?? '');
  const plan: Plan | undefined = plans.find((p) => p.id === planId);

  // Defaults come from the coverage CHAIN, not the term running today — otherwise
  // a second renewal starts inside the renewal they already bought.
  const defaults = useMemo(
    () => (plan ? saleDefaults(memberships, plan, today) : null),
    [memberships, plan, today],
  );

  const [startsOnOverride, setStartsOnOverride] = useState<string | null>(null);
  const startsOn = startsOnOverride ?? defaults?.startsOn ?? today;

  const [priceText, setPriceText] = useState('');
  const [joiningText, setJoiningText] = useState('');
  const [collectText, setCollectText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState<SaleProblem | null>(null);
  const [saving, setSaving] = useState(false);

  // Blank means "use the default" — typing is only needed for a discount.
  const priceP = priceText.trim() === '' ? (defaults?.priceP ?? null) : parseRupeeInput(priceText);
  const joiningP =
    joiningText.trim() === '' ? (defaults?.joiningFeeP ?? null) : parseRupeeInput(joiningText);
  const collectP = collectText.trim() === '' ? 0 : parseRupeeInput(collectText);

  const totalP = priceP !== null && joiningP !== null ? priceP + joiningP : null;
  const endsOn = plan && isValidDateISO(startsOn) ? endDateForPlan(startsOn, plan) : null;
  const balanceP = totalP !== null && collectP !== null ? Math.max(0, totalP - collectP) : null;

  const errorFor = (field: SaleProblem['field']) =>
    problem?.field === field ? problem.message : null;

  const submit = async () => {
    const found = validateSale(
      { planId: plan?.id ?? null, startsOn, priceP, joiningFeeP: joiningP, collectNowP: collectP },
      memberships,
      today,
    );
    if (found) {
      setProblem(found);
      return;
    }

    setSaving(true);
    setProblem(null);
    try {
      const result = await sellMembership({
        memberId: view.member.id,
        planId: plan!.id,
        startsOn,
        priceP: priceP!,
        joiningFeeP: joiningP!,
        notes: notes.trim() || null,
        collectNowP: collectP!,
        method,
        reference: reference.trim() || null,
        paidOn: today,
        soldBy: null,
      });
      onSold?.(result);
      onClose();
    } catch (e) {
      setProblem({ field: 'plan', message: e instanceof Error ? e.message : 'Could not save this membership.' });
    } finally {
      setSaving(false);
    }
  };

  if (plans.length === 0) {
    return (
      <Sheet title="Sell membership" onClose={onClose}>
        <ErrorBanner>
          You haven’t created any plans yet. Add a plan first, then you can sell it here.
        </ErrorBanner>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={defaults?.isRenewal ? 'Renew membership' : 'Sell membership'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm'}
          </Button>
        </>
      }
    >
      {problem && problem.field === 'plan' && <ErrorBanner>{problem.message}</ErrorBanner>}

      <div style={{ color: color.inkSecondary, fontFamily: font.body, fontSize: 14 }}>
        For <strong style={{ color: color.ink }}>{view.member.fullName}</strong>
        {view.coversUntil && <> · covered until {formatDay(view.coversUntil)}</>}
      </div>

      <SelectField
        label="Plan"
        value={planId}
        onChange={(v) => {
          setPlanId(v);
          setPriceText('');
          setJoiningText('');
          setCollectText('');
          setProblem(null);
        }}
        options={plans.map((p) => ({ value: p.id, label: `${p.name} — ${formatINR(p.priceP)}` }))}
      />

      <Grid min={220}>
        <TextField
          label="Starts on"
          value={startsOn}
          onChange={(v) => {
            setStartsOnOverride(v);
            setProblem(null);
          }}
          type="date"
          error={errorFor('startsOn')}
        />
        <div style={{ marginTop: space.md }}>
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>
            Valid until
          </div>
          <div
            style={{
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              fontFamily: font.mono,
              fontSize: 15,
              color: endsOn ? color.accentBright : color.inkMuted,
            }}
          >
            {endsOn ? formatDay(endsOn) : '—'}
          </div>
          {endsOn && (
            <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
              Last day they can train. Next term starts {formatDay(addDays(endsOn, 1))}.
            </div>
          )}
        </div>
      </Grid>

      <Grid min={220}>
        <TextField
          label="Plan price"
          value={priceText}
          onChange={(v) => {
            setPriceText(v);
            setProblem(null);
          }}
          inputMode="decimal"
          placeholder={plan ? formatINR(plan.priceP) : ''}
          hint="Leave blank for the listed price. Type a lower number to give a discount."
          error={errorFor('priceP')}
        />
        <TextField
          label="Joining fee"
          value={joiningText}
          onChange={(v) => {
            setJoiningText(v);
            setProblem(null);
          }}
          inputMode="decimal"
          placeholder={formatINR(defaults?.joiningFeeP ?? 0)}
          hint={
            defaults && defaults.joiningFeeP === 0 && (plan?.joiningFeeP ?? 0) > 0
              ? 'Already paid a joining fee before — not charged again.'
              : 'Charged once, on joining.'
          }
          error={errorFor('joiningFeeP')}
        />
      </Grid>

      <div
        style={{
          marginTop: space.lg,
          padding: space.lg,
          background: color.surfaceSunken,
          borderRadius: 14,
          border: `1px solid ${color.border}`,
        }}
      >
        <Row>
          <span style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary, flex: 1 }}>
            Total payable
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 700, color: color.ink }}>
            {totalP === null ? '—' : formatINR(totalP)}
          </span>
        </Row>

        <TextField
          label="Received now"
          value={collectText}
          onChange={(v) => {
            setCollectText(v);
            setProblem(null);
          }}
          inputMode="decimal"
          placeholder="0"
          hint="Leave blank if they're paying later — it'll show up under dues."
          error={errorFor('collectNowP')}
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

        {balanceP !== null && balanceP > 0 && (
          <div
            style={{
              marginTop: space.md,
              fontFamily: font.body,
              fontSize: 13,
              color: color.warning,
              fontWeight: 600,
            }}
          >
            Balance due after this: {formatINR(balanceP)}
          </div>
        )}
      </div>

      <TextField label="Notes (optional)" value={notes} onChange={setNotes} multiline />
    </Sheet>
  );
}
