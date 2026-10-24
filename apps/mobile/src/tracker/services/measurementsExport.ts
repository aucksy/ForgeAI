/**
 * "Save my measurements" — the member's body weight and body measurements as one CSV, like
 * Hevy's Settings → Export data → "Export measurements". One row per day that has any value,
 * oldest first; a blank cell where nothing was logged that day.
 *
 * Columns follow Hevy's own body-measurement fields, in Hevy's order (Hevy public API,
 * `BodyMeasurement` schema at https://api.hevyapp.com/docs/ — date, weight_kg, lean_mass_kg,
 * fat_percent, neck_cm, shoulder_cm, chest_cm, left_bicep_cm, right_bicep_cm, left_forearm_cm,
 * right_forearm_cm, abdomen, waist, hips, left_thigh, right_thigh, left_calf, right_calf).
 * Hevy's measurements CSV header itself is not published anywhere we could find (searched
 * 15 Oct 2026), so the CSV uses those names with the unit on every length column. Only what
 * ForgeAI stores is written: no lean mass and no abdomen, and ONE arm / forearm / thigh / calf
 * (we never ask left vs right), so those are `bicep_cm`, `forearm_cm`, `thigh_cm`, `calf_cm` —
 * copying one number into Hevy's left AND right columns would claim a measurement never taken.
 *
 * Units: a "lb, miles" member gets `weight_lbs` (Hevy's own spelling, as in "Save my history")
 * and inches (`_in`); everyone else kg and cm. Body fat is a percentage either way. Numbers
 * have at most 1 decimal.
 *
 * Demo data (the sample member) never leaves the phone — nothing is written while it is loaded.
 * Reads only. The file goes to the cache folder; the previous one is removed first.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { getDb } from '@/db';
import { todayISO } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { CM_PER_IN, KG_PER_LB } from '@/lib/units';
import { isDemoData } from '@/onboarding/db/dataActions';
import type { UnitSystem } from '@/types/models';

import { isMeasureKind, type MeasureKind } from '../engine/measurements';

/** What one day holds: body weight in kg; lengths in cm; body fat in %. Absent = not logged. */
export interface MeasurementDay {
  dateISO: string;
  weightKg?: number;
  values: Partial<Record<MeasureKind, number>>;
}

/** Our measurement → its column stem, in Hevy's order. `body_fat` has no unit suffix. */
const COLUMNS: readonly { kind: MeasureKind; stem: string }[] = [
  { kind: 'body_fat', stem: 'fat_percent' },
  { kind: 'neck', stem: 'neck' },
  { kind: 'shoulders', stem: 'shoulder' },
  { kind: 'chest', stem: 'chest' },
  { kind: 'arm', stem: 'bicep' },
  { kind: 'forearm', stem: 'forearm' },
  { kind: 'waist', stem: 'waist' },
  { kind: 'hips', stem: 'hips' },
  { kind: 'thigh', stem: 'thigh' },
  { kind: 'calf', stem: 'calf' },
];

/** The header's column names for these units. PURE. */
export function measurementColumns(units: UnitSystem): string[] {
  const imperial = units === 'imperial';
  const len = imperial ? '_in' : '_cm';
  return [
    'date',
    imperial ? 'weight_lbs' : 'weight_kg',
    ...COLUMNS.map((c) => (c.kind === 'body_fat' ? c.stem : `${c.stem}${len}`)),
  ];
}

/** One CSV field: quoted (quotes doubled) only when it holds a comma, quote or line break. PURE. */
export function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const usable = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;

/** A number with at most 1 decimal ("77.3", "80"). PURE. */
function num(v: number): string {
  return trimNum(Math.round(v * 10) / 10, 1);
}

/**
 * Days → CSV text (header + one line per day with any value, oldest first, each line ending in
 * "\n"). Days with nothing usable are left out; two entries for the same day are merged.
 * Returns the text and how many days it holds. PURE.
 */
export function measurementsCsv(days: readonly MeasurementDay[], units: UnitSystem): { text: string; days: number } {
  const imperial = units === 'imperial';
  const merged = new Map<string, MeasurementDay>();
  for (const d of days) {
    const m = merged.get(d.dateISO) ?? { dateISO: d.dateISO, values: {} };
    if (usable(d.weightKg)) m.weightKg = d.weightKg;
    for (const [k, v] of Object.entries(d.values) as [MeasureKind, number | undefined][]) {
      if (usable(v)) m.values[k] = v;
    }
    merged.set(d.dateISO, m);
  }
  const lines: string[] = [];
  for (const d of [...merged.values()].sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0))) {
    const weight = usable(d.weightKg) ? num(imperial ? d.weightKg / KG_PER_LB : d.weightKg) : '';
    const cells = COLUMNS.map(({ kind }) => {
      const v = d.values[kind];
      if (!usable(v)) return '';
      return num(kind === 'body_fat' || !imperial ? v : v / CM_PER_IN);
    });
    if (weight === '' && cells.every((c) => c === '')) continue;
    lines.push([d.dateISO, weight, ...cells].map(csvField).join(','));
  }
  const header = measurementColumns(units).map(csvField).join(',');
  return { text: `${header}\n${lines.map((l) => `${l}\n`).join('')}`, days: lines.length };
}

/** Every body weight and measurement on this phone, as days (any order). Reads only. */
export async function readMeasurementDays(): Promise<MeasurementDay[]> {
  const db = getDb();
  const [weights, measures] = await Promise.all([
    db.getAllAsync<{ date_iso: string; weight_kg: number }>('SELECT date_iso, weight_kg FROM body_weight'),
    db.getAllAsync<{ date_iso: string; kind: string; value: number }>('SELECT date_iso, kind, value FROM body_measurements'),
  ]);
  const days = new Map<string, MeasurementDay>();
  const day = (iso: string): MeasurementDay => {
    let d = days.get(iso);
    if (!d) {
      d = { dateISO: iso, values: {} };
      days.set(iso, d);
    }
    return d;
  };
  for (const w of weights) day(w.date_iso).weightKg = w.weight_kg;
  for (const m of measures) if (isMeasureKind(m.kind)) day(m.date_iso).values[m.kind] = m.value;
  return [...days.values()];
}

/** The file's text, or why there is none (demo loaded / nothing logged). Reads only. */
export async function measurementsFileText(
  units: UnitSystem,
): Promise<{ kind: 'demo' } | { kind: 'empty' } | { kind: 'ready'; text: string; days: number }> {
  if (await isDemoData()) return { kind: 'demo' };
  const csv = measurementsCsv(await readMeasurementDays(), units);
  if (csv.days === 0) return { kind: 'empty' };
  return { kind: 'ready', ...csv };
}

export type SaveMeasurementsResult =
  /** Written; `shared` false when this phone has no share sheet. */
  | { kind: 'saved'; shared: boolean; days: number; uri: string }
  | { kind: 'empty' }
  | { kind: 'demo' }
  | { kind: 'error'; message: string };

/** The plain words the card shows for a result (null = nothing to say: shared fine). PURE. */
export function measurementsNote(r: SaveMeasurementsResult): { text: string; tone: 'muted' | 'error' } | null {
  switch (r.kind) {
    case 'saved':
      return r.shared ? null : { text: 'Sharing isn’t available on this phone, so the file couldn’t be handed over.', tone: 'error' };
    case 'empty':
      return { text: 'Nothing to save yet — log your body weight or a measurement first.', tone: 'muted' };
    case 'demo':
      return { text: 'This is the sample member’s data, so nothing was saved. Remove the sample data and log your own first.', tone: 'muted' };
    case 'error':
      return { text: r.message, tone: 'error' };
  }
}

/** Remove earlier measurement files from the cache folder. */
async function clearOldMeasurementFiles(dir: string): Promise<void> {
  if (!dir) return;
  let names: string[];
  try {
    names = await FileSystem.readDirectoryAsync(dir);
  } catch (e) {
    console.warn('[ForgeErr] measurements export: list old files', e);
    return;
  }
  for (const n of names) {
    if (!/^(?:mettleup|forgeai)-measurements-.*\.csv$/.test(n)) continue; // both names (R-105)
    await FileSystem.deleteAsync(`${dir}${n}`, { idempotent: true }).catch((e: unknown) => {
      console.warn('[ForgeErr] measurements export: remove old file', e);
    });
  }
}

/** Write every body weight and measurement as a CSV and open Android's share sheet. */
export async function saveMyMeasurements(units: UnitSystem): Promise<SaveMeasurementsResult> {
  try {
    const file = await measurementsFileText(units);
    if (file.kind !== 'ready') return file;
    const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
    const uri = `${dir}mettleup-measurements-${todayISO()}.csv`;
    await clearOldMeasurementFiles(dir);
    await FileSystem.writeAsStringAsync(uri, file.text, { encoding: FileSystem.EncodingType.UTF8 });
    let shared = false;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: 'Save my measurements',
      });
      shared = true;
    }
    return { kind: 'saved', shared, days: file.days, uri };
  } catch (e) {
    console.warn('[ForgeErr] measurements export', e);
    return { kind: 'error', message: 'Couldn’t save your measurements. Please try again.' };
  }
}
