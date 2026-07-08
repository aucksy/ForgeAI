/**
 * 13 weeks of training history ending YESTERDAY (today stays untrained so the
 * dashboard's "Today: ..." hero moment fires on first open).
 *
 * Invariants the rest of the app depends on:
 * - The LAST session lands on plan-day index 5 (Legs Day B), so the coach's
 *   rotation picks Push Day A for today — bench press front and centre.
 * - "Finish strong" lifts end their final session with every working set at
 *   repRangeMax, so computeOverloadTarget prescribes 'increase' today.
 * - Barbell Curl is deliberately plateaued (same weight, reps not climbing,
 *   3+ sessions) to exercise the plateau/deload branch + coach insight.
 * - PRs are computed by replaying prRepo.checkAndRecordPrs' exact rule:
 *   prior bests from raw working-set history, one 'weight' + one 'e1rm' PR
 *   max per (session, exercise), e1rm value rounded to 1 decimal.
 * - No 2 consecutive rest days (skips never touch Mon/Sat or follow a rest
 *   day) so getStreakDays sees one long unbroken run.
 */
import { addDays, fromISO } from '@/lib/date';
import { uuid } from '@/lib/uuid';
import type { DayType } from '@/types/models';

import { specOf, type ExerciseKey, type SeedExerciseSpec } from './exercises';
import { PLAN_DAYS, type SeedPlanExercise } from './plan';
import { pick, randInt, round1, type Rng } from './rng';

export interface GeneratedSet {
  id: string;
  exerciseKey: ExerciseKey;
  setNumber: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
}

export interface GeneratedSession {
  id: string;
  dateISO: string;
  startedAt: number;
  endedAt: number;
  dayType: DayType;
  planDayIndex: number;
  planDayName: string;
  notes: string | null;
  sets: GeneratedSet[];
}

export interface GeneratedPr {
  id: string;
  exerciseKey: ExerciseKey;
  kind: 'weight' | 'e1rm';
  value: number;
  weightKg: number;
  reps: number;
  dateISO: string;
  sessionId: string;
}

export interface GeneratedBodyWeight {
  id: string;
  dateISO: string;
  weightKg: number;
}

export interface GeneratedHistory {
  sessions: GeneratedSession[];
  prs: GeneratedPr[];
  bodyWeight: GeneratedBodyWeight[];
  trainingDates: Set<string>;
}

const HISTORY_DAYS = 91; // 13 weeks
const DELOAD_WEEK_INDEX = 6; // week 7 of 13, -15% loads

/** start -> end working weights over the 13 weeks (kg). */
const PROGRESSION: Partial<Record<ExerciseKey, { startKg: number; endKg: number }>> = {
  benchPress: { startKg: 60, endKg: 72.5 },
  overheadPress: { startKg: 32.5, endKg: 40 },
  inclineDbPress: { startKg: 22.5, endKg: 27.5 },
  cableFly: { startKg: 15, endKg: 25 },
  lateralRaise: { startKg: 7.5, endKg: 10 },
  tricepsPushdown: { startKg: 25, endKg: 35 },
  deadlift: { startKg: 100, endKg: 130 },
  latPulldown: { startKg: 55, endKg: 70 },
  seatedCableRow: { startKg: 55, endKg: 65 },
  facePull: { startKg: 20, endKg: 30 },
  barbellCurl: { startKg: 25, endKg: 30 },
  hammerCurl: { startKg: 10, endKg: 12.5 },
  squat: { startKg: 80, endKg: 105 },
  romanianDeadlift: { startKg: 70, endKg: 90 },
  legPress: { startKg: 150, endKg: 180 },
  legExtension: { startKg: 40, endKg: 55 },
  standingCalfRaise: { startKg: 50, endKg: 60 },
  cableCrunch: { startKg: 25, endKg: 35 },
  inclineBarbellPress: { startKg: 42.5, endKg: 52.5 },
  machineChestPress: { startKg: 60, endKg: 80 },
  pecDeck: { startKg: 45, endKg: 60 },
  overheadTricepsExtension: { startKg: 12.5, endKg: 17.5 },
  barbellRow: { startKg: 60, endKg: 72.5 },
  shrug: { startKg: 25, endKg: 32.5 },
  rearDeltFly: { startKg: 7.5, endKg: 10 },
  preacherCurl: { startKg: 20, endKg: 30 },
  dumbbellCurl: { startKg: 10, endKg: 12.5 },
  hipThrust: { startKg: 80, endKg: 110 },
  bulgarianSplitSquat: { startKg: 12.5, endKg: 17.5 },
  legCurl: { startKg: 35, endKg: 50 },
  walkingLunge: { startKg: 12.5, endKg: 17.5 },
  seatedCalfRaise: { startKg: 40, endKg: 50 },
};

/** Lifts whose FINAL session hits every set at repRangeMax -> 'increase' today. */
const FINISH_STRONG = new Set<ExerciseKey>([
  'benchPress',
  'overheadPress',
  'squat',
  'deadlift',
  'barbellRow',
  'latPulldown',
  'hipThrust',
]);

/** Deliberately stuck lifts: last 3 sessions same weight, reps not climbing. */
const PLATEAU = new Set<ExerciseKey>(['barbellCurl']);

const SESSION_NOTES = [
  'Felt strong today.',
  'Slept badly, still showed up.',
  'Gym was packed, longer rests.',
  'Great pump, form felt dialled in.',
] as const;

export function epleyE1rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

function roundToIncrement(weightKg: number, incrementKg: number): number {
  return Math.round((Math.round(weightKg / incrementKg) * incrementKg) * 1000) / 1000;
}

function progOf(key: ExerciseKey): { startKg: number; endKg: number } {
  const p = PROGRESSION[key];
  if (!p) throw new Error(`seed: no progression configured for '${key}'`);
  return p;
}

/**
 * Increase timeline for one exercise: levels[k] = increments applied by
 * occurrence k. Reaches `m` by the final occurrence (forced catch-up),
 * never increases during deload weeks or after `freezeAfter` (plateaus).
 */
function buildLevels(
  occs: readonly { deload: boolean }[],
  m: number,
  freezeAfter: number | null,
  rng: Rng,
): number[] {
  let eligibleTotal = 0;
  for (let k = 0; k < occs.length; k++) {
    if (!occs[k].deload && (freezeAfter === null || k <= freezeAfter)) eligibleTotal++;
  }
  const levels: number[] = [];
  let level = 0;
  let seen = 0;
  for (let k = 0; k < occs.length; k++) {
    const frozen = freezeAfter !== null && k > freezeAfter;
    if (!occs[k].deload && !frozen) {
      seen++;
      if (seen > 1) {
        const remaining = m - level;
        const left = eligibleTotal - seen + 1;
        if (freezeAfter === null && remaining >= left) level++;
        else if (remaining > 0 && rng() < (remaining / Math.max(1, left)) * 1.25) level++;
      }
    }
    levels.push(level);
  }
  return levels;
}

function warmupWeight(target: number, spec: SeedExerciseSpec): number {
  const w = roundToIncrement(target, spec.incrementKg);
  return spec.equipment === 'barbell' ? Math.max(20, w) : Math.max(spec.incrementKg, w);
}

/** Working-set rep scheme for one exercise occurrence. */
function buildReps(
  pe: SeedPlanExercise,
  ctx: { deload: boolean; willIncrease: boolean; justIncreased: boolean; finishStrong: boolean; plateauIdx: number | null },
  rng: Rng,
): number[] {
  const { repMin, repMax } = pe;
  if (ctx.deload) return Array.from({ length: pe.sets }, () => repMax);
  // Earned the next increment: every set at the top of the range.
  if (ctx.finishStrong || ctx.willIncrease) return Array.from({ length: pe.sets }, () => repMax);
  // Plateau tail (newest-last tops: min+2, min+1, min+1 -> reps NOT climbing).
  if (ctx.plateauIdx !== null) {
    const top = [repMin + 2, repMin + 1, repMin + 1][Math.min(2, ctx.plateauIdx)];
    const reps = [top];
    for (let s = 1; s < pe.sets; s++) reps.push(Math.max(repMin - 1, top - s));
    return reps;
  }
  let top: number;
  if (ctx.justIncreased) {
    top = repMin + (rng() < 0.5 ? 0 : 1);
  } else {
    const span = Math.max(1, repMax - repMin - 1);
    top = repMin + 1 + Math.floor(rng() * span);
    if (rng() < 0.04) top = repMin - 1; // rough day: top set missed
  }
  const reps = [top];
  let cur = top;
  for (let s = 1; s < pe.sets; s++) {
    if (cur > repMin - 1 && rng() < 0.45) cur -= 1;
    reps.push(cur);
  }
  if (pe.sets >= 3 && rng() < 0.06) reps[pe.sets - 1] = Math.max(3, repMin - 2); // failed last set
  return reps;
}

export function generateHistory(todayISO: string, rng: Rng): GeneratedHistory {
  const start = addDays(todayISO, -HISTORY_DAYS);

  // ---- 1) training schedule: Mon-Sat, Sunday rest, ~90% adherence.
  const schedule: { dateISO: string; deload: boolean }[] = [];
  let prevTrained = false;
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const dateISO = addDays(start, i);
    const dow = fromISO(dateISO).getDay();
    const isYesterday = i === HISTORY_DAYS - 1;
    let trains: boolean;
    if (isYesterday) {
      trains = true; // yesterday MUST be a training day (Sunday make-up if needed)
    } else if (dow === 0) {
      trains = false;
    } else if (i >= HISTORY_DAYS - 4) {
      trains = true; // keep the last few days rich for the seeded chat
    } else if (dow !== 1 && dow !== 6 && prevTrained && rng() < 0.1) {
      trains = false; // life happens — but never adjacent to another rest day
    } else {
      trains = true;
    }
    if (trains) schedule.push({ dateISO, deload: Math.floor(i / 7) === DELOAD_WEEK_INDEX });
    prevTrained = trains;
  }

  // ---- 2) rotation offset so the LAST session is Legs Day B (index 5).
  const n = schedule.length;
  const rotationStart = (((5 - (n - 1)) % 6) + 6) % 6;
  const dayIdxBySession = schedule.map((_, sIdx) => (rotationStart + sIdx) % 6);

  // ---- 3) per-exercise occurrence timelines.
  const occByKey = new Map<ExerciseKey, { deload: boolean }[]>();
  for (let sIdx = 0; sIdx < n; sIdx++) {
    for (const pe of PLAN_DAYS[dayIdxBySession[sIdx]].exercises) {
      const list = occByKey.get(pe.key) ?? [];
      list.push({ deload: schedule[sIdx].deload });
      occByKey.set(pe.key, list);
    }
  }
  const levelsByKey = new Map<ExerciseKey, number[]>();
  for (const [key, occs] of occByKey) {
    const spec = specOf(key);
    const prog = progOf(key);
    const m = Math.round((prog.endKg - prog.startKg) / spec.incrementKg);
    const freezeAfter = PLATEAU.has(key) ? Math.max(0, occs.length - 4) : null;
    levelsByKey.set(key, buildLevels(occs, m, freezeAfter, rng));
  }

  // ---- 4) sessions + sets.
  const sessions: GeneratedSession[] = [];
  const trainingDates = new Set<string>();
  const occCursor = new Map<ExerciseKey, number>();
  for (let sIdx = 0; sIdx < n; sIdx++) {
    const { dateISO, deload } = schedule[sIdx];
    const day = PLAN_DAYS[dayIdxBySession[sIdx]];
    const dow = fromISO(dateISO).getDay();
    const morning = dow === 0 || dow === 6;
    const startMin = (morning ? 10 * 60 + 25 : 18 * 60 + 30) + randInt(rng, -15, 25);
    const startedAt = fromISO(dateISO).getTime() + startMin * 60_000;
    const endedAt = startedAt + randInt(rng, 58, 84) * 60_000;
    const sessionId = uuid();
    const sets: GeneratedSet[] = [];

    day.exercises.forEach((pe, exIdx) => {
      const spec = specOf(pe.key);
      const prog = progOf(pe.key);
      const levels = levelsByKey.get(pe.key);
      if (!levels) return;
      const k = occCursor.get(pe.key) ?? 0;
      occCursor.set(pe.key, k + 1);
      const total = levels.length;
      const level = levels[k];

      let weight = prog.startKg + level * spec.incrementKg;
      if (deload) weight = Math.max(spec.incrementKg, roundToIncrement(weight * 0.85, spec.incrementKg));

      const isFinal = k === total - 1;
      const plateauIdx = PLATEAU.has(pe.key) && k >= total - 3 ? k - (total - 3) : null;
      const reps = buildReps(
        pe,
        {
          deload,
          willIncrease: !deload && k + 1 < total && levels[k + 1] > level,
          justIncreased: !deload && k > 0 && levels[k - 1] < level,
          finishStrong: !deload && isFinal && FINISH_STRONG.has(pe.key),
          plateauIdx: deload ? null : plateauIdx,
        },
        rng,
      );

      let setNumber = 1;
      if (exIdx === 0) {
        // warm the lead compound: ~50% x8, ~72% x5
        const w1 = warmupWeight(weight * 0.5, spec);
        const w2 = warmupWeight(weight * 0.72, spec);
        sets.push({ id: uuid(), exerciseKey: pe.key, setNumber: setNumber++, weightKg: w1, reps: 8, isWarmup: true });
        if (w2 > w1 && w2 < weight) {
          sets.push({ id: uuid(), exerciseKey: pe.key, setNumber: setNumber++, weightKg: w2, reps: 5, isWarmup: true });
        }
      }
      for (const r of reps) {
        sets.push({ id: uuid(), exerciseKey: pe.key, setNumber: setNumber++, weightKg: weight, reps: r, isWarmup: false });
      }
    });

    const notes = deload
      ? 'Deload week — lighter on purpose.'
      : rng() < 0.08
        ? pick(rng, SESSION_NOTES)
        : null;

    sessions.push({
      id: sessionId,
      dateISO,
      startedAt,
      endedAt,
      dayType: day.dayType,
      planDayIndex: dayIdxBySession[sIdx],
      planDayName: day.name,
      notes,
      sets,
    });
    trainingDates.add(dateISO);
  }

  // ---- 5) PRs — replay prRepo.checkAndRecordPrs' rule chronologically.
  const prs: GeneratedPr[] = [];
  const bests = new Map<ExerciseKey, { weight: number; e1rm: number }>();
  for (const session of sessions) {
    const byKey = new Map<ExerciseKey, GeneratedSet[]>();
    for (const st of session.sets) {
      if (st.isWarmup) continue;
      const list = byKey.get(st.exerciseKey) ?? [];
      list.push(st);
      byKey.set(st.exerciseKey, list);
    }
    for (const [key, list] of byKey) {
      let topW = list[0].weightKg;
      let topWReps = list[0].reps;
      let bestE = epleyE1rm(list[0].weightKg, list[0].reps);
      let bestESet = list[0];
      for (let i = 1; i < list.length; i++) {
        const st = list[i];
        if (st.weightKg > topW || (st.weightKg === topW && st.reps > topWReps)) {
          topW = st.weightKg;
          topWReps = st.reps;
        }
        const e = epleyE1rm(st.weightKg, st.reps);
        if (e > bestE) {
          bestE = e;
          bestESet = st;
        }
      }
      const prior = bests.get(key);
      if (!prior || topW > prior.weight) {
        prs.push({
          id: uuid(),
          exerciseKey: key,
          kind: 'weight',
          value: topW,
          weightKg: topW,
          reps: topWReps,
          dateISO: session.dateISO,
          sessionId: session.id,
        });
      }
      if (!prior || bestE > prior.e1rm) {
        prs.push({
          id: uuid(),
          exerciseKey: key,
          kind: 'e1rm',
          value: round1(bestE),
          weightKg: bestESet.weightKg,
          reps: bestESet.reps,
          dateISO: session.dateISO,
          sessionId: session.id,
        });
      }
      bests.set(key, {
        weight: Math.max(prior?.weight ?? 0, topW),
        e1rm: Math.max(prior?.e1rm ?? 0, bestE),
      });
    }
  }

  // ---- 6) body weight: 74.0 -> 77.6, ~3 entries/week, +-0.3 noise, today too.
  const bodyWeight: GeneratedBodyWeight[] = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const dateISO = addDays(start, i);
    const dow = fromISO(dateISO).getDay();
    if (dow !== 1 && dow !== 4 && dow !== 6) continue;
    const base = 74.0 + 3.6 * (i / HISTORY_DAYS);
    bodyWeight.push({ id: uuid(), dateISO, weightKg: round1(base + (rng() * 0.6 - 0.3)) });
  }
  if (bodyWeight.length > 0) bodyWeight[0] = { ...bodyWeight[0], weightKg: 74.0 };
  bodyWeight.push({ id: uuid(), dateISO: todayISO, weightKg: 77.6 });

  return { sessions, prs, bodyWeight, trainingDates };
}
