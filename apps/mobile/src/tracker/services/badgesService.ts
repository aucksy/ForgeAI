/**
 * F58 Badge shelf — the reads behind the badges (the rule is `engine/badges.ts`, pure).
 *
 * Reads every workout (date, start time, kg lifted by the one volume rule), the heavy working
 * sets with their exercise, the body-weight log and the record events, then runs the rule.
 * Nothing is stored. The answer is kept until anything is saved or the day changes
 * (`historyStamp`), so coming back to Profile reads nothing.
 */
import { getDb } from '@/db';

import { getTrackerExercisesByIds } from '../db/exerciseInfo';
import { computeBadges, type BadgeSet, type BadgeState, type BadgeWorkout } from '../engine/badges';
import { recordsPerWorkout } from './feedCard';
import { historyStamp } from './historyFeed';
import { getRecordEvents } from './recordsService';
import { getBodyweightTimeline, getSessionTotalsBetween } from './volumeService';

/** The library's barbell bench press (the "bench your body weight" badge). */
export const BENCH_KEY = 'barbell_bench_press';

/**
 * Sets lighter than this can earn no lift badge (the 100 kg bar, or a bench at body weight).
 * It only keeps the read small: nobody's logged body weight is under 30 kg.
 */
const HEAVY_FROM_KG = 30;

let kept: { stamp: string; badges: Promise<BadgeState[]> } | null = null;

/** Every badge, earned or not, in shelf order. */
export async function getBadges(): Promise<BadgeState[]> {
  const stamp = await historyStamp().catch((e: unknown) => {
    console.warn('[badges] could not read the data stamp', e);
    return null;
  });
  if (stamp != null && kept?.stamp === stamp) return kept.badges;
  const badges = readBadges();
  if (stamp != null) {
    kept = { stamp, badges };
    // A failed read is never kept.
    badges.catch(() => {
      if (kept?.badges === badges) kept = null;
    });
  }
  return badges;
}

/** The badges one workout earned (the finish screen's line). Never throws: [] on a failed read. */
export async function getBadgesEarnedIn(sessionId: string): Promise<BadgeState[]> {
  try {
    return (await getBadges()).filter((b) => b.earned?.sessionId === sessionId);
  } catch (e) {
    console.warn('[badges] could not read the badges for the finish screen', e);
    return [];
  }
}

async function readBadges(): Promise<BadgeState[]> {
  const db = getDb();
  const [sessions, totals, setRows, bodyweight, events] = await Promise.all([
    db.getAllAsync<{ id: string; date_iso: string; started_at: number }>('SELECT id, date_iso, started_at FROM workout_sessions'),
    getSessionTotalsBetween('0000-01-01', '9999-12-31'),
    db.getAllAsync<{ session_id: string; exercise_id: string; weight_kg: number; reps: number }>(
      `SELECT session_id, exercise_id, weight_kg, reps FROM set_entries
        WHERE is_warmup = 0 AND reps >= 1 AND weight_kg >= ?`,
      [HEAVY_FROM_KG],
    ),
    getBodyweightTimeline(),
    getRecordEvents(),
  ]);
  const kg = new Map(totals.map((t) => [t.sessionId, t.volumeKg]));
  const recordLifts = recordsPerWorkout(events);
  const workouts: BadgeWorkout[] = sessions.map((s) => ({
    id: s.id,
    dateISO: s.date_iso,
    startedAt: s.started_at,
    startHour: new Date(s.started_at).getHours(),
    kgLifted: kg.get(s.id) ?? 0,
    recordLifts: recordLifts.get(s.id) ?? 0,
  }));
  const exercises = await getTrackerExercisesByIds([...new Set(setRows.map((r) => r.exercise_id))]);
  const sets: BadgeSet[] = [];
  for (const r of setRows) {
    const x = exercises.get(r.exercise_id);
    // Only barbell lifts logged as weight × reps: an assisted pull-up's weight is help, not load.
    if (!x || x.equipment !== 'barbell' || x.logType !== 'weight_reps') continue;
    sets.push({ sessionId: r.session_id, weightKg: r.weight_kg, reps: r.reps, barbell: true, bench: x.catalogKey === BENCH_KEY });
  }
  return computeBadges({ workouts, sets, bodyweight });
}
