/**
 * Redesign R5 — a saved workout's page, as Hevy's Workout Detail (PLAN §4.5). PURE.
 *
 *   Pull 1
 *   Saturday, Oct 10, 2026 · 07:02
 *   Time 53 min   Kg lifted 3,611   Sets 14   Records 2
 *   (the note)
 *   Muscle split
 *   (o) Chin Up                                   (tap → its page)
 *       Most reps · 12
 *       SET   WEIGHT & REPS
 *       W     20 kg × 10
 *       1     60 kg × 8  @8
 *       2     62.5 kg × 6   (medal: a record)
 *
 * The stats follow the Profile feed's rule (`feedCardFacts`): Kg lifted — or Reps when nothing
 * was lifted, or the distance for a run — and Records only when any. Set numbers count the
 * normal sets; a warm-up, drop or failure set shows its letter instead (W, D, F), as in Hevy.
 * A record is marked on the set that holds it (best workout belongs to no one set, so it shows
 * on the exercise only).
 */
import { trimNum, fmtInt } from '@/lib/format';
import { kgToShown, weightUnitOf, type UnitSystem } from '@/lib/units';
import type { SetEntry } from '@/types/models';

import type { TrackedSetEntry } from '../db/exerciseHistory';
import type { SetMeta } from '../db/trackerSets';
import type { TrackerExercise } from '../db/exerciseInfo';
import { machineText } from '../engine/cardioMachine';
import { fmtSetCompact, fmtTotalDistance, typedWeight } from '../engine/logTypes';
import type { RecordKind, RecordSet } from '../engine/records';
import { durationText } from './finishCheck';
import { feedDate } from './feedCard';
import { workoutDistanceM, type SessionSummaryData } from './finishSummary';
import { showW } from '../components/unitText';

export interface DetailStat {
  label: string;
  value: string;
}

type Kind = Pick<TrackerExercise, 'logType' | 'loadMode' | 'distUnit'>;

/** "Saturday, Oct 10, 2026 · 07:02" — the feed's date and the app's clock. PURE. */
export function detailWhen(dateISO: string, startedAt: number): string {
  const d = new Date(startedAt);
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${feedDate(dateISO)} · ${clock}`;
}

/** Time · Kg lifted (or Reps, or Distance — the feed card's order) · Sets · Records. PURE. */
export function detailStats(
  data: Pick<SessionSummaryData, 'session' | 'setMeta' | 'durationSec' | 'totalVolumeKg' | 'workingSetCount'> & { records?: readonly unknown[] },
  units: UnitSystem,
): DetailStat[] {
  const out: DetailStat[] = [];
  if (data.durationSec > 0) out.push({ label: 'Time', value: durationText(data.durationSec * 1000) });
  const reps = data.session.exercises.reduce((n, g) => n + g.sets.filter((s) => !s.isWarmup).reduce((r, s) => r + Math.max(0, s.reps), 0), 0);
  const distance = workoutDistanceM(data);
  if (data.totalVolumeKg > 0.5) out.push({ label: `${units === 'imperial' ? 'Lb' : 'Kg'} lifted`, value: fmtInt(kgToShown(data.totalVolumeKg, units)) });
  // Review fix: the feed card's order (Kg lifted → Reps → Distance), so a workout shows the same
  // number on its card and on its page.
  else if (reps > 0) out.push({ label: 'Reps', value: fmtInt(reps) });
  else if (distance > 0) out.push({ label: 'Distance', value: fmtTotalDistance(distance) });
  out.push({ label: 'Sets', value: fmtInt(data.workingSetCount) });
  const records = data.records?.length ?? 0;
  if (records > 0) out.push({ label: 'Records', value: fmtInt(records) });
  return out;
}

/**
 * One set as the workout's page and summary show it: "60 kg × 8", "assist 20 kg × 8" written
 * as the help, "12 reps", "0:45", "2.4 km · 12:00". PURE.
 */
export function summarySetText(s: Pick<SetEntry, 'weightKg' | 'reps'>, meta: Pick<SetMeta, 'durationSec' | 'distanceM'> | undefined, kind: Kind | undefined, units: UnitSystem): string {
  const lt = kind?.logType ?? 'weight_reps';
  if (lt === 'assisted') return `${showW(typedWeight(lt, s.weightKg), units)} ${weightUnitOf(units)} × ${s.reps}`;
  return fmtSetCompact({ weightKg: s.weightKg, reps: s.reps, durationSec: meta?.durationSec, distanceM: meta?.distanceM }, lt, kind?.distUnit ?? 'km');
}

export interface DetailSetRow {
  id: string;
  /** "W", "1", "2", "D", "F". */
  mark: string;
  text: string;
  /** "@8", or null. */
  rpe: string | null;
  warmup: boolean;
  /** The records this set holds (none = an ordinary set). */
  records: RecordKind[];
}

const same = (a: number | null | undefined, b: number | null | undefined): boolean => (a ?? 0) === (b ?? 0);

/** The set ids that hold each record of one exercise in this workout: the first working set with its numbers. PURE. */
export function recordSets(
  sets: readonly Pick<SetEntry, 'id' | 'weightKg' | 'reps' | 'isWarmup'>[],
  setMeta: Readonly<Record<string, Pick<SetMeta, 'durationSec' | 'distanceM'> | undefined>>,
  records: readonly { kind: RecordKind; set: RecordSet | null }[],
): Map<string, RecordKind[]> {
  const out = new Map<string, RecordKind[]>();
  for (const r of records) {
    const rs = r.set;
    if (!rs) continue;
    const hit = sets.find(
      (s) =>
        !s.isWarmup &&
        s.weightKg === rs.weightKg &&
        s.reps === rs.reps &&
        same(setMeta[s.id]?.durationSec, rs.durationSec) &&
        same(setMeta[s.id]?.distanceM, rs.distanceM),
    );
    if (hit) out.set(hit.id, [...(out.get(hit.id) ?? []), r.kind]);
  }
  return out;
}

/** The rows of one exercise card. PURE. */
export function detailSetRows(
  sets: readonly SetEntry[],
  setMeta: Readonly<Record<string, SetMeta | undefined>>,
  kind: Kind | undefined,
  units: UnitSystem,
  held: ReadonlyMap<string, RecordKind[]> = new Map(),
): DetailSetRow[] {
  let n = 0;
  return sets.map((s) => {
    const meta = setMeta[s.id];
    const type = meta?.setType;
    const mark = s.isWarmup ? 'W' : type === 'drop' ? 'D' : type === 'failure' ? 'F' : String(++n);
    // F64: a machine set's speed / incline / level after its time or distance ('' on every other set).
    const machine = machineText(meta?.machine, units);
    return {
      id: s.id,
      mark,
      text: machine ? `${summarySetText(s, meta, kind, units)} · ${machine}` : summarySetText(s, meta, kind, units),
      rpe: !s.isWarmup && meta?.rpe != null ? `@${trimNum(meta.rpe)}` : null,
      warmup: s.isWarmup,
      records: held.get(s.id) ?? [],
    };
  });
}

/**
 * 13 Oct 2026 — the exercise page's "Last time" card as the same set table the workout's page
 * uses (owner: the run-on line "20 × 18, 20 × 16, … kg" was out of the theme): the last workout's
 * warm-ups and working sets in the order they were done (W / 1 / 2 / D / F, the type's own words,
 * "@8" when an RPE was logged). `working` = that workout's sets from the history read (working
 * sets only); `warmups` = its warm-ups (`getWarmupSets`), [] when none or not read. PURE.
 */
export function lastTimeRows(
  working: readonly TrackedSetEntry[],
  warmups: readonly TrackedSetEntry[],
  kind: Kind | undefined,
  units: UnitSystem,
): DetailSetRow[] {
  const all = [...warmups.map((s) => ({ ...s, isWarmup: true })), ...working].sort(
    (a, b) => (a.cardIndex ?? 0) - (b.cardIndex ?? 0) || a.setNumber - b.setNumber,
  );
  const meta: Record<string, SetMeta> = {};
  for (const s of all) {
    meta[s.id] = {
      rpe: s.rpe ?? null,
      setType: s.isWarmup ? 'warmup' : s.setType ?? 'normal',
      note: null,
      supersetGroup: null,
      durationSec: s.durationSec ?? null,
      distanceM: s.distanceM ?? null,
      loadMode: s.loadMode ?? null,
      ...(s.machine ? { machine: s.machine } : {}),
    };
  }
  return detailSetRows(all, meta, kind, units);
}
