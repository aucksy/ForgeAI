/**
 * Exercise log types — Phase 2. PURE.
 *
 * Until v0.23 every exercise was logged as weight × reps. Phase 2 adds the types a gym
 * actually needs (Hevy has the same set):
 *
 *   weight_reps   KG × REPS                 bench press, curls (the default; NULL in the DB)
 *   reps          REPS                      push-up, pull-up at body weight
 *   weighted      +KG × REPS                weighted pull-up / dip (belt weight)
 *   assisted      −KG × REPS                assisted pull-up / dip machine, band
 *   time          TIME                      plank, dead hang, wall sit
 *   distance      DISTANCE                  walk, sled push
 *   time_distance DISTANCE + TIME           run, row, bike
 *
 * Storage (additive columns only — `set_entries.weight_kg`/`reps` stay NOT NULL):
 *  - bodyweight types keep the ADDED load in `weight_kg`, signed: +10 for a 10 kg belt,
 *    −20 for 20 kg of machine help, 0 for plain body weight. "Heaviest" in the frozen
 *    record detector is then "least help" for an assisted move — the right direction.
 *  - time and distance live in `set_entries.duration_sec` / `distance_m`; `weight_kg` and
 *    `reps` are 0 on those rows.
 *
 * Load mode — how the typed weight and reps turn into volume (Hevy's #1 complaint is that
 * nobody can tell whether a dumbbell weight means one dumbbell or both):
 *   one        weight as typed, reps as done                       ×1  barbell, machine, goblet squat
 *   both       two dumbbells, type ONE dumbbell's weight           ×2  dumbbell bench press, curls
 *   side       one side at a time, reps for ONE side               ×2  one-arm row, single-arm cable raise
 *   both_side  two dumbbells AND one leg at a time                 ×4  dumbbell lunge, Bulgarian split squat
 */

import { displayUnits, M_PER_MILE, weightUnitOf, wNum } from '@/lib/units';

export type LogType = 'weight_reps' | 'reps' | 'weighted' | 'assisted' | 'time' | 'distance' | 'time_distance';

export const LOG_TYPES: readonly LogType[] = [
  'weight_reps',
  'reps',
  'weighted',
  'assisted',
  'time',
  'distance',
  'time_distance',
];

export const LOG_TYPE_LABEL: Record<LogType, string> = {
  weight_reps: 'Weight and reps',
  reps: 'Reps only',
  weighted: 'Body weight + added weight',
  assisted: 'Assisted (machine or band)',
  time: 'Time',
  distance: 'Distance',
  time_distance: 'Distance and time',
};

export type LoadMode = 'one' | 'both' | 'side' | 'both_side';

export const LOAD_MODES: readonly LoadMode[] = ['both', 'side', 'both_side', 'one'];

/** The choice as the member reads it (exercise menu → "Counting"). */
export const LOAD_MODE_LABEL: Record<LoadMode, { title: string; detail: string }> = {
  both: { title: 'Two dumbbells', detail: "Type one dumbbell's weight. Volume counts both." },
  side: { title: 'One side at a time', detail: 'Type the reps for one side. Volume counts both sides.' },
  both_side: {
    title: 'Two dumbbells, one leg at a time',
    detail: "Type one dumbbell's weight and the reps for one leg. Volume counts all of it.",
  },
  one: { title: 'Weight as typed', detail: 'One bar, machine or weight. Volume counts it once.' },
};

export function isLogType(v: unknown): v is LogType {
  return typeof v === 'string' && (LOG_TYPES as readonly string[]).includes(v);
}

export function isLoadMode(v: unknown): v is LoadMode {
  return typeof v === 'string' && (LOAD_MODES as readonly string[]).includes(v);
}

/** Types logged with a rep count. */
export function hasReps(t: LogType): boolean {
  return t === 'weight_reps' || t === 'reps' || t === 'weighted' || t === 'assisted';
}

/** Types with a weight column (signed for the bodyweight family). */
export function hasWeight(t: LogType): boolean {
  return t === 'weight_reps' || t === 'weighted' || t === 'assisted';
}

export function hasTime(t: LogType): boolean {
  return t === 'time' || t === 'time_distance';
}

export function hasDistance(t: LogType): boolean {
  return t === 'distance' || t === 'time_distance';
}

/**
 * Timed CARDIO (stair climber, jump rope, battle ropes) as opposed to a timed HOLD (plank,
 * wall sit). Both log a time; only holds follow the "+5 s" rule (research §4.5).
 */
export function isTimedCardio(t: LogType, primary: readonly string[]): boolean {
  return t === 'time' && primary.includes('cardio');
}

/**
 * Does this exercise get a Target line? Distance work and timed cardio don't: "Hold 20 min
 * · +5 s next time" on a stair climber reads wrong. Their rows still show last time.
 */
export function getsTarget(t: LogType, primary: readonly string[]): boolean {
  return !hasDistance(t) && !isTimedCardio(t, primary);
}

/** Moves your own body: body weight can count toward volume (see bwShare). */
export function isBodyweightFamily(t: LogType): boolean {
  return t === 'reps' || t === 'weighted' || t === 'assisted';
}

/** Volume multiplier for a load mode. */
export function loadMultiplier(mode: LoadMode): number {
  switch (mode) {
    case 'both':
    case 'side':
      return 2;
    case 'both_side':
      return 4;
    default:
      return 1;
  }
}

/** Typed weight is ONE of two dumbbells ("kg each"). */
export function weightIsEach(mode: LoadMode): boolean {
  return mode === 'both' || mode === 'both_side';
}

/** Reps are for ONE side ("reps per side"). */
export function repsPerSide(mode: LoadMode): boolean {
  return mode === 'side' || mode === 'both_side';
}

/** Column headers for the set table. */
export function columnHeads(
  t: LogType,
  mode: LoadMode,
  distUnit: DistUnit,
): { weight: string | null; reps: string | null; time: string | null; distance: string | null } {
  // v0.27.0: the member's unit — "LB", "+LB", "ASSIST LB", "LB EACH", "MI".
  const W = weightUnitOf().toUpperCase();
  return {
    weight: !hasWeight(t)
      ? null
      : t === 'weighted'
        ? `+${W}`
        : t === 'assisted'
          ? `ASSIST ${W}`
          : weightIsEach(mode)
            ? `${W} EACH`
            : W,
    reps: hasReps(t) ? (repsPerSide(mode) ? 'REPS/SIDE' : 'REPS') : null,
    time: hasTime(t) ? 'TIME' : null,
    distance: hasDistance(t) ? shownDistUnit(distUnit).toUpperCase() : null,
  };
}

// ---------------------------------------------------------------- distance

/**
 * An exercise's distance unit. The library gives 'km' or 'm'; v0.27.0 adds 'mi': under
 * "lb, miles" a kilometre exercise is shown, typed and paced in miles (`shownDistUnit`).
 * Metre exercises stay in metres. Distances are always stored in metres.
 */
export type DistUnit = 'km' | 'm' | 'mi';

/** The unit this exercise is SHOWN in now: km becomes miles under "lb, miles". */
export function shownDistUnit(unit: DistUnit): DistUnit {
  return unit === 'km' && displayUnits() === 'imperial' ? 'mi' : unit;
}

/** Metres → the number the member types/reads in this unit. */
export function distanceToUnit(m: number, unit: DistUnit): number {
  const u = shownDistUnit(unit);
  if (u === 'mi') return Math.round((m / M_PER_MILE) * 1000) / 1000;
  return u === 'km' ? Math.round((m / 1000) * 1000) / 1000 : Math.round(m);
}

export function distanceFromUnit(v: number, unit: DistUnit): number {
  const u = shownDistUnit(unit);
  if (u === 'mi') return Math.round(v * M_PER_MILE * 10) / 10;
  return u === 'km' ? Math.round(v * 1000 * 10) / 10 : Math.round(v * 10) / 10;
}

/**
 * Does what is typed in the distance box already say the stored distance? Compared in
 * stored metres, rounded the way typing stores them — so "100.5" m is left as typed rather
 * than rewritten to "101" mid-typing. PURE.
 */
export function typedDistanceMatches(typed: number | null, storedM: number | null, unit: DistUnit): boolean {
  return (typed != null ? distanceFromUnit(typed, unit) : null) === storedM;
}

/** "2.4 km", "500 m". */
export function fmtDistance(m: number, unit: DistUnit): string {
  const v = distanceToUnit(m, unit);
  return `${trim(v)} ${shownDistUnit(unit)}`;
}

/** A total over several exercises: "5.2 km", or "800 m" under a kilometre ("3.2 mi" under lb, miles). */
export function fmtTotalDistance(m: number): string {
  if (displayUnits() === 'imperial' && m >= M_PER_MILE / 10) return `${String(Math.round((m / M_PER_MILE) * 10) / 10)} mi`;
  return m >= 1000 ? `${String(Math.round(m / 100) / 10)} km` : `${Math.round(m)} m`;
}

// ---------------------------------------------------------------- time

/** "0:45", "1:30", "30:00", "1:05:00". */
export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Short spoken form for sentences: "45 s", "1 min 30 s", "30 min". */
export function fmtDurationWords(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} h`);
  if (m > 0) parts.push(`${m} min`);
  if (sec > 0) parts.push(`${sec} s`);
  return parts.join(' ');
}

/**
 * Parse what the member typed in a TIME cell. A number pad has no colon, so digits are
 * read like a microwave: the last two are seconds, the ones before are minutes, and
 * before that hours — "45" = 0:45, "130" = 1:30, "3000" = 30:00, "10000" = 1:00:00.
 * Typed text that already has colons ("1:30", "1:05:00") is read as written.
 * Returns whole seconds, or null when there is nothing usable.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  if (t.includes(':')) {
    const parts = t.split(':').map((p) => p.trim());
    if (parts.length > 3 || parts.some((p) => !/^\d{1,2}$|^\d+$/.test(p))) return null;
    const nums = parts.map((p) => parseInt(p, 10));
    let sec = 0;
    for (const n of nums) sec = sec * 60 + n;
    return sec > 0 ? sec : null;
  }
  if (!/^\d+$/.test(t)) return null;
  const digits = t.replace(/^0+(?=\d)/, '');
  const n = digits.length;
  const secPart = parseInt(digits.slice(Math.max(0, n - 2)), 10);
  const minPart = n > 2 ? parseInt(digits.slice(Math.max(0, n - 4), n - 2), 10) : 0;
  const hourPart = n > 4 ? parseInt(digits.slice(0, n - 4), 10) : 0;
  const total = hourPart * 3600 + minPart * 60 + secPart;
  return total > 0 ? total : null;
}

/** The digits a TIME cell shows while editing a stored value (inverse of the microwave read). */
export function durationDigits(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}${String(m).padStart(2, '0')}${String(sec).padStart(2, '0')}`;
  if (m > 0) return `${m}${String(sec).padStart(2, '0')}`;
  return String(sec);
}

// ---------------------------------------------------------------- one set, in words

export interface SetValues {
  weightKg: number;
  reps: number;
  durationSec?: number | null;
  distanceM?: number | null;
}

/**
 * A compact set label for history chips and summaries: "60×8", "12 reps", "+10×8",
 * "help 20×8", "0:45", "2.4 km", "2.4 km · 12:00".
 */
export function fmtSetCompact(s: SetValues, t: LogType, unit: DistUnit = 'km'): string {
  // A rep-less row on a reps type (a timed Hevy row landing on an older weight × reps
  // exercise) reads as what it holds, never "0×0".
  if (s.reps === 0 && (t === 'weight_reps' || t === 'reps' || t === 'weighted' || t === 'assisted')) {
    if ((s.durationSec ?? 0) > 0 || (s.distanceM ?? 0) > 0) return fmtSetCompact(s, 'time_distance', unit);
  }
  switch (t) {
    case 'reps':
      // Older rows of a bodyweight move may still carry a weight.
      return s.weightKg > 0 ? `+${wNum(s.weightKg)}×${s.reps}` : s.weightKg < 0 ? `assist ${wNum(-s.weightKg)}×${s.reps}` : `${s.reps} ${s.reps === 1 ? 'rep' : 'reps'}`;
    case 'weighted':
      return s.weightKg > 0 ? `+${wNum(s.weightKg)}×${s.reps}` : `${s.reps} ${s.reps === 1 ? 'rep' : 'reps'}`;
    case 'assisted':
      return s.weightKg < 0 ? `assist ${wNum(-s.weightKg)}×${s.reps}` : `${s.reps} ${s.reps === 1 ? 'rep' : 'reps'}`;
    case 'time':
      return fmtDuration(s.durationSec ?? 0);
    case 'distance':
      return fmtDistance(s.distanceM ?? 0, unit);
    case 'time_distance': {
      const d = s.distanceM ?? 0;
      const tm = s.durationSec ?? 0;
      if (d > 0 && tm > 0) return `${fmtDistance(d, unit)} · ${fmtDuration(tm)}`;
      return d > 0 ? fmtDistance(d, unit) : fmtDuration(tm);
    }
    default:
      return `${wNum(s.weightKg)}×${s.reps}`;
  }
}

/** A set is worth saving: the fields its type needs are filled. */
export function isLoggable(
  t: LogType,
  s: { weightKg: number | null; reps: number | null; durationSec?: number | null; distanceM?: number | null },
): boolean {
  switch (t) {
    case 'weight_reps':
      return s.reps != null && s.reps > 0 && s.weightKg != null && s.weightKg >= 0;
    case 'reps':
    case 'weighted':
    case 'assisted':
      // Blank weight on a bodyweight move = body weight (0 added).
      return s.reps != null && s.reps > 0 && (s.weightKg == null || Number.isFinite(s.weightKg));
    case 'time':
      return s.durationSec != null && s.durationSec > 0;
    case 'distance':
      return s.distanceM != null && s.distanceM > 0;
    case 'time_distance':
      return (s.distanceM != null && s.distanceM > 0) || (s.durationSec != null && s.durationSec > 0);
    default:
      return false;
  }
}

/**
 * The value stored in `weight_kg` for what the member typed. The member types assistance
 * as a positive number ("20 kg of help"); it is stored as −20 so "more weight" always
 * means "harder". Every other type stores what was typed (blank = 0 on bodyweight moves).
 */
export function storedWeight(t: LogType, typed: number | null): number {
  if (typed == null || !Number.isFinite(typed)) return 0;
  if (t === 'assisted') return -Math.abs(typed);
  if (t === 'time' || t === 'distance' || t === 'time_distance') return 0;
  return typed;
}

/** Inverse of storedWeight: what the weight cell shows for a stored value. */
export function typedWeight(t: LogType, stored: number): number {
  if (t === 'assisted') return Math.abs(stored);
  return stored;
}

function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}
