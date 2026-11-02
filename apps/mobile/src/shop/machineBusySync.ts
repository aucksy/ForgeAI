/**
 * F137 "Busy times by exercise": the wiring of machineBusy.ts (pure) to the gym's server (0049) and this phone's
 * workouts. Never throws; a failure is one quiet '[machines] ...' log line.
 *
 *  - Asks the gym (member_machine_busy) at most every 30 minutes, at once after a workout. Kept in memory only.
 *  - Sends the workout starts (member_machine_push) only when the gym switched the feature on, only the keys of
 *    its machines, never for sample (demo) data; at most every 6 hours, at once after a workout.
 *  - A server without 0049 (not live yet): one log line, then nothing is asked or sent until the app restarts,
 *    and the Gym tab shows nothing.
 *  - "Not now" on a tip is kept on the phone (meta 'machineTipHidden') for 30 days.
 */
import { getDb, getMeta, setMeta } from '@/db';
import { addDays, todayISO } from '@/lib/date';
import { sessionTitle } from '@/tracker/services/finishSummary';
import type { GymHours } from '@forgeai/theme';

import { apiMachineBusy, apiMachinePush } from './gymApi';
import {
  PUSH_DAYS,
  TIP_DAYS,
  findTip,
  hiddenFrom,
  machinePushDue,
  machineReadDue,
  openAtHour,
  pushPayload,
  withSnoozed,
  type MachineBusyAnswer,
  type MachineTip,
  type MachineTrigger,
  type WorkoutStart,
} from './machineBusy';
import type { GymLink } from './types';

const HIDDEN_META = 'machineTipHidden';

let missing = false;
let kept: { key: string; at: number; answer: MachineBusyAnswer } | null = null;
let pushedAt: { key: string; at: number } | null = null;
let busy = false;

/** This phone's workouts since a day, with the library keys of their working sets. */
async function readWorkoutStarts(fromISO: string): Promise<WorkoutStart[]> {
  const rows = await getDb().getAllAsync<{ id: string; date_iso: string; started_at: number; title: string | null; day_type: string; routine_id: string | null; catalog_key: string }>(
    `SELECT ws.id, ws.date_iso, ws.started_at, ws.title, ws.day_type, ws.routine_id, e.catalog_key
       FROM workout_sessions ws
       JOIN set_entries se ON se.session_id = ws.id AND se.is_warmup != 1
       JOIN exercises e ON e.id = se.exercise_id AND e.catalog_key IS NOT NULL
      WHERE ws.date_iso >= ?
      GROUP BY ws.id, e.catalog_key`,
    [fromISO],
  );
  const byId = new Map<string, WorkoutStart & { keys: string[] }>();
  for (const r of rows) {
    let w = byId.get(r.id);
    if (!w) {
      w = { dateISO: r.date_iso, hour: new Date(r.started_at).getHours(), routineId: r.routine_id || null, name: sessionTitle({ dayType: r.day_type, title: r.title }), keys: [] };
      byId.set(r.id, w);
    }
    w.keys.push(r.catalog_key);
  }
  return [...byId.values()];
}

async function isDemo(): Promise<boolean> {
  const { isDemoData } = await import('@/onboarding/db/dataActions');
  return isDemoData().catch(() => true);
}

/**
 * Ask the gym (when due) and send this phone's starts (when on and due). The gym's answer, or null when there
 * is none to use (no 0049, off-line with nothing kept). Never throws.
 */
export async function syncMachines(link: GymLink, trigger: MachineTrigger, now = Date.now()): Promise<MachineBusyAnswer | null> {
  if (missing) return null;
  const key = link.memberKey;
  const mine = kept?.key === key ? kept : null;
  if (busy) return mine?.answer ?? null;
  busy = true;
  try {
    let answer = mine?.answer ?? null;
    if (machineReadDue(trigger, mine?.at ?? null, now)) {
      const r = await apiMachineBusy(key);
      if (r.ok) {
        answer = r.data;
        kept = { key, at: now, answer };
      } else if ('missing' in r) {
        missing = true;
        kept = null;
        console.log('[machines] the gym server has no busy machines yet (0049 not live)');
        return null;
      } else if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') {
        console.warn('[machines] could not read busy machines', r.error.kind);
      }
    }
    if (answer?.on && answer.keys.length && machinePushDue(trigger, pushedAt?.key === key ? pushedAt.at : null, now) && !(await isDemo())) {
      const today = todayISO();
      const workouts = pushPayload(await readWorkoutStarts(addDays(today, -PUSH_DAYS)), answer.keys, today);
      const p = await apiMachinePush(key, workouts);
      if (p.ok) pushedAt = { key, at: now };
      else if ('missing' in p) missing = true;
      else if (p.error.kind !== 'offline' && p.error.kind !== 'timeout') console.warn('[machines] the workout starts were not accepted', p.error.kind);
    }
    return answer;
  } catch (e) {
    console.warn('[machines] sync failed', e);
    return kept?.key === key ? kept.answer : null;
  } finally {
    busy = false;
  }
}

/** After a workout is saved, or the app opens or comes back (phoneSync.ts). Never throws, never waited on. */
export async function syncMachinesQuietly(trigger: MachineTrigger): Promise<void> {
  try {
    const { useGymShop } = await import('./gymStore');
    const link = useGymShop.getState().link;
    if (link) await syncMachines(link, trigger);
  } catch (e) {
    console.warn('[machines] could not start', e);
  }
}

/** The tip for the Gym tab, or null (off, nothing proven, nothing to say, hidden, sample data). Never throws. */
export async function readMachineTip(link: GymLink, hours: GymHours | null): Promise<MachineTip | null> {
  try {
    const answer = await syncMachines(link, 'focus');
    if (!answer?.on || !answer.machines.length || (await isDemo())) return null;
    const today = todayISO();
    const tip = findTip(await readWorkoutStarts(addDays(today, -TIP_DAYS)), answer.machines, today, (d, h) => openAtHour(hours, d, h));
    if (!tip) return null;
    const hidden = hiddenFrom(await getMeta(HIDDEN_META), today);
    return hidden[tip.id] ? null : tip;
  } catch (e) {
    console.warn('[machines] could not work out a tip', e);
    return null;
  }
}

/** "Not now": hide this tip for 30 days. Never throws. */
export async function snoozeMachineTip(tipId: string): Promise<void> {
  try {
    const today = todayISO();
    await setMeta(HIDDEN_META, JSON.stringify(withSnoozed(hiddenFrom(await getMeta(HIDDEN_META), today), tipId, today)));
  } catch (e) {
    console.warn('[machines] could not hide the tip', e);
  }
}

/** Tests only. */
export function resetMachineSyncForTests(): void {
  missing = false;
  kept = null;
  pushedAt = null;
  busy = false;
}
