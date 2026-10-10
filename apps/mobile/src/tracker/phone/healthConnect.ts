/**
 * Health Connect (v0.27.0, tracker plan Phase 5): each finished workout and its estimated
 * calories go to Health Connect, which Google Fit and Samsung Health read. Write only.
 *  - Off until the member taps "Connect" (Profile) and allows it on Health Connect's own screen.
 *  - Then every finished workout is sent; an edited one is sent again (it replaces the old
 *    copy — the native side keys each record on the workout id), a deleted one is taken out.
 *  - "Send past workouts" sends the member's own history. Demo data is never sent.
 * Every call is quiet on failure: Health Connect is a nice-to-have, never in the way.
 */
import { getDb } from '@/db';
import { getLatestBodyWeight } from '@/db/repos/userRepo';
import { isDemoData } from '@/onboarding/db/dataActions';

import { dayTypeLabel } from '../services/finishSummary';
import { activeKcal, endFor } from './calories';
import { phoneNative } from './native';
import { usePhonePrefs } from './phonePrefs';

/** 'off' = not allowed yet; 'allowed' = allowed on Health Connect, sending switched off. */
export type HealthState = 'none' | 'unavailable' | 'update' | 'off' | 'allowed' | 'on';

/** Where Health Connect stands on this phone, for Profile. 'none' = this build has no native piece. */
export async function healthState(): Promise<HealthState> {
  const n = phoneNative();
  if (!n) return 'none';
  const s = n.healthStatus();
  if (s !== 'available') return s;
  const granted = await n.healthGranted().catch(() => false);
  if (!granted) return 'off';
  return usePhonePrefs.getState().healthConnect ? 'on' : 'allowed';
}

/** Open Health Connect's permission screen. Profile re-checks when the app is back. */
export function askHealthConnect(): boolean {
  return phoneNative()?.healthRequest() ?? false;
}

export function openHealthConnect(): boolean {
  return phoneNative()?.healthOpenSettings() ?? false;
}

interface Row {
  id: string;
  date_iso: string;
  started_at: number;
  ended_at: number | null;
  day_type: string;
  sets: number;
  cardio: number;
}

export interface HealthWorkout {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  kcal: number;
}

/**
 * The real moment a workout started. Audit IM-07: imported workouts (Hevy, Strong) used to keep
 * their clock time written as UTC and were turned back here; since Phase 4 every stored start is
 * the real moment (older imports were moved once at start-up, `importClockRepair`). PURE.
 */
export function realStart(startedAt: number, _dateISO?: string): number {
  return startedAt;
}

/** PURE: the records for Health Connect from the rows read. */
export function healthPayload(rows: readonly Row[], bodyKg: number | null): HealthWorkout[] {
  return rows.map((r) => {
    const shift = realStart(r.started_at, r.date_iso) - r.started_at;
    const w = {
      startedAt: r.started_at + shift,
      endedAt: r.ended_at != null ? r.ended_at + shift : null,
      sets: r.sets,
      cardioSec: r.cardio,
    };
    return { id: r.id, title: dayTypeLabel(r.day_type), startMs: w.startedAt, endMs: endFor(w), kcal: activeKcal(w, bodyKg) };
  });
}

async function readRows(where: string, args: (string | number)[]): Promise<Row[]> {
  return getDb().getAllAsync<Row>(
    `SELECT s.id, s.date_iso, s.started_at, s.ended_at, s.day_type,
       (SELECT COUNT(*) FROM set_entries se WHERE se.session_id = s.id AND se.is_warmup = 0) AS sets,
       (SELECT COALESCE(SUM(CASE WHEN se.distance_m > 0 THEN se.duration_sec ELSE 0 END), 0)
          FROM set_entries se WHERE se.session_id = s.id) AS cardio
     FROM workout_sessions s
     WHERE s.source != 'seed' AND ${where}
     ORDER BY s.started_at`,
    args,
  );
}

async function send(rows: Row[]): Promise<number> {
  const n = phoneNative();
  if (!n || rows.length === 0) return 0;
  // Demo data (sample history, and workouts logged while it is loaded) never leaves the phone.
  if (await isDemoData().catch(() => true)) return 0;
  const bw = await getLatestBodyWeight().catch(() => null);
  const written = await n.healthWrite(JSON.stringify(healthPayload(rows, bw?.weightKg ?? null))).catch(() => -1);
  return Math.max(0, written);
}

/** After a workout is finished or edited: send it, if Health Connect is on. */
export async function sendWorkoutToHealth(sessionId: string): Promise<void> {
  if (!usePhonePrefs.getState().healthConnect) return;
  try {
    await send(await readRows('s.id = ?', [sessionId]));
  } catch {
    // quiet
  }
}

/** "Send past workouts": every workout of the member's own. Returns how many went. */
export async function sendAllWorkoutsToHealth(): Promise<number> {
  try {
    return await send(await readRows('1 = 1', []));
  } catch {
    return 0;
  }
}

/** A workout was deleted: take it out of Health Connect too. */
export async function removeWorkoutFromHealth(sessionId: string): Promise<void> {
  if (!usePhonePrefs.getState().healthConnect) return;
  try {
    await phoneNative()?.healthDelete(sessionId);
  } catch {
    // quiet
  }
}
