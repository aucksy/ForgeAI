/**
 * Membership plans — the gym's price list.
 *
 * Editing a plan never rewrites history: memberships snapshot their name and price
 * at the moment of sale, so raising prices tomorrow leaves every receipt printed
 * today exactly as it was. Retiring a plan hides it from the sell flow without
 * touching the members who are on it.
 */

import { useMemo, useState } from 'react';

import { useCan } from '../../auth/AuthProvider';
import { useCrm } from '../../store';
import { formatDay } from '../../logic/dates';
import { computeEndDate } from '../../logic/membership';
import { formatINR, parseCount, parseRupeeInput } from '../../logic/money';
import { starterPlans } from '../../data/demo';
import type { DurationUnit, Plan, PlanDraft } from '../../types';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Grid,
  PageHeader,
  Pill,
  Row,
  SelectField,
  Sheet,
  TextField,
  color,
  font,
  space,
  useIsCompact,
} from '../kit';
import { tr } from '../../i18n';

export function PlansScreen() {
  const { snapshot, today, createPlan } = useCrm();
  // Staff (front desk) reads the price list to sell from; only an owner adds or edits plans.
  const canEdit = useCan()('editPlans');
  const [editing, setEditing] = useState<Plan | null>(null);
  const [adding, setAdding] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plans = useMemo(
    () => [...snapshot.plans].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [snapshot.plans],
  );

  /**
   * Five sequential writes, each yielding through a full reload and re-render —
   * so without a guard the button stays clickable and a double-click produces ten
   * plans with duplicate names that can only be retired, never deleted.
   */
  const addStarterPlans = async () => {
    if (seeding) return;
    setSeeding(true);
    setError(null);
    try {
      for (const p of starterPlans(today)) {
        await createPlan({
          name: p.name,
          durationUnit: p.durationUnit,
          durationCount: p.durationCount,
          priceP: p.priceP,
          joiningFeeP: p.joiningFeeP,
          description: p.description,
          active: p.active,
          sortOrder: p.sortOrder,
        });
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? tr(
              `${e.message} Some plans may already have been added — check the list.`,
              `${e.message} Kuch plan shayad jud chuke hain — list dekho.`,
            )
          : tr('Could not add the starter plans.', 'Starter plan jud nahi paaye.'),
      );
    } finally {
      setSeeding(false);
    }
  };

  return (
    <>
      <PageHeader
        title={tr('Plans', 'Plan / Package')}
        subtitle={tr('What you sell, and for how much', 'Aap kya bechte hain, kitne mein')}
        actions={canEdit ? <Button onClick={() => setAdding(true)}>{tr('+ Add plan', '+ Naya plan jodo')}</Button> : undefined}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {plans.length === 0 ? (
        <Card>
          <EmptyState
            title={tr('No plans yet', 'Abhi koi plan nahi')}
            body={
              canEdit
                ? tr(
                    'Add your own, or start from a typical Indian gym price list and edit the numbers.',
                    'Apna plan jodo, ya ek aam Indian gym ki rate list se shuru karke fees badlo.',
                  )
                : tr('Ask your gym owner to add the plans you sell.', 'Gym Owner se bolo ki Plan jod dein.')
            }
            action={
              canEdit && (
              <Row gap={space.sm}>
                <Button onClick={() => setAdding(true)}>{tr('+ Add plan', '+ Naya plan jodo')}</Button>
                <Button variant="ghost" onClick={addStarterPlans} disabled={seeding}>
                  {seeding ? tr('Adding…', 'Jod rahe hain…') : tr('Use a starter price list', 'Taiyaar rate list lo')}
                </Button>
              </Row>
              )
            }
          />
        </Card>
      ) : (
        // One price list, one row per plan. As cards, five plans left two on the
        // second row beside an empty slot — and a gym can have any number of plans,
        // so any card count orphans somewhere. A list has no last row to be short.
        <Card pad={0}>
          {plans.map((plan, i) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              today={today}
              first={i === 0}
              onEdit={canEdit ? () => setEditing(plan) : undefined}
            />
          ))}
        </Card>
      )}

      {(adding || editing) && (
        <PlanSheet
          editing={editing ?? undefined}
          nextSortOrder={plans.length + 1}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function PlanRow({
  plan,
  today,
  first,
  onEdit,
}: {
  plan: Plan;
  today: string;
  first: boolean;
  /** Owners only: absent for Staff, and the Edit button is not drawn. */
  onEdit?: () => void;
}) {
  const compact = useIsCompact();
  const sample = computeEndDate(today, plan.durationUnit, plan.durationCount);

  const name = (
    <div style={{ minWidth: 0 }}>
      <Row gap={space.sm}>
        <span style={{ fontFamily: font.display, fontSize: 16, fontWeight: 700, color: color.ink }}>{plan.name}</span>
        {!plan.active && <Pill tone="muted">{tr('Retired', 'Band')}</Pill>}
      </Row>
      {plan.description && (
        <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary, marginTop: 2 }}>
          {plan.description}
        </div>
      )}
    </div>
  );
  const price = (
    <div style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: color.accentBright, whiteSpace: 'nowrap' }}>
      {formatINR(plan.priceP)}
    </div>
  );
  const terms = (
    <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
      {durationLabel(plan.durationUnit, plan.durationCount)}
      <div style={{ color: color.inkMuted, fontSize: 12, marginTop: 2 }}>
        {plan.joiningFeeP > 0
          ? tr(`+ ${formatINR(plan.joiningFeeP)} joining fee`, `+ ${formatINR(plan.joiningFeeP)} admission fees`)
          : tr('No joining fee', 'Admission fees nahi')}
      </div>
    </div>
  );
  const runs = (
    <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
      {tr('Sold today, runs until', 'Aaj diya to chalega')}
      <div style={{ color: color.inkSecondary, fontSize: 13, marginTop: 2 }}>{formatDay(sample)}</div>
    </div>
  );
  const edit = onEdit ? (
    <Button variant="ghost" onClick={onEdit} ariaLabel={tr(`Edit ${plan.name}`, `${plan.name} badlo`)}>
      {tr('Edit', 'Badlo')}
    </Button>
  ) : null;

  const shell: React.CSSProperties = {
    padding: `${space.lg}px ${space.xl}px`,
    borderTop: first ? 'none' : `1px solid ${color.border}`,
  };

  if (compact) {
    return (
      <div style={{ ...shell, display: 'grid', gap: space.md }}>
        <Row gap={space.md} wrap={false} align="flex-start">
          <div style={{ flex: 1, minWidth: 0 }}>{name}</div>
          {price}
        </Row>
        <Row gap={space.md} wrap={false} align="center">
          <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.md }}>
            {terms}
            {runs}
          </div>
          {edit}
        </Row>
      </div>
    );
  }

  return (
    <div
      style={{
        ...shell,
        display: 'grid',
        // No Edit column for Staff: an empty fifth column would still add a gap at the right.
        gridTemplateColumns: `minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1.2fr)${edit ? ' auto' : ''}`,
        gap: space.lg,
        alignItems: 'center',
      }}
    >
      {name}
      {price}
      {terms}
      {runs}
      {edit}
    </div>
  );
}

function durationLabel(unit: DurationUnit, count: number): string {
  if (unit === 'day') return count === 1 ? tr('1 day', '1 din') : tr(`${count} days`, `${count} din`);
  if (count === 12) return tr('12 months (1 year)', '12 mahine (1 saal)');
  return count === 1 ? tr('1 month', '1 mahina') : tr(`${count} months`, `${count} mahine`);
}

function PlanSheet({
  editing,
  nextSortOrder,
  onClose,
}: {
  editing?: Plan;
  nextSortOrder: number;
  onClose: () => void;
}) {
  const { createPlan, updatePlan } = useCrm();
  const [name, setName] = useState(editing?.name ?? '');
  const [unit, setUnit] = useState<DurationUnit>(editing?.durationUnit ?? 'month');
  const [count, setCount] = useState(String(editing?.durationCount ?? 1));
  const [price, setPrice] = useState(editing ? String(editing.priceP / 100) : '');
  const [joining, setJoining] = useState(editing ? String(editing.joiningFeeP / 100) : '0');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [active, setActive] = useState(editing ? editing.active : true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return setError(tr('Give the plan a name.', 'Plan ka naam likho.'));

    // Strict: `Number('0x10')` is 16 and `Number('1e2')` is 100 — the same trap
    // `parseRupeeInput` two lines below already guards against.
    const countNum = parseCount(count, 1, 120);
    if (countNum === null) {
      return setError(
        tr(
          'Duration must be a whole number between 1 and 120.',
          'Kitna samay (mahine / din): 1 se 120 ke beech poora number likho.',
        ),
      );
    }

    const priceP = parseRupeeInput(price);
    if (priceP === null) return setError(tr('Price isn’t a valid amount.', 'Fees sahi rakam nahi hai.'));

    const joiningFeeP = joining.trim() === '' ? 0 : parseRupeeInput(joining);
    if (joiningFeeP === null) return setError(tr('Joining fee isn’t a valid amount.', 'Admission fees sahi rakam nahi hai.'));

    const draft: PlanDraft = {
      name: trimmed,
      durationUnit: unit,
      durationCount: countNum,
      priceP,
      joiningFeeP,
      description: description.trim() || null,
      active,
      sortOrder: editing?.sortOrder ?? nextSortOrder,
    };

    setSaving(true);
    setError(null);
    try {
      if (editing) await updatePlan(editing.id, draft);
      else await createPlan(draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Could not save this plan.', 'Yeh plan save nahi hua.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={editing ? tr('Edit plan', 'Plan badlo') : tr('Add plan', 'Naya plan jodo')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr('Cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('Saving…', 'Save ho raha hai…') : tr('Save plan', 'Plan save karo')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {editing && (
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
          {tr(
            'Changing the price here only affects future sales. Memberships already sold keep the price they were sold at.',
            'Yahan fees badalne se sirf aage ke plan par asar hoga. Jo plan pehle de chuke hain, unki fees wahi rahegi.',
          )}
        </p>
      )}

      <TextField label={tr('Plan name', 'Plan ka naam')} value={name} onChange={setName} placeholder="Quarterly" autoFocus />

      <Grid min={200}>
        <TextField label={tr('Duration', 'Kitna samay')} value={count} onChange={setCount} inputMode="numeric" />
        <SelectField
          label={tr('Unit', 'Mahine ya din')}
          value={unit}
          onChange={(v) => setUnit(v as DurationUnit)}
          options={[
            { value: 'month', label: tr('Months', 'Mahine') },
            { value: 'day', label: tr('Days', 'Din') },
          ]}
        />
      </Grid>

      <Grid min={200}>
        <TextField label={tr('Price (₹)', 'Fees (₹)')} value={price} onChange={setPrice} inputMode="decimal" placeholder="3000" />
        <TextField
          label={tr('Joining fee (₹)', 'Admission fees (₹)')}
          value={joining}
          onChange={setJoining}
          inputMode="decimal"
          hint={tr("Charged once, on a member's first plan.", 'Member ke pehle plan par ek baar lagti hai.')}
        />
      </Grid>

      <TextField label={tr('Description (optional)', 'Jaankari (zaroori nahi)')} value={description} onChange={setDescription} multiline />

      <SelectField
        label={tr('Availability', 'Chalu ya band')}
        value={active ? 'active' : 'retired'}
        onChange={(v) => setActive(v === 'active')}
        options={[
          { value: 'active', label: tr('Sellable', 'Chalu — de sakte hain') },
          { value: 'retired', label: tr('Retired — hidden from new sales', 'Band — naye members ko nahi dikhega') },
        ]}
      />
    </Sheet>
  );
}
