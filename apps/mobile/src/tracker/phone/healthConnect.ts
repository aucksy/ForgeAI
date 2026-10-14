/**
 * Health Connect (v0.27.0, tracker plan Phase 5): each finished workout and its estimated
 * calories go to Health Connect, which Google Fit and Samsung Health read. Write only.
 *  - Off until the member taps "Connect" (Profile) and allows it on Health Connect's own screen.
 *  - Then every finished workout is sent; an edited one is sent again (it replaces the old
 *    copy — the native side keys each record on the workout id), a deleted one is taken out.
 *  - "Send past workouts" sends the member's own history. Demo data is never sent.
 * A failure never gets in the way of a workout, but it is never silent either (audit M2): it is
 * logged, and a refused workout is kept until "Send again" on the Health Connect page sends it.
 *
 * Audit Phase 6:
 *  - PH-03: "Send past workouts" says what really happened — "Sent 750 of 1,500" when Health
 *    Connect stops part-way, "Couldn't send: …" with the reason, "No workouts to send yet" —
 *    and the demo-data sentence only when the data really is the demo. The history goes in
 *    parts of SEND_PART workouts, so a failure part-way still counts what went in.
 *  - PH-12: each record uses the body weight logged nearest its day (on or before it; before
 *    the first one logged, the first), and the workout's own name (its title, else its
 *    routine's name, else its day).
 *  - IM-16: imported workouts are sent too (`sendWorkoutsToHealth`, from the import screen).
 */
import { getDb } from '@/db';
import { fmtInt } from '@/lib/format';
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

/** Audit M1: what "Open Health Connect" says when nothing opened. */
export const HC_OPEN_FAILED = "Couldn't open Health Connect. Open your phone's Settings → Health Connect.";

/** Health Connect's own page (else its Play Store page). False when nothing could open. */
export function openHealthConnect(): boolean {
  return phoneNative()?.healthOpenSettings() ?? false;
}

interface Row {
  id: string;
  date_iso: string;
  started_at: number;
  ended_at: number | null;
  day_type: string;
  /** The workout's own name (schema v9), if any. */
  title?: string | null;
  /** The name of the routine it was started from, if that routine still exists. */
  routine_name?: string | null;
  sets: number;
  cardio: number;
}

export interface BodyWeightAt {
  dateISO: string;
  weightKg: number;
}

/**
 * PURE (PH-12). The body weight for a day: the one logged on it or most recently before it;
 * a day before the first one logged takes the first (closer than a guess). `weights` sorted
 * by date, oldest first. Null when none was ever logged.
 */
export function bodyWeightOn(dateISO: string, weights: readonly BodyWeightAt[]): number | null {
  if (weights.length === 0) return null;
  let lo = 0;
  let hi = weights.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (weights[mid].dateISO <= dateISO) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return weights[found >= 0 ? found : 0].weightKg;
}

/** PURE (PH-12). The record's name: the workout's title, else its routine's, else its day. */
export function healthTitle(r: { title?: string | null; routineName?: string | null; dayType: string }): string {
  return r.title?.trim() || r.routineName?.trim() || dayTypeLabel(r.dayType);
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

/** PURE: the records for Health Connect from the rows read (`weights` oldest first). */
export function healthPayload(rows: readonly Row[], weights: readonly BodyWeightAt[]): HealthWorkout[] {
  return rows.map((r) => {
    const shift = realStart(r.started_at, r.date_iso) - r.started_at;
    const w = {
      startedAt: r.started_at + shift,
      endedAt: r.ended_at != null ? r.ended_at + shift : null,
      sets: r.sets,
      cardioSec: r.cardio,
    };
    return {
      id: r.id,
      title: healthTitle({ title: r.title, routineName: r.routine_name, dayType: r.day_type }),
      startMs: w.startedAt,
      endMs: endFor(w),
      kcal: activeKcal(w, bodyWeightOn(r.date_iso, weights)),
    };
  });
}

async function readRows(where: string, args: (string | number)[]): Promise<Row[]> {
  return getDb().getAllAsync<Row>(
    `SELECT s.id, s.date_iso, s.started_at, s.ended_at, s.day_type, s.title,
       (SELECT pd.name FROM plan_days pd WHERE pd.id = s.routine_id) AS routine_name,
       (SELECT COUNT(*) FROM set_entries se WHERE se.session_id = s.id AND se.is_warmup = 0) AS sets,
       (SELECT COALESCE(SUM(CASE WHEN se.distance_m > 0 THEN se.duration_sec ELSE 0 END), 0)
          FROM set_entries se WHERE se.session_id = s.id) AS cardio
     FROM workout_sessions s
     WHERE s.source != 'seed' AND ${where}
     ORDER BY s.started_at`,
    args,
  );
}

/** How many workouts go to Health Connect in one call (2 records each, under its 1,000). */
export const SEND_PART = 200;

/** What "Send past workouts" did (PH-03). */
export type SendResult =
  | { kind: 'sent'; sent: number; total: number }
  | { kind: 'failed'; sent: number; total: number; reason: 'access' | 'unavailable' | 'error' }
  | { kind: 'none' }
  | { kind: 'demo' };

/** PURE (PH-03). The line under "Send past workouts". */
export function sendResultText(r: SendResult): string {
  const workouts = (n: number): string => `${fmtInt(n)} workout${n === 1 ? '' : 's'}`;
  switch (r.kind) {
    case 'demo':
      return 'Nothing sent. Workouts on demo data are never sent.';
    case 'none':
      return 'No workouts to send yet.';
    case 'sent':
      return `Sent ${workouts(r.sent)} to Health Connect.`;
    case 'failed':
    default: {
      if (r.sent > 0) return `Sent ${fmtInt(r.sent)} of ${workouts(r.total)}. Health Connect stopped taking them. Try again to send the rest.`;
      if (r.reason === 'access') return "Couldn't send: ForgeAI isn't allowed to add workouts in Health Connect. Check its access there.";
      if (r.reason === 'unavailable') return "Couldn't send: Health Connect isn't available right now.";
      return "Couldn't send: Health Connect didn't take the workouts. Please try again.";
    }
  }
}

async function readWeights(): Promise<BodyWeightAt[]> {
  const rows = await getDb().getAllAsync<{ date_iso: string; weight_kg: number }>(
    'SELECT date_iso, weight_kg FROM body_weight ORDER BY date_iso ASC',
  );
  return rows.map((r) => ({ dateISO: r.date_iso, weightKg: r.weight_kg }));
}

/** Send rows in parts; counts what went in, and why it stopped. */
async function send(rows: Row[]): Promise<SendResult> {
  if (rows.length === 0) return { kind: 'none' };
  // Demo data (sample history, and workouts logged while it is loaded) never leaves the phone.
  if (await isDemoData().catch(() => true)) return { kind: 'demo' };
  const n = phoneNative();
  if (!n) return { kind: 'failed', sent: 0, total: rows.length, reason: 'unavailable' };
  const weights = await readWeights().catch(() => [] as BodyWeightAt[]);
  const payload = healthPayload(rows, weights);
  let sent = 0;
  for (let i = 0; i < payload.length; i += SEND_PART) {
    const part = payload.slice(i, i + SEND_PART);
    const written = await n.healthWrite(JSON.stringify(part)).catch(() => -1);
    // The native side answers -1 when Health Connect refused, 0 when it is not there at all
    // (every record here has a length — `endFor` — so a whole part is never skipped).
    if (written <= 0) {
      const reason: 'access' | 'unavailable' | 'error' =
        written === 0 ? 'unavailable' : (await n.healthGranted().catch(() => true)) ? 'error' : 'access';
      return { kind: 'failed', sent, total: payload.length, reason };
    }
    sent += written;
  }
  return { kind: 'sent', sent, total: payload.length };
}

/**
 * PURE (audit M2). The workouts still owed to Health Connect after a send: every id asked about
 * leaves the list (sent, deleted since, or demo data that is never sent), then the ones a
 * failed send did not reach go back on (`order` = the ids in the order they were sent).
 */
export function unsentAfter(prev: readonly string[], asked: readonly string[], order: readonly string[], r: SendResult): string[] {
  const askedSet = new Set(asked);
  const out = prev.filter((id) => !askedSet.has(id));
  if (r.kind === 'failed') {
    const have = new Set(out);
    for (const id of order.slice(r.sent)) if (!have.has(id)) out.push(id);
  }
  // Never grows for ever (Health Connect gone for months): the newest UNSENT_CAP stay.
  return out.length > UNSENT_CAP ? out.slice(out.length - UNSENT_CAP) : out;
}

/** The most workouts kept for "Send again"; "Send past workouts" still sends every one. */
export const UNSENT_CAP = 500;

/** PURE (audit M2). The line above "Send again" on the Health Connect page. */
export function unsentText(n: number): string {
  return `${fmtInt(n)} workout${n === 1 ? '' : 's'} didn't reach Health Connect.`;
}

function noteUnsent(asked: readonly string[], order: readonly string[], r: SendResult): void {
  const p = usePhonePrefs.getState();
  const next = unsentAfter(p.healthUnsent ?? [], asked, order, r);
  const prev = p.healthUnsent ?? [];
  if (next.length !== prev.length || next.some((id, i) => id !== prev[i])) p.setHealthUnsent(next);
}

/** How many ids go in one read (SQLite's limit on `?` is far above it). */
const READ_PART = 500;

/** Send these workouts; keep the ones that did not go for "Send again" (audit M2). */
async function sendIds(ids: readonly string[]): Promise<SendResult> {
  let order: string[] = [...ids];
  let r: SendResult;
  let err: unknown = null;
  try {
    const rows = await readRows(`s.id IN (${ids.map(() => '?').join(', ')})`, [...ids]);
    order = rows.map((x) => x.id);
    r = await send(rows);
  } catch (e) {
    err = e;
    r = { kind: 'failed', sent: 0, total: ids.length, reason: 'error' };
  }
  if (r.kind === 'failed') {
    console.warn(`[ForgeErr] ${r.total - r.sent} workout(s) did not reach Health Connect (${r.reason})`, err);
  }
  noteUnsent(ids, order, r);
  return r;
}

/** Send in parts; one result for them all (the first failure's reason). */
async function sendInParts(ids: readonly string[]): Promise<SendResult> {
  let sent = 0;
  let total = 0;
  let failed: 'access' | 'unavailable' | 'error' | null = null;
  let demo = false;
  for (let i = 0; i < ids.length; i += READ_PART) {
    const r = await sendIds(ids.slice(i, i + READ_PART));
    if (r.kind === 'demo') demo = true;
    if (r.kind === 'sent' || r.kind === 'failed') {
      sent += r.sent;
      total += r.total;
    }
    if (r.kind === 'failed') failed ??= r.reason;
  }
  if (failed) return { kind: 'failed', sent, total, reason: failed };
  if (demo && total === 0) return { kind: 'demo' };
  return total === 0 ? { kind: 'none' } : { kind: 'sent', sent, total };
}

/** After a workout is finished or edited: send it, if Health Connect is on. A refusal is kept. */
export async function sendWorkoutToHealth(sessionId: string): Promise<void> {
  if (!usePhonePrefs.getState().healthConnect) return;
  await sendIds([sessionId]);
}

/** IM-16: workouts just imported — sent, if Health Connect is on. A refusal is kept. */
export async function sendWorkoutsToHealth(sessionIds: readonly string[]): Promise<void> {
  if (!usePhonePrefs.getState().healthConnect || sessionIds.length === 0) return;
  await sendInParts(sessionIds);
}

/** Audit M2: "Send again" — the workouts Health Connect refused before. */
export async function resendUnsentToHealth(): Promise<SendResult> {
  // Sending switched off (Stop): nothing goes, whatever the list says.
  if (!usePhonePrefs.getState().healthConnect) return { kind: 'none' };
  const ids = [...(usePhonePrefs.getState().healthUnsent ?? [])];
  if (ids.length === 0) return { kind: 'none' };
  return sendInParts(ids);
}

/** "Send past workouts": every workout of the member's own. Says what happened. */
export async function sendAllWorkoutsToHealth(): Promise<SendResult> {
  try {
    const r = await send(await readRows('1 = 1', []));
    // Every workout went, so none is still owed.
    if (r.kind === 'sent' && (usePhonePrefs.getState().healthUnsent ?? []).length > 0) usePhonePrefs.getState().setHealthUnsent([]);
    if (r.kind === 'failed') console.warn(`[ForgeErr] past workouts did not reach Health Connect (${r.reason}, ${r.sent} of ${r.total})`);
    return r;
  } catch (e) {
    console.warn('[ForgeErr] send past workouts to Health Connect failed', e);
    return { kind: 'failed', sent: 0, total: 0, reason: 'error' };
  }
}

/** A workout was deleted: take it out of Health Connect too. */
export async function removeWorkoutFromHealth(sessionId: string): Promise<void> {
  const owed = usePhonePrefs.getState().healthUnsent ?? [];
  if (owed.includes(sessionId)) usePhonePrefs.getState().setHealthUnsent(owed.filter((id) => id !== sessionId));
  if (!usePhonePrefs.getState().healthConnect) return;
  try {
    await phoneNative()?.healthDelete(sessionId);
  } catch (e) {
    console.warn('[ForgeErr] Health Connect: deleted workout not removed', e);
  }
}
