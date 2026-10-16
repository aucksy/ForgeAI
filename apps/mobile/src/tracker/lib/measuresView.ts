/**
 * The Measures page's choices and its one entry form (R3, PLAN §4.3 — Hevy's Measures). PURE.
 * Body weight sits beside the ten measurements as one more chip; the screens store body weight
 * in kg and lengths in cm, whatever the member types in.
 */
import { todayISO, tinyDateWithYear } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { shownToKg, type UnitSystem } from '@/lib/units';

import { MEASURES, MEASURE_LABEL, isMeasureKind, measurementsToSave, parseMeasure, shownToMeasure, type MeasureKind } from '../engine/measurements';

export type MeasureChip = 'bodyweight' | MeasureKind;

/** Chip order: Hevy's (body weight, waist, body fat), then the rest head to toe. */
export const MEASURE_CHIPS: readonly MeasureChip[] = [
  'bodyweight',
  'waist',
  'body_fat',
  ...MEASURES.filter((k) => k !== 'waist' && k !== 'body_fat'),
];

export function chipLabel(c: MeasureChip): string {
  return c === 'bodyweight' ? 'Body weight' : MEASURE_LABEL[c];
}

/** The chip the page opens on: `?kind=bodyweight` or a measurement, else body weight. */
export function openingChip(param: unknown): MeasureChip {
  const v = Array.isArray(param) ? param[0] : param;
  if (v === 'bodyweight' || v === 'weight') return 'bodyweight';
  return isMeasureKind(v) ? v : 'bodyweight';
}

export interface EntryPlan {
  /** Body weight to log, in kg (null = box left blank). */
  weightKg: number | null;
  /** Measurements to log, stored units (cm or %). */
  measures: Partial<Record<MeasureKind, number>>;
  /** Boxes that hold something that is not a number, by their label. */
  bad: string[];
  /** True when nothing at all was typed. */
  empty: boolean;
}

/** The "+" form → what to save. Values are typed in the member's units. */
export function entryPlan(weightText: string, typed: Partial<Record<MeasureKind, string>>, units: UnitSystem): EntryPlan {
  const bad: string[] = [];
  const w = parseMeasure(weightText);
  let weightKg: number | null = null;
  if (w != null) {
    if (Number.isNaN(w)) bad.push('Body weight');
    else weightKg = shownToKg(Math.round(w * 10) / 10, units);
  }
  const { values, bad: badKinds } = measurementsToSave(typed);
  for (const k of badKinds) bad.push(MEASURE_LABEL[k]);
  const measures: Partial<Record<MeasureKind, number>> = {};
  for (const k of Object.keys(values) as MeasureKind[]) measures[k] = shownToMeasure(k, values[k] as number, units);
  return { weightKg, measures, bad, empty: weightKg == null && Object.keys(measures).length === 0 && bad.length === 0 };
}

/**
 * The line under a measure's latest value: "−4.2 kg since 12 Mar 2023" — with the year whenever it
 * is not this year (C2-6, 16 Oct 2026 audit: "since 12 Mar" read as this March). PURE.
 */
export function changeSinceText(change: number, unit: string, fromISO: string, today: string = todayISO()): string {
  const signed = `${change > 0 ? '+' : change < 0 ? '−' : ''}${trimNum(Math.abs(change))}`;
  return `${signed} ${unit} since ${tinyDateWithYear(fromISO, today)}`;
}
