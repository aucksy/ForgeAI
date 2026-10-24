/**
 * "Share as text" — a workout, a month or a year as plain text the member can paste into any AI
 * chat (ChatGPT, Gemini, Claude…) for advice. No key, no account: the phone's own share menu.
 *
 * The builders are PURE (unit-tested); the reader and `shareAsText` are the device side.
 *
 * What the text says, and what it never says:
 *  - an opening line written for the AI, then the facts: name, day, length, every exercise with
 *    its sets in the member's unit (kg or lb), warm-ups, drop sets, sets to failure, RPE, the
 *    member's notes, the records set, and the totals;
 *  - PRIVACY (Phase 3 lesson — "KG LIFTED ÷ reps" once gave away body weight on a share picture):
 *    nothing that is, or divides back to, the member's body weight. A pull-up reads "body weight
 *    × 12" / "body weight + 10 kg × 8"; kg lifted counts the bar, dumbbells, machine and belt
 *    only — the share picture's own rule (`liftedOnPicture`, `pictureTotals`); "Best workout" in
 *    kilos on a move that lifts body weight stays out (`recordFitsPicture`). No name, no phone
 *    number, no body weight, no measurements.
 */
import { Share } from 'react-native';

import { getDb } from '@/db';
import { tinyDateWithYear } from '@/lib/date';
import { E1RM_MAX_REPS, estimatedOneRepMax } from '@/lib/e1rm';
import { fmtInt, fmtTotalTime } from '@/lib/format';
import { displayUnits, fmtW, kgToShown, weightUnitOf } from '@/lib/units';
import { countWord } from '@/lib/words';

import { getTrackerExercisesByIds } from '../db/exerciseInfo';
import type { SetMeta } from '../db/trackerSets';
import {
  fmtDistance,
  fmtDurationWords,
  fmtTotalDistance,
  isBodyweightFamily,
  isLoadMode,
  repsPerSide,
  weightIsEach,
  type DistUnit,
  type LoadMode,
  type LogType,
} from '../engine/logTypes';
import { RECORD_LABEL } from '../engine/records';
import { setVolumeKg } from '../engine/volume';
import { shownNotes } from '../lib/workoutText';
import { supersetLabel } from '../lib/superset';
import { liftedOnPicture, recordFitsPicture, shareDate } from '../share/workoutInput';
import { workoutName, type SessionSummaryData } from './finishSummary';
import { getRecordEvents, type RecordEventRow } from './recordsService';
import { recordValueText } from './recordText';

export const WORKOUT_TEXT_INTRO = 'Here is my workout from MettleUp. Please review it and suggest what to change next time.';

/** How an exercise is logged — what its sets need to read right. */
export interface TextKind {
  logType: LogType;
  loadMode: LoadMode;
  distUnit: DistUnit;
  /** > 0: its volume counts body weight (pull-ups, dips) — never shown as kilos. */
  bwShare: number;
}

const DEFAULT_KIND: TextKind = { logType: 'weight_reps', loadMode: 'one', distUnit: 'km', bwShare: 0 };

/** A set as the text needs it (stored values: kg, help on an assisted move negative). */
export interface TextSet {
  weightKg: number;
  reps: number;
  durationSec?: number | null;
  distanceM?: number | null;
  /** The set's own counting, when it differs from the exercise's. */
  loadMode?: LoadMode | null;
}

/** A member's note made safe for one block of text: no stray line ends, no empty lines in a row. PURE. */
export function cleanNote(text: string | null | undefined): string | null {
  const t = (text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/u, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return t === '' ? null : t;
}

/** "Note: first line" with any further lines indented under it. PURE. */
function noteLines(label: string, text: string, pad: string): string[] {
  const lines = text.split('\n');
  return [`${pad}${label}: ${lines[0]}`, ...lines.slice(1).map((l) => (l === '' ? '' : `${pad}  ${l}`))];
}

const repsWord = (n: number): string => `${n} ${n === 1 ? 'rep' : 'reps'}`;

/**
 * One set in words, in the member's unit: "80 kg × 6", "20 kg each × 10", "body weight × 12",
 * "body weight + 10 kg × 8", "body weight with 25 kg help × 6", "1 min 30 s", "5 km in 26 min". PURE.
 */
export function setText(s: TextSet, kind: TextKind): string {
  const lt = kind.logType;
  const w = Number.isFinite(s.weightKg) ? s.weightKg : 0;
  const r = Number.isFinite(s.reps) ? Math.max(0, Math.round(s.reps)) : 0;
  const dur = Math.max(0, s.durationSec ?? 0);
  const dist = Math.max(0, s.distanceM ?? 0);
  const timeDist = (): string => {
    if (dist > 0 && dur > 0) return `${fmtDistance(dist, kind.distUnit)} in ${fmtDurationWords(dur)}`;
    if (dist > 0) return fmtDistance(dist, kind.distUnit);
    return fmtDurationWords(dur);
  };
  // A rep-less row on a reps type (a timed Hevy row on an older exercise) reads as what it holds.
  if (r === 0 && (lt === 'weight_reps' || lt === 'reps' || lt === 'weighted' || lt === 'assisted') && (dur > 0 || dist > 0)) {
    return timeDist();
  }
  switch (lt) {
    case 'reps':
    case 'weighted':
    case 'assisted':
      if (w > 0) return `body weight + ${fmtW(w)} × ${r}`;
      if (w < 0) return `body weight with ${fmtW(-w)} help × ${r}`;
      return `body weight × ${r}`;
    case 'time':
      return fmtDurationWords(dur);
    case 'distance':
      return fmtDistance(dist, kind.distUnit);
    case 'time_distance':
      return timeDist();
    default: {
      const mode = s.loadMode ?? kind.loadMode;
      return `${fmtW(w)}${weightIsEach(mode) ? ' each' : ''} × ${r}${repsPerSide(mode) ? ' per side' : ''}`;
    }
  }
}

/** How the exercise's weights read, when it is not plain "weight × reps" (null otherwise). PURE. */
function countingHint(kind: TextKind): string | null {
  if (kind.logType !== 'weight_reps') return null;
  if (kind.loadMode === 'both') return 'weight is per dumbbell';
  if (kind.loadMode === 'side') return 'reps per side';
  if (kind.loadMode === 'both_side') return 'weight is per dumbbell, reps per side';
  return null;
}

/** A record in words for the text, or null when it would carry body weight. PURE. */
export function recordLine(r: RecordEventRow, bwShare: number): string | null {
  if (!recordFitsPicture(r, { [r.exerciseId]: { logType: r.info.logType, loadMode: r.info.loadMode, distUnit: r.info.distUnit, catalogKey: null, bwShare } })) {
    return null;
  }
  // A volume record with no set to name would be a kilo total with body weight in it.
  if (bwShare > 0 && r.kind === 'best_set' && !r.set) return null;
  let value = recordValueText(r, r.info);
  if (isBodyweightFamily(r.info.logType) && value.startsWith('+')) value = `body weight ${value}`;
  return `${r.exerciseName}: ${RECORD_LABEL[r.kind].toLowerCase()} ${value}`;
}

/** Does any exercise here lift body weight (so "kg lifted" leaves it out and says so)? */
function liftsBodyweight(kinds: Iterable<TextKind>): boolean {
  for (const k of kinds) if (k.bwShare > 0 || isBodyweightFamily(k.logType)) return true;
  return false;
}

/** "18 working sets · 4,250 kg lifted (body weight not counted)" — the picture's own rule. PURE. */
function totalsLine(data: SessionSummaryData, kinds: Iterable<TextKind>): string {
  const parts = [countWord(data.workingSetCount, 'working set')];
  const lifted = liftedOnPicture(data);
  if (lifted.label === 'KG LIFTED' || lifted.label === 'LB LIFTED') {
    parts.push(`${lifted.value} ${weightUnitOf()} lifted${liftsBodyweight(kinds) ? ' (body weight not counted)' : ''}`);
  } else if (lifted.label === 'REPS') {
    parts.push(`${lifted.value} reps`);
  } else if (lifted.label === 'DISTANCE' || lifted.label === 'TIME') {
    parts.push(lifted.value);
  }
  return parts.join(' · ');
}

/** The whole workout as text for an AI chat. PURE (reads the member's unit, like every screen). */
export function workoutText(data: SessionSummaryData): string {
  const s = data.session;
  const kindOf = (id: string): TextKind => {
    const k = data.kinds[id];
    return k ? { logType: k.logType, loadMode: k.loadMode, distUnit: k.distUnit, bwShare: k.bwShare ?? 0 } : DEFAULT_KIND;
  };
  const out: string[] = [WORKOUT_TEXT_INTRO, ''];
  out.push(`Workout: ${workoutName(data)}`);
  out.push(`Date: ${shareDate(s.dateISO)}`);
  if (data.durationSec > 0) out.push(`Duration: ${fmtTotalTime(data.durationSec)}`);
  if (data.easyWeek) out.push('This was a planned easier week.');
  out.push(`Weights are in ${weightUnitOf()}.`);

  const notes = cleanNote(shownNotes(s.title, s.notes));
  if (notes) {
    out.push('');
    out.push(...noteLines('Workout notes', notes, ''));
  }

  const groups = s.exercises.filter((g) => g.sets.length > 0);
  out.push('');
  if (groups.length === 0) {
    out.push('No sets were logged in this workout.');
  } else {
    out.push('Exercises:');
    groups.forEach((g, i) => {
      const kind = kindOf(g.exercise.id);
      const metaOf = (id: string): SetMeta | undefined => data.setMeta[id];
      // A card's superset is shared by its sets; the first set that carries one says it.
      const group = g.sets.map((x) => metaOf(x.id)?.supersetGroup).find((v): v is number => v != null);
      const tags: string[] = [];
      if (group != null) tags.push(`superset ${supersetLabel(group)}`);
      const hint = countingHint(kind);
      if (hint) tags.push(hint);
      out.push('');
      out.push(`${i + 1}. ${g.exercise.name}${tags.length > 0 ? ` (${tags.join(', ')})` : ''}`);
      // The exercise's note lives on its first set with one; any other set's own note is its own.
      const exNote = cleanNote(g.sets.map((x) => metaOf(x.id)?.note).find((n) => cleanNote(n) != null));
      if (exNote) out.push(...noteLines('Note', exNote, '   '));
      let n = 0;
      for (const set of g.sets) {
        const m = metaOf(set.id);
        const body = setText(
          { weightKg: set.weightKg, reps: set.reps, durationSec: m?.durationSec, distanceM: m?.distanceM, loadMode: m?.loadMode ?? null },
          kind,
        );
        let line: string;
        if (set.isWarmup) {
          line = `   Warm-up: ${body}`;
        } else {
          n += 1;
          const extra: string[] = [];
          if (m?.setType === 'drop') extra.push('drop set');
          if (m?.setType === 'failure') extra.push('to failure');
          if (m?.rpe != null && Number.isFinite(m.rpe)) extra.push(`RPE ${String(Math.round(m.rpe * 10) / 10)}`);
          line = `   Set ${n}: ${body}${extra.length > 0 ? ` (${extra.join(', ')})` : ''}`;
        }
        out.push(line);
        const own = cleanNote(m?.note);
        if (own && own !== exNote) out.push(...noteLines('Note', own, '     '));
      }
    });
  }

  const kindsById = new Map(groups.map((g) => [g.exercise.id, kindOf(g.exercise.id)]));
  const records = (data.records ?? []).map((r) => recordLine(r, kindsById.get(r.exerciseId)?.bwShare ?? 0)).filter((l): l is string => l != null);
  if (records.length > 0) {
    out.push('');
    out.push('Records set in this workout:');
    for (const r of records) out.push(`- ${r}`);
  }

  if (groups.length > 0) {
    out.push('');
    out.push(`Total: ${totalsLine(data, kindsById.values())}`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- a month or a year

/** One working set of the period, with its workout's day and start. */
export interface PeriodSet extends TextSet {
  sessionId: string;
  exerciseId: string;
  dateISO: string;
  startedAt: number;
}

export interface PeriodTextInput {
  /** 'month' or 'year' — only the closing words of the request change. */
  kind: 'month' | 'year';
  /** "October 2026", "2026". */
  label: string;
  /** The period is over (else it reads "so far"). */
  complete: boolean;
  /** Every workout of the period (one with only warm-ups counts too, as on the report). */
  sessions: readonly { id: string; dateISO: string; startedAt: number; endedAt: number | null }[];
  /** The period's WORKING sets. */
  sets: readonly PeriodSet[];
  exercises: ReadonlyMap<string, { name: string } & TextKind>;
  /** The period's records, newest first. */
  records: readonly RecordEventRow[];
}

/** Sets with more reps than this say little about a 1-rep max (the year review's rule). */
const MAX_E1RM_REPS = E1RM_MAX_REPS; // the app's one cap (lib/e1rm, 13 Oct 2026 audit)

/** The one set worth naming for an exercise over the period, by how it is logged. PURE. */
export function bestPeriodSet(sets: readonly TextSet[], kind: TextKind): TextSet | null {
  if (sets.length === 0) return null;
  const dur = (s: TextSet) => s.durationSec ?? 0;
  const dist = (s: TextSet) => s.distanceM ?? 0;
  const lt = kind.logType;
  const sorted = [...sets].sort((a, b) => {
    if (lt === 'time') return dur(b) - dur(a);
    if (lt === 'distance' || lt === 'time_distance') return dist(b) - dist(a) || dur(a) - dur(b);
    if (lt === 'reps') return b.reps - a.reps;
    // weighted: the heaviest belt; assisted: the least help (help is negative); weights: the heaviest.
    return b.weightKg - a.weightKg || b.reps - a.reps;
  });
  return sorted[0];
}

export function periodText(input: PeriodTextInput): string {
  const u = displayUnits();
  const unit = weightUnitOf(u);
  const ask =
    input.kind === 'month'
      ? `Here is my training for ${input.label} from MettleUp. Please review it and suggest what to change next month.`
      : `Here is my training for ${input.label} from MettleUp. Please review it and suggest what to change from here.`;
  const out: string[] = [ask, ''];
  out.push(input.complete ? input.label : `${input.label} (so far)`);
  const workouts = input.sessions.length;
  if (workouts === 0) {
    out.push('No workouts were logged.');
    return out.join('\n');
  }
  const days = new Set(input.sessions.map((s) => s.dateISO)).size;
  const seconds = input.sessions.reduce((n, s) => n + (s.endedAt != null ? Math.max(0, Math.round((s.endedAt - s.startedAt) / 1000)) : 0), 0);
  out.push(`Workouts: ${fmtInt(workouts)}`);
  out.push(`Days trained: ${fmtInt(days)}`);
  if (seconds > 0) out.push(`Time training: ${fmtTotalTime(seconds)}`);
  out.push(`Working sets: ${fmtInt(input.sets.length)}`);

  // Kg lifted by the share picture's rule: never body weight (`pictureTotals`).
  const kindOf = (id: string): TextKind => input.exercises.get(id) ?? DEFAULT_KIND;
  let kg = 0;
  let metres = 0;
  for (const s of input.sets) {
    const k = kindOf(s.exerciseId);
    kg += setVolumeKg({ weightKg: s.weightKg, reps: s.reps, isWarmup: false, loadMode: s.loadMode ?? null }, { logType: k.logType, loadMode: k.loadMode, bwShare: 0 }, null);
    metres += Math.max(0, s.distanceM ?? 0);
  }
  const usedKinds = [...new Set(input.sets.map((s) => s.exerciseId))].map(kindOf);
  if (kg > 0) out.push(`${unit === 'kg' ? 'Kg' : 'Lb'} lifted: ${fmtInt(kgToShown(kg, u))} ${unit}${liftsBodyweight(usedKinds) ? ' (body weight not counted)' : ''}`);
  if (metres > 0) out.push(`Distance: ${fmtTotalDistance(metres)}`);
  out.push(`Weights are in ${unit}.`);

  // Each exercise: workouts, sets, best set, and the estimated 1-rep max from first to last workout.
  const byExercise = new Map<string, PeriodSet[]>();
  for (const s of input.sets) {
    const list = byExercise.get(s.exerciseId);
    if (list) list.push(s);
    else byExercise.set(s.exerciseId, [s]);
  }
  const rows = [...byExercise.entries()]
    .map(([id, sets]) => ({ id, sets, workouts: new Set(sets.map((s) => s.sessionId)).size, name: input.exercises.get(id)?.name ?? 'Exercise' }))
    .sort((a, b) => b.sets.length - a.sets.length || b.workouts - a.workouts || a.name.localeCompare(b.name));
  if (rows.length > 0) {
    out.push('');
    out.push('Exercises (most sets first):');
    rows.forEach((row, i) => {
      const kind = kindOf(row.id);
      const hint = countingHint(kind);
      out.push('');
      out.push(`${i + 1}. ${row.name}${hint ? ` (${hint})` : ''} — ${countWord(row.workouts, 'workout')}, ${countWord(row.sets.length, 'set')}`);
      const best = bestPeriodSet(row.sets, kind);
      if (best) out.push(`   Best set: ${setText(best, kind)}`);
      if (kind.logType === 'weight_reps') {
        // Per workout, oldest first: its best estimate from sets of 12 reps or fewer.
        const per = new Map<string, { at: number; e1rm: number }>();
        for (const s of row.sets) {
          if (!(s.weightKg > 0) || s.reps <= 0 || s.reps > MAX_E1RM_REPS) continue;
          const e = estimatedOneRepMax(s.weightKg, s.reps);
          const cur = per.get(s.sessionId);
          if (!cur || e > cur.e1rm) per.set(s.sessionId, { at: s.startedAt, e1rm: e });
        }
        const points = [...per.values()].sort((a, b) => a.at - b.at);
        const each = weightIsEach(kind.loadMode) ? ' each' : '';
        if (points.length >= 2) {
          const a = points[0].e1rm;
          const b = points[points.length - 1].e1rm;
          out.push(`   Estimated 1-rep max: ${fmtW(a, u)}${each} in the first workout, ${fmtW(b, u)}${each} in the last`);
        } else if (points.length === 1) {
          out.push(`   Estimated 1-rep max: ${fmtW(points[0].e1rm, u)}${each}`);
        }
      }
    });
  }

  const records = input.records
    .map((r) => {
      const line = recordLine(r, input.exercises.get(r.exerciseId)?.bwShare ?? 0);
      return line ? `${line} (${tinyDateWithYear(r.dateISO)})` : null;
    })
    .filter((l): l is string => l != null);
  out.push('');
  if (records.length > 0) {
    out.push(input.kind === 'month' ? 'Records this month:' : 'Records this year:');
    for (const r of records) out.push(`- ${r}`);
  } else {
    out.push(input.kind === 'month' ? 'No new records this month.' : 'No new records this year.');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- device side

interface PeriodSetRow {
  session_id: string;
  exercise_id: string;
  weight_kg: number;
  reps: number;
  duration_sec: number | null;
  distance_m: number | null;
  load_mode: string | null;
  date_iso: string;
  started_at: number;
}

/** Everything `periodText` needs for the days `from`..`to` (inclusive). */
export async function getPeriodTextInput(p: { kind: 'month' | 'year'; label: string; complete: boolean; from: string; to: string }): Promise<PeriodTextInput> {
  const db = getDb();
  const [sessions, rows, records] = await Promise.all([
    db.getAllAsync<{ id: string; date_iso: string; started_at: number; ended_at: number | null }>(
      'SELECT id, date_iso, started_at, ended_at FROM workout_sessions WHERE date_iso BETWEEN ? AND ? ORDER BY started_at ASC',
      [p.from, p.to],
    ),
    db.getAllAsync<PeriodSetRow>(
      `SELECT se.session_id, se.exercise_id, se.weight_kg, se.reps, se.duration_sec, se.distance_m, se.load_mode,
              ws.date_iso, ws.started_at
         FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
        WHERE ws.date_iso BETWEEN ? AND ? AND se.is_warmup = 0
        ORDER BY ws.started_at ASC, se.session_id ASC, se.set_number ASC`,
      [p.from, p.to],
    ),
    getRecordEvents({ from: p.from, to: p.to }).catch(() => [] as RecordEventRow[]),
  ]);
  const infos = await getTrackerExercisesByIds([...new Set(rows.map((r) => r.exercise_id))]);
  const exercises = new Map<string, { name: string } & TextKind>();
  for (const [id, e] of infos) exercises.set(id, { name: e.name, logType: e.logType, loadMode: e.loadMode, distUnit: e.distUnit, bwShare: e.bwShare });
  return {
    kind: p.kind,
    label: p.label,
    complete: p.complete,
    sessions: sessions.map((s) => ({ id: s.id, dateISO: s.date_iso, startedAt: s.started_at, endedAt: s.ended_at })),
    // A set whose exercise is gone (never in practice) is left out, as every reader does.
    sets: rows
      .filter((r) => exercises.has(r.exercise_id))
      .map((r) => ({
        sessionId: r.session_id,
        exerciseId: r.exercise_id,
        dateISO: r.date_iso,
        startedAt: r.started_at,
        weightKg: r.weight_kg,
        reps: r.reps,
        durationSec: r.duration_sec,
        distanceM: r.distance_m,
        loadMode: isLoadMode(r.load_mode) ? r.load_mode : null,
      })),
    exercises,
    records,
  };
}

/** Open the phone's share menu with this text (WhatsApp, a note, any AI chat app). */
export async function shareAsText(message: string, title: string): Promise<void> {
  await Share.share({ message, title });
}
