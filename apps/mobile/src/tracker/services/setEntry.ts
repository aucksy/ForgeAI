/**
 * The entry bar above the keyboard (live workout) — PURE, so every rule is unit-tested.
 *
 * While a set's number box has the cursor, a slim bar sits on the keyboard:
 *   weight box: "− 2.5" "+ 2.5" (the exercise's step, in the member's unit)
 *   reps box:   "− 1"   "+ 1"
 *   time box:   "− 15 s" "+ 15 s"
 *   distance:   no steppers (a step that fits a 5 km run and a 20 m sled push does not exist)
 * and "Copy to sets below".
 *
 * Every number starts from what the member SEES: the typed value, or — in an empty box — the
 * grey hint (`fillForSet`), shown by exactly the same rule as the row's `hintTexts`.
 */
import { trimNum } from '@/lib/format';
import { KG_PER_LB, kgToShown, stepFor, weightUnitOf, type UnitSystem } from '@/lib/units';

import { hasDistance, hasReps, hasTime, hasWeight, type LogType } from '../engine/logTypes';
import type { DraftExercise, DraftSet, SetFill } from '../store/activeWorkoutStore';

/** Which box of a set has the cursor. */
export type EntryField = 'weight' | 'reps' | 'time' | 'distance';

/** The values a set's boxes hold, stored form (weight kg as typed, help positive). */
export interface EntryValues {
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
}

/** Time boxes step by this many seconds. */
export const TIME_STEP_SEC = 15;
/** The largest numbers a box keeps (its typing limits: 4 weight digits, 3 rep digits). */
const MAX_WEIGHT_SHOWN = 9999;
const MAX_REPS = 999;
const MAX_TIME_SEC = 99 * 3600 + 59 * 60 + 59;

/** Does this exercise's row have this box? */
export function fieldOf(lt: LogType, field: EntryField): boolean {
  if (field === 'weight') return hasWeight(lt);
  if (field === 'reps') return hasReps(lt);
  if (field === 'time') return hasTime(lt);
  return hasDistance(lt);
}

/**
 * The weight step in the member's unit: the exercise's own kg step; under pounds the same pound
 * step Targets and warm-ups use (`stepFor`: 2.5 kg → 5 lb, 5 kg → 10 lb, a "5 lb" step → 5 lb).
 * Review fix: before, every step under pounds was 2.5 or 5 lb whatever the member had chosen. To
 * 0.01 at most (a step chosen in pounds and shown in kg), never a "2.4999".
 */
export function weightStepShown(incrementKg: number | null | undefined, u: UnitSystem): number {
  const kg = incrementKg != null && Number.isFinite(incrementKg) && incrementKg > 0 ? incrementKg : 2.5;
  if (u === 'imperial') return Math.round((stepFor(kg, 'imperial') / KG_PER_LB) * 100) / 100;
  return Math.max(0.01, Math.round(kg * 100) / 100);
}

/**
 * What the boxes of this set SHOW, field by field: the typed number, else the grey hint the row
 * draws (the same rule as `hintTexts`: a weight hint on weight × reps even at 0, else only when
 * above 0; reps, time and distance hints only above 0). A field showing nothing is absent.
 */
export function shownValues(s: Pick<DraftSet, 'weightKg' | 'reps' | 'durationSec' | 'distanceM'>, fill: SetFill | null, lt: LogType): EntryValues {
  const out: EntryValues = {};
  if (hasWeight(lt)) {
    const hint = fill && (lt === 'weight_reps' || fill.weightKg) ? fill.weightKg : null;
    const v = s.weightKg ?? hint;
    if (v != null && Number.isFinite(v)) out.weightKg = v;
  }
  if (hasReps(lt)) {
    const v = s.reps ?? (fill && fill.reps > 0 ? fill.reps : null);
    if (v != null && Number.isFinite(v)) out.reps = v;
  }
  if (hasTime(lt)) {
    const v = s.durationSec ?? (fill?.durationSec ? fill.durationSec : null);
    if (v != null && Number.isFinite(v)) out.durationSec = v;
  }
  if (hasDistance(lt)) {
    const v = s.distanceM ?? (fill?.distanceM ? fill.distanceM : null);
    if (v != null && Number.isFinite(v)) out.distanceM = v;
  }
  return out;
}

/**
 * One step from `base` on the `step` grid: a number on the grid moves one step; one off it
 * (61 kg, step 2.5) moves to the nearest grid point that way (62.5 up, 60 down). PURE.
 */
export function stepOnGrid(base: number, step: number, dir: 1 | -1): number {
  if (!(step > 0)) return base;
  const q = base / step;
  const r = Math.round(q);
  const onGrid = Math.abs(q - r) < 1e-6;
  const k = onGrid ? r + dir : dir > 0 ? Math.ceil(q) : Math.floor(q);
  return k * step;
}

export interface StepContext {
  logType: LogType;
  incrementKg?: number | null;
  units: UnitSystem;
}

/**
 * The new stored value for one step of `field`, or null when the step changes nothing (already
 * at the floor or the box's limit, or a box this row has no steppers for). Floors: weight 0
 * (a bodyweight or no-help set), reps 1, time 15 s. PURE.
 */
export function stepValue(
  s: Pick<DraftSet, 'weightKg' | 'reps' | 'durationSec' | 'distanceM'>,
  fill: SetFill | null,
  field: EntryField,
  dir: 1 | -1,
  ctx: StepContext,
): number | null {
  if (!fieldOf(ctx.logType, field)) return null;
  const shown = shownValues(s, fill, ctx.logType);
  if (field === 'weight') {
    const step = weightStepShown(ctx.incrementKg, ctx.units);
    // Start from the number in the box (pounds as the box shows them, to 0.1 lb).
    const kg = shown.weightKg ?? 0;
    const base = ctx.units === 'imperial' ? Math.round(kgToShown(kg, ctx.units) * 10) / 10 : kg;
    const raw = stepOnGrid(base, step, dir);
    const next = Math.round(Math.max(0, raw) * 1000) / 1000;
    if (next > MAX_WEIGHT_SHOWN) return null;
    if (dir < 0 ? next >= base : next <= base) return null;
    // Pounds are stored as their exact kilograms (as typing them does).
    return ctx.units === 'imperial' ? next * KG_PER_LB : next;
  }
  if (field === 'reps') {
    const base = shown.reps ?? 0;
    const next = Math.max(1, Math.round(base) + dir);
    if (next > MAX_REPS) return null;
    if (dir < 0 ? next >= base : next <= base) return null;
    return next;
  }
  if (field === 'time') {
    const base = shown.durationSec ?? 0;
    const next = Math.max(TIME_STEP_SEC, stepOnGrid(base, TIME_STEP_SEC, dir));
    if (next > MAX_TIME_SEC) return null;
    if (dir < 0 ? next >= base : next <= base) return null;
    return Math.round(next);
  }
  return null;
}

/** The store patch for one step, or null when nothing changes. PURE. */
export function stepPatch(
  s: Pick<DraftSet, 'weightKg' | 'reps' | 'durationSec' | 'distanceM'>,
  fill: SetFill | null,
  field: EntryField,
  dir: 1 | -1,
  ctx: StepContext,
): Partial<Pick<DraftSet, 'weightKg' | 'reps' | 'durationSec'>> | null {
  const v = stepValue(s, fill, field, dir, ctx);
  if (v == null) return null;
  if (field === 'weight') return { weightKg: v };
  if (field === 'reps') return { reps: v };
  if (field === 'time') return { durationSec: v };
  return null;
}

/** The bar's two step buttons for a box: their text and what a screen reader says. PURE. */
export function stepLabels(
  field: EntryField,
  incrementKg: number | null | undefined,
  u: UnitSystem,
): { minus: string; plus: string; amount: string } | null {
  if (field === 'weight') {
    const step = trimNum(weightStepShown(incrementKg, u), 2);
    return { minus: `− ${step}`, plus: `+ ${step}`, amount: `${step} ${weightUnitOf(u) === 'lb' ? 'pounds' : 'kilograms'}` };
  }
  if (field === 'reps') return { minus: '− 1', plus: '+ 1', amount: '1 rep' };
  if (field === 'time') return { minus: `− ${TIME_STEP_SEC} s`, plus: `+ ${TIME_STEP_SEC} s`, amount: `${TIME_STEP_SEC} seconds` };
  return null;
}

/**
 * How a screen reader names a row — the card's own words ("set 2", "warm-up 1", "drop set 3"):
 * working sets count past warm-ups, as the SET column does. PURE.
 */
export function rowSpoken(sets: readonly Pick<DraftSet, 'key' | 'isWarmup' | 'setType'>[], setKey: string): string {
  let working = 0;
  let warm = 0;
  for (const s of sets) {
    if (s.isWarmup) warm += 1;
    else working += 1;
    if (s.key === setKey) return s.isWarmup ? `warm-up ${warm}` : `${s.setType === 'drop' ? 'drop set' : 'set'} ${working}`;
  }
  return 'set';
}

// ---------------------------------------------------------------- copy to sets below

/** A row's kind for copying: warm-ups copy only into warm-ups, drop sets into drop sets. */
export function copyKind(s: Pick<DraftSet, 'isWarmup' | 'setType'>): 'warmup' | 'drop' | 'work' {
  if (s.isWarmup) return 'warmup';
  return s.setType === 'drop' ? 'drop' : 'work';
}

/** The rows "Copy to sets below" fills: every row below of the same kind not yet ticked. PURE. */
export function copyTargets(sets: readonly DraftSet[], setKey: string): string[] {
  const i = sets.findIndex((s) => s.key === setKey);
  if (i < 0) return [];
  const kind = copyKind(sets[i]);
  return sets
    .slice(i + 1)
    .filter((s) => !s.done && copyKind(s) === kind)
    .map((s) => s.key);
}

/**
 * The values a copy writes: what this row's boxes show (typed, else the hint), for this log
 * type's boxes only. null when no box shows a number. PURE.
 */
export function copyValues(
  s: Pick<DraftSet, 'weightKg' | 'reps' | 'durationSec' | 'distanceM'>,
  fill: SetFill | null,
  lt: LogType,
): EntryValues | null {
  const v = shownValues(s, fill, lt);
  return Object.keys(v).length > 0 ? v : null;
}

/** "Copied to 3 sets below" / "Copied to 1 set below". */
export function copiedText(count: number): string {
  return `Copied to ${count} ${count === 1 ? 'set' : 'sets'} below`;
}

/** One row as it was before a copy, so Undo can put it back exactly. */
export interface CopyBefore {
  setKey: string;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null | undefined;
  distanceM: number | null | undefined;
  autoFilled: DraftSet['autoFilled'];
  editedAt: number | undefined;
}

const FIELD_KEYS = ['weightKg', 'reps', 'durationSec', 'distanceM'] as const;

/** Write `values` into the target rows. Returns the new rows and what they held. PURE. */
export function applyCopy(
  sets: readonly DraftSet[],
  targets: readonly string[],
  values: EntryValues,
  now: number,
): { sets: DraftSet[]; before: CopyBefore[] } {
  const want = new Set(targets);
  const before: CopyBefore[] = [];
  const next = sets.map((s) => {
    if (!want.has(s.key) || s.done) return s;
    before.push({
      setKey: s.key,
      weightKg: s.weightKg,
      reps: s.reps,
      durationSec: s.durationSec,
      distanceM: s.distanceM,
      autoFilled: s.autoFilled,
      editedAt: s.editedAt,
    });
    const out: DraftSet = { ...s, editedAt: now };
    for (const k of FIELD_KEYS) if (values[k] != null) out[k] = values[k] as number;
    if (s.autoFilled) {
      out.autoFilled = {
        weight: values.weightKg != null ? false : s.autoFilled.weight,
        reps: values.reps != null ? false : s.autoFilled.reps,
        duration: values.durationSec != null ? false : s.autoFilled.duration,
        distance: values.distanceM != null ? false : s.autoFilled.distance,
      };
    }
    return out;
  });
  return { sets: next, before };
}

/**
 * Undo a copy: each row gets back what it held — field by field, only where the copied number
 * is still there (a number typed since stays) and only while the row is not ticked. PURE.
 */
export function undoCopyRows(sets: readonly DraftSet[], before: readonly CopyBefore[], values: EntryValues): DraftSet[] {
  const byKey = new Map(before.map((b) => [b.setKey, b]));
  return sets.map((s) => {
    const b = byKey.get(s.key);
    if (!b || s.done) return s;
    const out: DraftSet = { ...s };
    let all = true;
    for (const k of FIELD_KEYS) {
      if (values[k] == null) continue;
      if (s[k] === values[k]) (out as unknown as Record<string, unknown>)[k] = b[k];
      else all = false;
    }
    if (all) {
      out.autoFilled = b.autoFilled;
      out.editedAt = b.editedAt;
      if (out.autoFilled === undefined) delete out.autoFilled;
      if (out.editedAt === undefined) delete out.editedAt;
    }
    for (const k of ['durationSec', 'distanceM'] as const) if (out[k] === undefined) delete out[k];
    return out;
  });
}

// ---------------------------------------------------------------- the bar

export interface EntryBarModel {
  exKey: string;
  setKey: string;
  field: EntryField;
  fill: SetFill | null;
  who: string;
  steps: { minus: string; plus: string; amount: string; canMinus: boolean; canPlus: boolean } | null;
  canCopy: boolean;
}

/** PURE: what the bar shows for the focused box, or null when it has nothing to offer. */
export function entryBarModel(
  ex: DraftExercise | undefined,
  setKey: string,
  field: EntryField,
  fill: SetFill | null,
  units: UnitSystem,
): EntryBarModel | null {
  const row: DraftSet | undefined = ex?.sets.find((s) => s.key === setKey);
  if (!ex || !row) return null;
  const lt = ex.logType ?? 'weight_reps';
  if (!fieldOf(lt, field)) return null;
  const ctx = { logType: lt, incrementKg: ex.incrementKg, units };
  const labels = stepLabels(field, ex.incrementKg, units);
  const steps = labels
    ? {
        ...labels,
        canMinus: stepValue(row, fill, field, -1, ctx) != null,
        canPlus: stepValue(row, fill, field, 1, ctx) != null,
      }
    : null;
  const canCopy = copyTargets(ex.sets, setKey).length > 0 && copyValues(row, fill, lt) != null;
  if (!steps && !canCopy) return null;
  return { exKey: ex.key, setKey, field, fill, who: `${ex.name} ${rowSpoken(ex.sets, setKey)}`, steps, canCopy };
}
