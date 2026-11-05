/**
 * Reading from Health Connect (1 Nov 2026), each only after the member's own yes on the Health
 * Connect page, each with its own permission (never asked together with the write switches):
 *
 * F55 Body weight from Health Connect (READ_WEIGHT). Weigh-ins a smart scale or another health app
 * put in Health Connect are added to the body-weight log by themselves when the app opens or comes
 * back (at most every 10 minutes, the R-267 rule), and at once after the yes.
 *  - One entry per day (the log's rule). A day with no entry gets the reading. A day whose entry
 *    came from Health Connect takes a later reading of that day (the last step on the scale wins).
 *  - A weight the member typed is NEVER changed: a day counts as "from Health Connect" only while
 *    its entry still has the value Health Connect gave it (`healthWeightDays`); a typed one, or
 *    one the member fixed, has another value or no mark at all.
 *  - No duplicates: each Health Connect record id is looked at once (`healthWeightSeen`), so a
 *    weigh-in the member deleted here does not come back on the next read.
 *  - Each read starts a week before the last one (a scale app that syncs late is still caught);
 *    the first read goes back 30 days (what Health Connect lets a new app read).
 *  - Never while demo data is loaded (the sample log would mix with real weigh-ins).
 *
 * F62 Steps (READ_STEPS): today's steps, midnight to now in the phone's time zone, counted by
 * Health Connect itself (a phone and a watch counting the same walk are not added up twice).
 * Shown on the Health Connect page only; nothing is stored.
 */
import { getDb } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { fmtInt } from '@/lib/format';
import { todayISO } from '@/lib/date';
import { uuid } from '@/lib/uuid';
import { isDemoData } from '@/onboarding/db/dataActions';

import { phoneNative, type HealthWeightRecord } from './native';
import { usePhonePrefs, type HealthWeightDay } from './phonePrefs';

const DAY_MS = 86_400_000;
/** The first read goes back this far (Health Connect's own limit for a newly allowed app). */
export const FIRST_READ_DAYS = 30;
/** Each later read starts this long before the last one, for scale apps that sync late. */
export const LATE_SYNC_DAYS = 7;
/** R-267 style: the automatic read runs at most this often (app opened / back again). */
export const WEIGHT_READ_GAP_MS = 10 * 60 * 1000;
/** The most days kept marked as "from Health Connect" (the newest stay). */
export const HC_DAYS_CAP = 1500;
/** A weigh-in outside this range (kg) is a mistake in the other app, never added. */
export const KG_MIN = 20;
export const KG_MAX = 400;

/** Which read permissions MettleUp holds. */
export interface HealthReadAccess {
  weight: boolean;
  steps: boolean;
}

/** Can this build read from Health Connect at all (an older native piece cannot)? */
export function canReadHealth(): boolean {
  const n = phoneNative();
  return !!n && typeof n.healthReadWeights === 'function' && typeof n.healthRequestRead === 'function';
}

/**
 * Which read permissions are allowed: null = no Health Connect (or a build that cannot read),
 * 'error' = it could not be asked this time. After "Stop and remove MettleUp's access" both are
 * off until the member says yes again (Android 14+ may still report them until a restart).
 */
export async function healthReadAccess(): Promise<HealthReadAccess | 'error' | null> {
  const n = phoneNative();
  if (!n || !canReadHealth() || !n.healthAccess) return null;
  if (n.healthStatus() !== 'available') return null;
  if (usePhonePrefs.getState().healthRevoked) return { weight: false, steps: false };
  try {
    const a = await n.healthAccess();
    if (!a) return null;
    return { weight: a.weight === true, steps: a.steps === true };
  } catch (e) {
    console.warn('[ForgeErr] health: read access could not be checked', e);
    return 'error';
  }
}

/** Open Health Connect's screen asking only for these read permissions. False = nothing opened. */
export function askHealthRead(kinds: ('weight' | 'steps' | 'sleep')[]): boolean {
  const n = phoneNative();
  if (!n?.healthRequestRead) return false;
  usePhonePrefs.getState().setHealthRead({ healthRevoked: false });
  return n.healthRequestRead(kinds);
}

// ---------------------------------------------------------------- F55 weight

/** PURE. Where the next read starts: a week before the last read, or 30 days back the first time. */
export function weightReadSince(now: number, lastRead: number | null): number {
  if (lastRead == null || !Number.isFinite(lastRead) || lastRead > now) return now - FIRST_READ_DAYS * DAY_MS;
  return lastRead - LATE_SYNC_DAYS * DAY_MS;
}

/**
 * PURE. The day a weigh-in belongs to: its date where it was taken (its own offset), else in the
 * phone's time zone at that moment (`phoneOffsetSec`).
 */
export function recordDay(timeMs: number, offsetSec: number | null, phoneOffsetSec: number): string {
  const off = offsetSec ?? phoneOffsetSec;
  return new Date(timeMs + off * 1000).toISOString().slice(0, 10);
}

/** The phone's offset from UTC (seconds) at a moment. */
export function phoneOffsetAt(timeMs: number): number {
  return -new Date(timeMs).getTimezoneOffset() * 60;
}

const sameKg = (a: number, b: number): boolean => Math.abs(a - b) < 0.005;

/** One change to the body-weight log. */
export type WeightWrite =
  | { kind: 'insert'; dateISO: string; kg: number }
  /** Replace a reading Health Connect gave this day earlier (`oldKg` guards a typed change since). */
  | { kind: 'update'; id: string; dateISO: string; kg: number; oldKg: number };

export interface WeightPlan {
  writes: WeightWrite[];
  days: Record<string, HealthWeightDay>;
  seen: Record<string, number>;
}

/**
 * PURE (F55). What a read adds to the body-weight log.
 *  - `records`: the weigh-ins read (any order); `existing`: the log's entry on each of their days;
 *  - `days`: the days filled from Health Connect before; `seen`: the record ids looked at before;
 *  - `pruneBefore`: ids of records older than this are forgotten (no read reaches them again).
 */
export function planWeightImport(
  records: readonly HealthWeightRecord[],
  existing: Readonly<Record<string, { id: string; kg: number }>>,
  days: Readonly<Record<string, HealthWeightDay>>,
  seen: Readonly<Record<string, number>>,
  today: string,
  pruneBefore: number,
  offsetAt: (timeMs: number) => number = phoneOffsetAt,
): WeightPlan {
  const nextDays: Record<string, HealthWeightDay> = { ...days };
  const nextSeen: Record<string, number> = {};
  for (const [id, t] of Object.entries(seen)) if (t >= pruneBefore) nextSeen[id] = t;
  const log: Record<string, { id: string | null; kg: number }> = { ...existing };
  const byDay = new Map<string, WeightWrite>();
  const done = new Set<string>();

  const sorted = [...records].sort((a, b) => a.timeMs - b.timeMs);
  for (const r of sorted) {
    if (!r || typeof r.id !== 'string' || r.id === '' || !Number.isFinite(r.timeMs)) continue;
    if (Object.prototype.hasOwnProperty.call(seen, r.id) || done.has(r.id)) continue;
    done.add(r.id);
    const day = recordDay(r.timeMs, r.offsetSec, offsetAt(r.timeMs));
    // Release review: a reading dated after the phone's today (travel, a scale clock running fast) is
    // not marked as seen, so the next read picks it up once that day comes.
    if (day > today) continue;
    if (r.timeMs >= pruneBefore) nextSeen[r.id] = r.timeMs;
    if (!Number.isFinite(r.kg) || r.kg < KG_MIN || r.kg > KG_MAX) continue;
    const kg = Math.round(r.kg * 100) / 100;
    const have = log[day];
    const mark = nextDays[day];
    if (!have) {
      byDay.set(day, { kind: 'insert', dateISO: day, kg });
    } else {
      // Typed by the member (no mark, or a value the member changed): never touched.
      if (!mark || !sameKg(mark.kg, have.kg)) continue;
      // An older reading of a day already filled with a later one: kept as it is.
      if (r.timeMs < mark.at) continue;
      if (sameKg(have.kg, kg)) {
        nextDays[day] = { kg: have.kg, at: r.timeMs };
        continue;
      }
      const prev = byDay.get(day);
      if (prev?.kind === 'insert') byDay.set(day, { kind: 'insert', dateISO: day, kg });
      else if (have.id) byDay.set(day, { kind: 'update', id: have.id, dateISO: day, kg, oldKg: prev?.kind === 'update' ? prev.oldKg : have.kg });
    }
    log[day] = { id: have?.id ?? null, kg };
    nextDays[day] = { kg, at: r.timeMs };
  }

  // Never grows for ever: the newest HC_DAYS_CAP days keep their mark.
  const keys = Object.keys(nextDays).sort();
  if (keys.length > HC_DAYS_CAP) for (const k of keys.slice(0, keys.length - HC_DAYS_CAP)) delete nextDays[k];
  return { writes: [...byDay.values()], days: nextDays, seen: nextSeen };
}

/** PURE (F55). Is this weigh-in in the list from Health Connect (its day marked, same value)? */
export function isHealthWeight(dateISO: string, kg: number, days: Readonly<Record<string, HealthWeightDay>>): boolean {
  const m = days[dateISO];
  return !!m && sameKg(m.kg, kg);
}

/** F55: the line under a weigh-in that came from Health Connect. */
export const WEIGHT_FROM_HC = 'Weight from Health Connect';

/** What one weight read did. */
export type WeightReadResult =
  | { kind: 'added'; added: number }
  /** Weight reading is off, demo data is loaded, or this build cannot read. */
  | { kind: 'off' }
  | { kind: 'not-allowed' }
  | { kind: 'error' };

/** PURE. The line on the Health Connect page after a read the member asked for. */
export function weightResultText(r: WeightReadResult): string | null {
  switch (r.kind) {
    case 'added':
      return r.added === 0
        ? 'No new weigh-ins in Health Connect yet.'
        : `Added ${fmtInt(r.added)} weigh-in${r.added === 1 ? '' : 's'} from Health Connect to your body weight.`;
    case 'error':
      return "Couldn't read your weight from Health Connect. MettleUp will try again the next time you open it.";
    default:
      return null;
  }
}

/** PURE (R-267 style). Whether the automatic read runs now. */
export function shouldReadWeights(now: number, lastTry: number | null, on: boolean): boolean {
  if (!on) return false;
  return lastTry == null || now - lastTry >= WEIGHT_READ_GAP_MS || now < lastTry;
}

let lastAutoRead: number | null = null;
let reading: Promise<WeightReadResult> | null = null;

/** Tests only. */
export function resetWeightReadForTests(): void {
  lastAutoRead = null;
  reading = null;
}

/**
 * Read new weigh-ins and add them to the body-weight log. `force` skips the 10-minute wait (the
 * member just said yes). Never throws.
 */
export async function readHealthWeights(opts: { force?: boolean; now?: number } = {}): Promise<WeightReadResult> {
  const now = opts.now ?? Date.now();
  const p = usePhonePrefs.getState();
  if (!p.healthWeightOn || p.healthRevoked) return { kind: 'off' };
  if (!opts.force && !shouldReadWeights(now, lastAutoRead, true)) return { kind: 'off' };
  if (reading) return reading;
  // Release review: the 10-minute wait starts only after a read that got an answer, so a failed
  // read is tried again the next time the member opens or comes back to the app.
  reading = readOnce(now)
    .then((r) => {
      if (r.kind === 'added' || r.kind === 'not-allowed') lastAutoRead = now;
      return r;
    })
    .finally(() => {
      reading = null;
    });
  return reading;
}

async function readOnce(now: number): Promise<WeightReadResult> {
  const n = phoneNative();
  if (!n?.healthReadWeights || n.healthStatus() !== 'available') return { kind: 'off' };
  const demo = await isDemoData().catch((e: unknown) => {
    console.warn('[ForgeErr] health: demo-data check failed; weigh-ins not read this time', e);
    return true;
  });
  if (demo) return { kind: 'off' };
  const p = usePhonePrefs.getState();
  const since = weightReadSince(now, p.healthWeightRead);
  let got: HealthWeightRecord[] | null;
  try {
    got = await n.healthReadWeights(since);
  } catch (e) {
    console.warn('[ForgeErr] health: weigh-ins could not be read from Health Connect', e);
    return { kind: 'error' };
  }
  if (got == null) return { kind: 'not-allowed' };
  const records = got;
  try {
    const added = await enqueueWrite(async () => {
      const cur = usePhonePrefs.getState();
      const today = todayISO();
      const offs = records.map((r) => recordDay(r.timeMs, r.offsetSec, phoneOffsetAt(r.timeMs)));
      const want = [...new Set(offs)];
      const existing: Record<string, { id: string; kg: number }> = {};
      const db = getDb();
      for (let i = 0; i < want.length; i += 500) {
        const part = want.slice(i, i + 500);
        if (part.length === 0) continue;
        const rows = await db.getAllAsync<{ id: string; date_iso: string; weight_kg: number }>(
          `SELECT id, date_iso, weight_kg FROM body_weight WHERE date_iso IN (${part.map(() => '?').join(', ')})`,
          part,
        );
        for (const r of rows) existing[r.date_iso] = { id: r.id, kg: r.weight_kg };
      }
      const plan = planWeightImport(records, existing, cur.healthWeightDays ?? {}, cur.healthWeightSeen ?? {}, today, since);
      let count = 0;
      if (plan.writes.length > 0) {
        await db.withTransactionAsync(async () => {
          for (const w of plan.writes) {
            if (w.kind === 'insert') {
              const res = await db.runAsync(
                'INSERT INTO body_weight(id, date_iso, weight_kg) VALUES(?, ?, ?) ON CONFLICT(date_iso) DO NOTHING',
                [uuid(), w.dateISO, w.kg],
              );
              if (res.changes > 0) count += 1;
              else delete plan.days[w.dateISO];
            } else {
              // Guarded: a weight typed in between is never overwritten.
              const res = await db.runAsync('UPDATE body_weight SET weight_kg = ? WHERE id = ? AND ABS(weight_kg - ?) < 0.005', [w.kg, w.id, w.oldKg]);
              if (res.changes > 0) count += 1;
              else delete plan.days[w.dateISO];
            }
          }
        });
      }
      cur.setHealthRead({ healthWeightDays: plan.days, healthWeightSeen: plan.seen, healthWeightRead: now });
      return count;
    });
    return { kind: 'added', added };
  } catch (e) {
    console.warn('[ForgeErr] health: weigh-ins could not be added to the body-weight log', e);
    return { kind: 'error' };
  }
}

// ---------------------------------------------------------------- F62 steps

export type StepsResult = { kind: 'steps'; steps: number } | { kind: 'not-allowed' } | { kind: 'error' } | { kind: 'off' };

/** Today's steps from Health Connect. Never throws. */
export async function readStepsToday(): Promise<StepsResult> {
  const n = phoneNative();
  const p = usePhonePrefs.getState();
  if (!p.healthStepsOn || p.healthRevoked) return { kind: 'off' };
  if (!n?.healthStepsToday || n.healthStatus() !== 'available') return { kind: 'off' };
  try {
    const s = await n.healthStepsToday();
    if (s == null) return { kind: 'not-allowed' };
    return { kind: 'steps', steps: Math.max(0, Math.round(s)) };
  } catch (e) {
    console.warn('[ForgeErr] health: steps could not be read from Health Connect', e);
    return { kind: 'error' };
  }
}

/** PURE. The steps line: "6,240 steps so far today." */
export function stepsText(steps: number): string {
  if (steps <= 0) return 'No steps recorded today yet.';
  return `${fmtInt(steps)} step${steps === 1 ? '' : 's'} so far today.`;
}

// ---------------------------------------------------------------- words (Health Connect page)

export const HC_WEIGHT_TITLE = 'Weight from Health Connect';
export const HC_WEIGHT_ABOUT =
  'Weigh-ins from your smart scale or another health app go into your body weight by themselves. A weight you typed yourself is never changed.';
export const HC_WEIGHT_ON =
  'On. When you open MettleUp, new weigh-ins from Health Connect are added to your body weight. A weight you typed yourself is never changed.';
export const HC_WEIGHT_NOT_ALLOWED =
  'Health Connect isn\'t letting MettleUp read your weight yet. Tap "Open Health Connect" below and turn on "Weight".';
export const HC_WEIGHT_STOPPED = 'Stopped. New weigh-ins are no longer added. Weigh-ins already added stay in your body weight.';
export const HC_STEPS_TITLE = 'Steps today';
export const HC_STEPS_ABOUT = 'See how many steps your phone or watch counted today, through Health Connect. Your steps stay on this phone.';
export const HC_STEPS_NOT_ALLOWED =
  'Health Connect isn\'t letting MettleUp read your steps yet. Tap "Open Health Connect" below and turn on "Steps".';
export const HC_STEPS_ERROR = "Couldn't read your steps from Health Connect. Please try again later.";
