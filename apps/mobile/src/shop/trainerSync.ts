/**
 * F109 "Trainers see their members' progress" on this phone: the real wiring of trainerShare.ts (what is sent)
 * and mateShare.ts's sharer (when). Nothing here is saved on the phone except the switch (phonePrefs); never
 * throws; a failure is one quiet '[trainer] ...' log line.
 *
 *  - Switch ON (the default): the weekly summary goes after a saved workout and when the switch is flipped on, at
 *    once; on app start and on coming back at most every 6 hours. Never with the sample (demo) data.
 *  - Switch OFF: the gym deletes the summary at once (kept and sent again with no signal).
 *  - A server without 0050 (not live yet): one log line, nothing is sent for the rest of this run, and the
 *    Settings switch, the join-screen line and the help button are not shown. Exactly as before.
 */
import { getDb } from '@/db';
import { addDays, todayISO } from '@/lib/date';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

import { apiTrainerHelp, apiTrainerShare, apiTrainerStatus, apiTrainerStop, type TrainerCall } from './gymApi';
import { useGymShop } from './gymStore';
import { createMateSharer, type MateOutcome, type MateSendResult, type MateTrigger } from './mateShare';
import { TRAINER_RECORD_DAYS, trainerFrom, trainerSummaryFrom, type TrainerStatus, type TrainerSummary } from './trainerShare';
import type { GymLink } from './types';

let missing = false;

const asSend = (r: TrainerCall<true>): MateSendResult => {
  if (r.ok) return 'ok';
  if ('missing' in r) {
    missing = true;
    return 'missing';
  }
  if ('error' in r && r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[trainer] the gym did not accept it', r.error.kind);
  return 'failed';
};

/** This phone's working sets of the last 12 weeks, and each exercise's heaviest weight from before the last 30 days. */
async function buildSummary(): Promise<TrainerSummary> {
  const today = todayISO();
  const from = trainerFrom(today);
  const recordFrom = addDays(today, -(TRAINER_RECORD_DAYS - 1));
  const db = getDb();
  const rows = await db.getAllAsync<{ sid: string; date_iso: string; exercise_id: string; name: string; weight_kg: number; reps: number }>(
    `SELECT ws.id AS sid, ws.date_iso, se.exercise_id, e.name, se.weight_kg, se.reps
       FROM workout_sessions ws
       JOIN set_entries se ON se.session_id = ws.id AND se.is_warmup != 1
       JOIN exercises e ON e.id = se.exercise_id
      WHERE ws.date_iso >= ? AND ws.date_iso <= ?`,
    [from, today],
  );
  const prior = await db.getAllAsync<{ exercise_id: string; w: number }>(
    `SELECT se.exercise_id, MAX(se.weight_kg) AS w
       FROM set_entries se
       JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE ws.date_iso < ? AND se.is_warmup != 1
      GROUP BY se.exercise_id`,
    [recordFrom],
  );
  return trainerSummaryFrom(
    rows.map((r) => ({ workoutId: r.sid, dateISO: r.date_iso, exerciseId: r.exercise_id, name: r.name, weightKg: r.weight_kg, reps: r.reps })),
    new Map(prior.map((p) => [p.exercise_id, p.w])),
    today,
  );
}

const sharer = createMateSharer<TrainerSummary>({
  tag: '[trainer]',
  now: () => Date.now(),
  memberKey: async () => {
    const s = useGymShop;
    if (!s.persist.hasHydrated()) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 5000);
        const unsub = s.persist.onFinishHydration(() => {
          clearTimeout(timer);
          unsub();
          resolve();
        });
      });
    }
    return s.getState().link?.memberKey ?? null;
  },
  isDemo: async () => {
    const { isDemoData } = await import('@/onboarding/db/dataActions');
    return isDemoData().catch(() => true);
  },
  shareOn: () => usePhonePrefs.getState().shareWithTrainers,
  pending: () => usePhonePrefs.getState().trainerSharePending,
  clearPending: () => usePhonePrefs.getState().setTrainerSharePending(false),
  build: buildSummary,
  send: async (key, summary) => asSend(await apiTrainerShare(key, summary)),
  stop: async (key) => asSend(await apiTrainerStop(key)),
  log: (message, detail) => console.warn(message, detail ?? ''),
});

/** Send (or take back) the summary if the rules say so (mateShare.ts). Never throws. */
export function shareWithTrainers(trigger: MateTrigger): Promise<MateOutcome> {
  return sharer.share(trigger).catch((e: unknown) => {
    console.warn('[trainer] share could not run', e);
    return 'failed' as const;
  });
}

/** The gym's answer about sharing and the trainer; null when unknown (offline) or 0050 is not live. Never throws. */
export async function readTrainerStatus(link: GymLink): Promise<TrainerStatus | null> {
  if (missing) return null;
  try {
    const r = await apiTrainerStatus(link.memberKey);
    if (r.ok) return r.data;
    if ('missing' in r) {
      missing = true;
      console.log('[trainer] the gym server has no trainer view yet (0050 not live)');
      return null;
    }
    if ('error' in r && r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[trainer] could not read the status', r.error.kind);
    return null;
  } catch (e) {
    console.warn('[trainer] reading the status failed', e);
    return null;
  }
}

/**
 * Before joining (no member key yet): does the gym's server have the trainer view? A made-up key answers
 * BAD_KEY when it does, "no such function" when it does not. False when unknown (offline). Never throws.
 */
export async function trainerServerLive(): Promise<boolean> {
  if (missing) return false;
  try {
    const r = await apiTrainerStatus('probe-no-such-member');
    if ('missing' in r) {
      missing = true;
      return false;
    }
    return r.ok || ('error' in r && r.error.kind === 'BAD_KEY');
  } catch (e) {
    console.warn('[trainer] checking the server failed', e);
    return false;
  }
}

export type HelpOutcome = 'sent' | 'already' | 'off' | 'failed';

/** "Ask my trainer for help". Never throws. */
export async function askTrainerForHelp(link: GymLink): Promise<HelpOutcome> {
  try {
    const r = await apiTrainerHelp(link.memberKey);
    if (r.ok) return r.data;
    if ('notShared' in r || 'missing' in r) return 'off';
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[trainer] help was not accepted', r.error.kind);
    return 'failed';
  } catch (e) {
    console.warn('[trainer] asking for help failed', e);
    return 'failed';
  }
}

/** Tests only. */
export function resetTrainerSyncForTests(): void {
  missing = false;
}
