/**
 * Membership plans — the gym's price list.
 *
 * Editing a plan never rewrites history: memberships snapshot their name and price
 * at the moment of sale, so raising prices tomorrow leaves every receipt printed
 * today exactly as it was. Retiring a plan hides it from the sell flow without
 * touching the members who are on it.
 */

import { useMemo, useState } from 'react';

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
} from '../kit';

export function PlansScreen() {
  const { snapshot, today, createPlan } = useCrm();
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
          ? `${e.message} Some plans may already have been added — check the list.`
          : 'Could not add the starter plans.',
      );
    } finally {
      setSeeding(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="What you sell, and for how much"
        actions={<Button onClick={() => setAdding(true)}>+ Add plan</Button>}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {plans.length === 0 ? (
        <Card>
          <EmptyState
            title="No plans yet"
            body="Add your own, or start from a typical Indian gym price list and edit the numbers."
            action={
              <Row gap={space.sm}>
                <Button onClick={() => setAdding(true)}>+ Add plan</Button>
                <Button variant="ghost" onClick={addStarterPlans} disabled={seeding}>
                  {seeding ? 'Adding…' : 'Use a starter price list'}
                </Button>
              </Row>
            }
          />
        </Card>
      ) : (
        <Grid min={280}>
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} today={today} onEdit={() => setEditing(plan)} />
          ))}
        </Grid>
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

function PlanCard({ plan, today, onEdit }: { plan: Plan; today: string; onEdit: () => void }) {
  const sample = computeEndDate(today, plan.durationUnit, plan.durationCount);
  return (
    <Card>
      <Row gap={space.sm}>
        <span style={{ fontFamily: font.display, fontSize: 16, fontWeight: 700, color: color.ink, flex: 1 }}>
          {plan.name}
        </span>
        {!plan.active && <Pill tone="muted">Retired</Pill>}
      </Row>

      <div style={{ fontFamily: font.mono, fontSize: 26, fontWeight: 700, color: color.accentBright, marginTop: 6 }}>
        {formatINR(plan.priceP)}
      </div>
      <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary, marginTop: 2 }}>
        {durationLabel(plan.durationUnit, plan.durationCount)}
        {plan.joiningFeeP > 0 && ` · ${formatINR(plan.joiningFeeP)} joining fee`}
      </div>

      {plan.description && (
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
          {plan.description}
        </p>
      )}

      <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: space.md }}>
        Sold today, it would run until {formatDay(sample)}.
      </div>

      <div style={{ marginTop: space.md }}>
        <Button variant="ghost" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </Card>
  );
}

function durationLabel(unit: DurationUnit, count: number): string {
  if (unit === 'day') return count === 1 ? '1 day' : `${count} days`;
  if (count === 12) return '12 months (1 year)';
  return count === 1 ? '1 month' : `${count} months`;
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
    if (trimmed.length < 2) return setError('Give the plan a name.');

    // Strict: `Number('0x10')` is 16 and `Number('1e2')` is 100 — the same trap
    // `parseRupeeInput` two lines below already guards against.
    const countNum = parseCount(count, 1, 120);
    if (countNum === null) {
      return setError('Duration must be a whole number between 1 and 120.');
    }

    const priceP = parseRupeeInput(price);
    if (priceP === null) return setError('Price isn’t a valid amount.');

    const joiningFeeP = joining.trim() === '' ? 0 : parseRupeeInput(joining);
    if (joiningFeeP === null) return setError('Joining fee isn’t a valid amount.');

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
      setError(e instanceof Error ? e.message : 'Could not save this plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={editing ? 'Edit plan' : 'Add plan'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save plan'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {editing && (
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
          Changing the price here only affects future sales. Memberships already sold keep the price
          they were sold at.
        </p>
      )}

      <TextField label="Plan name" value={name} onChange={setName} placeholder="Quarterly" autoFocus />

      <Grid min={200}>
        <TextField label="Duration" value={count} onChange={setCount} inputMode="numeric" />
        <SelectField
          label="Unit"
          value={unit}
          onChange={(v) => setUnit(v as DurationUnit)}
          options={[
            { value: 'month', label: 'Months' },
            { value: 'day', label: 'Days' },
          ]}
        />
      </Grid>

      <Grid min={200}>
        <TextField label="Price (₹)" value={price} onChange={setPrice} inputMode="decimal" placeholder="3000" />
        <TextField
          label="Joining fee (₹)"
          value={joining}
          onChange={setJoining}
          inputMode="decimal"
          hint="Charged once, on a member's first plan."
        />
      </Grid>

      <TextField label="Description (optional)" value={description} onChange={setDescription} multiline />

      <SelectField
        label="Availability"
        value={active ? 'active' : 'retired'}
        onChange={(v) => setActive(v === 'active')}
        options={[
          { value: 'active', label: 'Sellable' },
          { value: 'retired', label: 'Retired — hidden from new sales' },
        ]}
      />
    </Sheet>
  );
}
