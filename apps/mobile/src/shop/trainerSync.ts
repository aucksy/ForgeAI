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
 *  - R-319 (0053): with the server's member_trainer_share2 the phone also sends its recent workouts
 *    (trainerRecent.ts); without it, only the weekly summary, exactly as before. "Ask a trainer" lives here too.
 *  - R-537 / R-551 (0084 live 14 Nov 2026; the owner approved the words): with the server's member_trainer_share3
 *    the recent workouts cover up to 12 months. Without it (PGRST202, remembered for this run) the same list, cut
 *    to 3 months, goes the 0053 way. The phone reads its year once per share either way.
 *  - R-551 "since joining": nothing from before the day this member joined THIS gym leaves the phone, in the
 *    recent workouts or the weekly summary (sharingSince: the join day this phone kept, else its first share day).
 */
import { getDb } from '@/db';
import { addDays, todayISO } from '@/lib/date';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

import { askErrorWords, type AskChoices, type AskQuestion } from './askTrainer';
import {
  apiAskChoices,
  apiAskQuestions,
  apiAskTrainer,
  apiAskWithdraw,
  apiTrainerHelp,
  apiTrainerShare,
  apiTrainerShare2,
  apiTrainerShare3,
  apiTrainerStatus,
  apiTrainerStop,
  type TrainerCall,
} from './gymApi';
import { useGymShop } from './gymStore';
import { createMateSharer, type MateOutcome, type MateSendResult, type MateTrigger } from './mateShare';
import { ONE_YEAR, SHARE_A_YEAR, THREE_MONTHS, recentFrom, sharingSinceDay, threeMonthsOf, trainerRecentFrom, type RecentWorkout } from './trainerRecent';
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

/**
 * R-551: the first day this phone may share with its gym: the day it joined this gym in the app, else (a phone that
 * joined before R-86 kept no day) the first day it shared, kept. No link: today.
 */
async function sharingSince(today: string): Promise<string> {
  const memberId = useGymShop.getState().link?.memberId;
  if (!memberId) return today;
  const { appJoinedOn, shareFirstSeenOn } = await import('./gymReminders');
  const joined = await appJoinedOn(memberId);
  return sharingSinceDay(joined, joined ? today : await shareFirstSeenOn(memberId, today), today);
}

/**
 * This phone's working sets of the last 12 weeks (never before `since`, R-551), and each exercise's heaviest
 * weight from before the last 30 days (only to tell a new best; never sent).
 */
async function buildSummary(since: string): Promise<TrainerSummary> {
  const today = todayISO();
  const from = since > trainerFrom(today) ? since : trainerFrom(today);
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

/**
 * R-319 item 11: the recent workouts (trainerRecent.ts), warm-ups left out, in the order done: the last 12 months
 * while the server may have 0084 (member_trainer_share3), else the last 92 days. Only built while the server has
 * 0053 (member_trainer_share2); otherwise nothing more leaves the phone.
 */
async function buildRecent(since: string): Promise<RecentWorkout[]> {
  const today = todayISO();
  const limits = SHARE_A_YEAR && !v3Missing ? ONE_YEAR : THREE_MONTHS;
  const rows = await getDb().getAllAsync<{ sid: string; date_iso: string; started_at: number; exercise_id: string; name: string; weight_kg: number; reps: number }>(
    `SELECT ws.id AS sid, ws.date_iso, ws.started_at, se.exercise_id, e.name, se.weight_kg, se.reps
       FROM workout_sessions ws
       JOIN set_entries se ON se.session_id = ws.id AND se.is_warmup != 1
       JOIN exercises e ON e.id = se.exercise_id
      WHERE ws.date_iso >= ? AND ws.date_iso <= ?
      ORDER BY ws.date_iso DESC, ws.started_at DESC, se.rowid`,
    [recentFrom(today, limits, since), today],
  );
  const { getWorkoutNames } = await import('@/tracker/db/workoutNames');
  const names = await getWorkoutNames(rows.map((r) => r.sid));
  return trainerRecentFrom(
    rows.map((r) => ({ workoutId: r.sid, dateISO: r.date_iso, startedAt: r.started_at, exerciseId: r.exercise_id, name: r.name, weightKg: r.weight_kg, reps: r.reps })),
    names,
    today,
    limits,
    since,
  );
}

/** 0053 not on the server: the summary goes the 0050 way, with no recent workouts. Remembered for this run. */
let v2Missing = false;
/** 0084 not on the server: 3 months the 0053 way. Remembered for this run. */
let v3Missing = false;

type TrainerShare = { summary: TrainerSummary; recent: RecentWorkout[] | null };

async function sendShare(key: string, s: TrainerShare): Promise<MateSendResult> {
  if (SHARE_A_YEAR && !v3Missing && !v2Missing && s.recent) {
    const r3 = await apiTrainerShare3(key, s.summary, s.recent);
    if (!(!r3.ok && 'missing' in r3)) return asSend(r3);
    v3Missing = true;
    console.log('[trainer] the gym server has no 12-month progress yet (0084 not live); sending 3 months');
  }
  if (!v2Missing && s.recent) {
    const r = await apiTrainerShare2(key, s.summary, threeMonthsOf(s.recent, todayISO()));
    if (!(!r.ok && 'missing' in r)) return asSend(r);
    v2Missing = true;
    console.log('[trainer] the gym server has no recent-workouts view yet (0053 not live); sending the weekly summary only');
  }
  return asSend(await apiTrainerShare(key, s.summary));
}

const sharer = createMateSharer<TrainerShare>({
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
  build: async () => {
    const since = await sharingSince(todayISO());
    const summary = await buildSummary(since);
    // A failed read of the recent workouts never stops the weekly summary.
    const recent = v2Missing ? null : await buildRecent(since).catch((e: unknown) => {
      console.warn('[trainer] reading the recent workouts failed', e);
      return null;
    });
    return { summary, recent };
  },
  send: sendShare,
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

// ------------------------------------------------------------------ "Ask a trainer" (0053, R-319 item 1)

/** 0053 not on the server: "Ask a trainer" stays hidden for this run (the old help button shows instead). */
let askMissing = false;

/** Does the server have "Ask a trainer"? false until a read said so; never throws. */
export function askServerKnownMissing(): boolean {
  return askMissing;
}

/** The people to pick from; null when unknown (offline) or 0053 is not live. Never throws. */
export async function readAskChoices(link: GymLink): Promise<AskChoices | null> {
  if (askMissing) return null;
  try {
    const r = await apiAskChoices(link.memberKey);
    if (r.ok) return r.data;
    if ('missing' in r) {
      askMissing = true;
      console.log('[ask] the gym server has no "Ask a trainer" yet (0053 not live)');
      return null;
    }
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ask] could not read the trainers', r.error.kind, r.message ?? '');
    return null;
  } catch (e) {
    console.warn('[ask] reading the trainers failed', e);
    return null;
  }
}

/** The member's questions (newest first); null when unknown or not live. Never throws. */
export async function readAskQuestions(link: GymLink): Promise<AskQuestion[] | null> {
  if (askMissing) return null;
  try {
    const r = await apiAskQuestions(link.memberKey);
    if (r.ok) return r.data;
    if ('missing' in r) {
      askMissing = true;
      return null;
    }
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ask] could not read the questions', r.error.kind, r.message ?? '');
    return null;
  } catch (e) {
    console.warn('[ask] reading the questions failed', e);
    return null;
  }
}

/** `code` 'NO_PLAN' (R-505): the gym has no running plan for this member, so the page locks. */
export type AskSend = { ok: true; question: AskQuestion } | { ok: false; words: string; code?: 'NO_PLAN' };

/** Send one question. `staffId` null = any trainer. Never throws. */
export async function sendAskQuestion(link: GymLink, staffId: string | null, text: string): Promise<AskSend> {
  try {
    const r = await apiAskTrainer(link.memberKey, staffId, text);
    if (r.ok) return { ok: true, question: r.data };
    if ('missing' in r) return { ok: false, words: askErrorWords(undefined) };
    // R-505 (0074): no running paid plan at the gym (a pass member, no plan, or a plan that ended). Logged on its own
    // line, so a member who says "it would not send" can be told why from the log.
    if (r.message === 'NO_PLAN') {
      console.warn('[ask] refused NO_PLAN: the gym has no running plan for this member (R-505)', r.error.kind);
      return { ok: false, words: askErrorWords(r.message), code: 'NO_PLAN' };
    }
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ask] the question was not accepted', r.error.kind, r.message ?? '');
    return { ok: false, words: askErrorWords(r.message) };
  } catch (e) {
    console.warn('[ask] sending failed', e);
    return { ok: false, words: askErrorWords(undefined) };
  }
}

/** Take back a question with no reply yet. True when it is gone. Never throws. */
export async function withdrawAskQuestion(link: GymLink, questionId: string): Promise<boolean> {
  try {
    const r = await apiAskWithdraw(link.memberKey, questionId);
    if (r.ok) return true;
    if (!('missing' in r) && r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ask] take back was not accepted', r.error.kind, r.message ?? '');
    return false;
  } catch (e) {
    console.warn('[ask] taking back failed', e);
    return false;
  }
}

/** Tests only. */
export function resetTrainerSyncForTests(): void {
  missing = false;
  v2Missing = false;
  askMissing = false;
}
