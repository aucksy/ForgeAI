/**
 * Body measurements — Phase 3. PURE. Free here (Hevy keeps all but two behind Pro).
 *
 * Ten common ones, head to toe. Lengths are STORED in centimetres and shown in the member's
 * unit (inches under "lb, miles", v0.27.0); body fat is a percentage. One value per measurement per
 * day: logging the same day again replaces it, like body weight.
 */
import { trimNum } from '@/lib/format';
import { cmToShown, displayUnits, lengthUnitOf, shownToCm, type UnitSystem } from '@/lib/units';

export type MeasureKind = 'body_fat' | 'neck' | 'shoulders' | 'chest' | 'arm' | 'forearm' | 'waist' | 'hips' | 'thigh' | 'calf';

/** Form and chip order: body fat, then head to toe. */
export const MEASURES: readonly MeasureKind[] = ['body_fat', 'neck', 'shoulders', 'chest', 'arm', 'forearm', 'waist', 'hips', 'thigh', 'calf'];

export const MEASURE_LABEL: Record<MeasureKind, string> = {
  body_fat: 'Body fat',
  neck: 'Neck',
  shoulders: 'Shoulders',
  chest: 'Chest',
  arm: 'Arm',
  forearm: 'Forearm',
  waist: 'Waist',
  hips: 'Hips',
  thigh: 'Thigh',
  calf: 'Calf',
};

/** The unit shown beside a measurement: "%", "cm", or "in" under "lb, miles". */
export function measureUnit(kind: MeasureKind, u: UnitSystem = displayUnits()): '%' | 'cm' | 'in' {
  return kind === 'body_fat' ? '%' : lengthUnitOf(u);
}

/** A stored value (cm, or %) → the number shown. */
export function measureToShown(kind: MeasureKind, value: number, u: UnitSystem = displayUnits()): number {
  return kind === 'body_fat' ? value : cmToShown(value, u);
}

/** A typed value in the shown unit → the value to store (cm, or %). */
export function shownToMeasure(kind: MeasureKind, value: number, u: UnitSystem = displayUnits()): number {
  return kind === 'body_fat' ? value : shownToCm(value, u);
}

/** "81.5 cm", "32.1 in", "18.2 %" — a stored value in words. */
export function fmtMeasure(kind: MeasureKind, value: number, u: UnitSystem = displayUnits()): string {
  return `${trimNum(measureToShown(kind, value, u))} ${measureUnit(kind, u)}`;
}

export function isMeasureKind(v: unknown): v is MeasureKind {
  return typeof v === 'string' && (MEASURES as readonly string[]).includes(v);
}

export interface MeasurementEntry {
  id: string;
  dateISO: string;
  kind: MeasureKind;
  value: number;
}

/**
 * What was typed in a measurement box: a positive number (a comma works as the decimal
 * point), null for blank, or NaN for something that is not a number. No upper limit — the
 * member knows their own body.
 */
export function parseMeasure(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return Number.NaN;
  const v = parseFloat(t);
  return v > 0 && Number.isFinite(v) ? v : Number.NaN;
}

/**
 * The typed form → the values to save, or the names of the boxes that are not numbers.
 * Values come back in the unit TYPED (rounded to 0.1); store them through `shownToMeasure`.
 */
export function measurementsToSave(typed: Partial<Record<MeasureKind, string>>): { values: Partial<Record<MeasureKind, number>>; bad: MeasureKind[] } {
  const values: Partial<Record<MeasureKind, number>> = {};
  const bad: MeasureKind[] = [];
  for (const kind of MEASURES) {
    const raw = typed[kind];
    if (raw == null) continue;
    const v = parseMeasure(raw);
    if (v == null) continue;
    if (Number.isNaN(v)) bad.push(kind);
    else values[kind] = Math.round(v * 10) / 10;
  }
  return { values, bad };
}

export interface MeasureSummary {
  kind: MeasureKind;
  latest: number;
  latestDateISO: string;
  /** Change since the first entry; null with only one entry. */
  change: number | null;
  count: number;
}

/** Latest value and change since the first, per measurement that has any entry. */
export function summarize(entries: readonly MeasurementEntry[]): MeasureSummary[] {
  const by = new Map<MeasureKind, MeasurementEntry[]>();
  for (const e of entries) {
    const list = by.get(e.kind) ?? [];
    list.push(e);
    by.set(e.kind, list);
  }
  const out: MeasureSummary[] = [];
  for (const kind of MEASURES) {
    const list = by.get(kind);
    if (!list || list.length === 0) continue;
    const sorted = [...list].sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    out.push({
      kind,
      latest: last.value,
      latestDateISO: last.dateISO,
      change: sorted.length > 1 ? Math.round((last.value - first.value) * 10) / 10 : null,
      count: sorted.length,
    });
  }
  return out;
}

/** One measurement's points for the chart, oldest first. */
export function seriesFor(entries: readonly MeasurementEntry[], kind: MeasureKind): { x: string; y: number }[] {
  return entries
    .filter((e) => e.kind === kind)
    .sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0))
    .map((e) => ({ x: e.dateISO, y: e.value }));
}
