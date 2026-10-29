/**
 * F64 (29 Oct 2026) — treadmill and cycle details. PURE.
 *
 * A cardio machine's set can say HOW it was done, not only how long or how far: a treadmill's
 * speed and incline, a bike's, elliptical's, stair climber's or rower's level. Each is optional
 * and lives on the set (`set_entries.speed_kmh / incline_pct / machine_level`, tracker schema
 * v15), so intervals are simply several sets (5:00 at 6 km/h, 1:00 at 12 km/h…). Older sets have
 * none of them and read exactly as before.
 *
 * Research (Hevy, Strong, Fitbod; Trainerize and Fitbit requests): the lifting apps log cardio
 * as time and distance only, and members type speed and incline into notes. So: the fields that
 * fit the machine, right under the set, every one optional.
 *
 * Stored units never change: speed in km/h (shown in mph under "lb, miles"), incline in %, level
 * as the machine's own number.
 */
import { trimNum } from '@/lib/format';
import { displayUnits, M_PER_MILE } from '@/lib/units';
import type { UnitSystem } from '@/types/models';

import type { LogType } from './logTypes';

export type MachineKind = 'treadmill' | 'bike' | 'elliptical' | 'stair' | 'rower';
export type MachineField = 'speed' | 'incline' | 'level';

/** One set's machine details (absent / null = not logged). */
export interface MachineDetails {
  speedKmh?: number | null;
  inclinePct?: number | null;
  level?: number | null;
}

/** The library's cardio machines, by catalogue key. The air bike has no level knob: none. */
const BY_KEY: Readonly<Record<string, MachineKind>> = {
  treadmill_run: 'treadmill',
  incline_treadmill_walk: 'treadmill',
  stationary_bike: 'bike',
  elliptical: 'elliptical',
  stair_climber: 'stair',
  rowing_machine: 'rower',
};

/** The fields each machine shows, in the order they show. */
export const MACHINE_FIELDS: Readonly<Record<MachineKind, readonly MachineField[]>> = {
  treadmill: ['speed', 'incline'],
  bike: ['level'],
  elliptical: ['level'],
  stair: ['level'],
  rower: ['level'],
};

/** What a box takes: never below 0, never above the top (a typo, not a machine). */
export const FIELD_MAX: Readonly<Record<MachineField, number>> = { speed: 40, incline: 40, level: 100 };

const timed = (t: LogType | null | undefined): boolean => t === 'time' || t === 'distance' || t === 'time_distance';

/**
 * Which machine an exercise is, or null. A library exercise by its key; the member's own by its
 * name, and only when it is logged by time or distance (a "Treadmill lunge" logged in kilos is
 * not a treadmill). PURE.
 */
export function machineKindOf(ex: { catalogKey?: string | null; name?: string | null; logType?: LogType | null }): MachineKind | null {
  if (ex.catalogKey) return BY_KEY[ex.catalogKey] ?? null;
  if (!timed(ex.logType ?? null)) return null;
  const n = ` ${(ex.name ?? '').toLowerCase()} `;
  if (/air ?bike|assault|fan bike|echo bike|airdyne/.test(n)) return null;
  if (/treadmill|running machine/.test(n)) return 'treadmill';
  if (/elliptical|cross ?trainer/.test(n)) return 'elliptical';
  if (/stair|step ?mill|stepper/.test(n)) return 'stair';
  if (/rower|rowing machine|\berg\b|indoor row/.test(n)) return 'rower';
  if (/(exercise|stationary|spin|spinning|recumbent|upright|gym) ?(bike|cycle)|cycling machine|\bcycle machine/.test(n)) return 'bike';
  return null;
}

export function machineFieldsOf(kind: MachineKind | null): readonly MachineField[] {
  return kind ? MACHINE_FIELDS[kind] : [];
}

const MPH_PER_KMH = 1000 / M_PER_MILE;

/** km/h → the number shown in the member's units (mph under "lb, miles"), to 1 place. PURE. */
export function speedToShown(kmh: number, u: UnitSystem = displayUnits()): number {
  return Math.round((u === 'imperial' ? kmh * MPH_PER_KMH : kmh) * 10) / 10;
}

/** The typed speed → km/h, kept to 3 places so 6 mph comes back as 6 mph. PURE. */
export function speedFromShown(v: number, u: UnitSystem = displayUnits()): number {
  return Math.round((u === 'imperial' ? v / MPH_PER_KMH : v) * 1000) / 1000;
}

export function speedUnit(u: UnitSystem = displayUnits()): 'km/h' | 'mph' {
  return u === 'imperial' ? 'mph' : 'km/h';
}

/**
 * What the member typed in a box → the number, or null when blank or not a number a machine
 * shows. A comma works as a decimal point ("8,5"). PURE.
 */
export function parseMachineValue(text: string, field: MachineField): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '' || !/^\d*\.?\d*$/.test(t) || t === '.') return null;
  const v = Number(t);
  if (!Number.isFinite(v) || v < 0 || v > FIELD_MAX[field]) return null;
  return v;
}

/** Stored bounds: speed is kept in km/h, so 40 mph typed is about 64 km/h stored. */
const STORED_MAX: Readonly<Record<MachineField, number>> = { speed: 70, incline: FIELD_MAX.incline, level: FIELD_MAX.level };

const clean = (v: unknown, field: MachineField): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= STORED_MAX[field] ? v : null;

/**
 * The details worth keeping (each a real number in range), or null when none is. Every write
 * and read goes through this, so a set with nothing logged stays exactly as older sets are. PURE.
 */
export function cleanMachine(m: MachineDetails | null | undefined): MachineDetails | null {
  if (!m) return null;
  const out: MachineDetails = {};
  const s = clean(m.speedKmh, 'speed');
  const i = clean(m.inclinePct, 'incline');
  const l = clean(m.level, 'level');
  if (s != null && s > 0) out.speedKmh = s;
  if (i != null) out.inclinePct = i;
  if (l != null) out.level = l;
  return Object.keys(out).length > 0 ? out : null;
}

/** From the three stored columns (NULL on every older set). PURE. */
export function machineFromRow(r: { speed_kmh?: number | null; incline_pct?: number | null; machine_level?: number | null }): MachineDetails | null {
  return cleanMachine({ speedKmh: r.speed_kmh ?? null, inclinePct: r.incline_pct ?? null, level: r.machine_level ?? null });
}

/**
 * One set's details as History and the workout's page show them: "8.5 km/h · incline 6%",
 * "Level 8". '' when there are none. PURE.
 */
export function machineText(m: MachineDetails | null | undefined, u: UnitSystem = displayUnits()): string {
  const c = cleanMachine(m);
  if (!c) return '';
  const parts: string[] = [];
  if (c.speedKmh != null) parts.push(`${trimNum(speedToShown(c.speedKmh, u))} ${speedUnit(u)}`); // member-words
  if (c.inclinePct != null) parts.push(`incline ${trimNum(c.inclinePct)}%`); // member-words
  if (c.level != null) parts.push(`level ${trimNum(c.level)}`); // member-words
  const s = parts.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The words beside each box while logging. */
export function fieldLabel(field: MachineField, u: UnitSystem = displayUnits()): string {
  if (field === 'speed') return speedUnit(u); // member-words
  if (field === 'incline') return '% incline'; // member-words
  return 'level'; // member-words
}

/** The number a box shows for a stored value ('' = blank). PURE. */
export function machineBoxText(m: MachineDetails | null | undefined, field: MachineField, u: UnitSystem = displayUnits()): string {
  const c = cleanMachine(m);
  if (!c) return '';
  if (field === 'speed') return c.speedKmh != null ? trimNum(speedToShown(c.speedKmh, u)) : '';
  if (field === 'incline') return c.inclinePct != null ? trimNum(c.inclinePct) : '';
  return c.level != null ? trimNum(c.level) : '';
}

/** A box's typed value written into a set's details (null clears that field). PURE. */
export function withMachineField(m: MachineDetails | null | undefined, field: MachineField, shown: number | null, u: UnitSystem = displayUnits()): MachineDetails | null {
  const next: MachineDetails = { ...(m ?? {}) };
  if (field === 'speed') next.speedKmh = shown == null ? null : speedFromShown(shown, u);
  else if (field === 'incline') next.inclinePct = shown;
  else next.level = shown;
  return cleanMachine(next);
}
