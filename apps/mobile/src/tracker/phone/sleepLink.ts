/**
 * R-344 (owner, 5 Nov 2026: "lets build the sleep integration. And sprinkle in suggestions around checking
 * enough protein intake"), step 1 of F193 "Why did today fall short?" (R-342).
 *
 * When a finished workout is LIGHTER than last time (the finish screen's big card says so: kgHero tone
 * 'down', never an easy week), the finish screen may add ONE calm line under that card:
 *  - Sleep: with "Sleep and workouts" on (Settings → Health apps, off by default) and last night under
 *    6 hours in Health Connect: "You slept 5 h 10 min last night. A weaker day after short sleep is
 *    normal. Aim for 7 hours or more tonight."
 *  - Otherwise (sleep fine, unknown, or the switch off): sometimes a protein tip. No food log is live
 *    (F49 hidden), so a tip NEVER says anything about what the member ate. At most one tip every
 *    PROTEIN_TIP_GAP_DAYS days; the tips take turns.
 *  - Never medical wording, never blame. Member words: never "volume", "PR" or "session".
 *
 * Privacy (R-344): sleep is read from Health Connect on this phone, kept in memory for this one screen
 * and never stored, backed up, sent to MettleUp's server, the gym or any AI. When Health Connect is
 * missing, sleep may not be read, or the night cannot be told apart, the answer is 'unknown': never a guess.
 *
 * "Last night" is worked out in real time (epoch ms), not by calendar date, so a workout just after
 * midnight in India (00:30 IST) still finds the night that ended the morning before, and a night that
 * crossed midnight is one night. See test/tracker/sleepLink.test.ts.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { phoneNative, type HealthSleepSession } from './native';
import { usePhonePrefs } from './phonePrefs';

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

/** Under this many minutes asleep, the night was short (6 h; adults need 7 or more, AASM/SRS 2015). */
export const SHORT_SLEEP_MIN = 6 * 60;
/** The aim the line gives. */
export const GOOD_SLEEP_HOURS = 7;
/** "Last night" is a sleep that ended at most this long before the workout started. */
export const NIGHT_LOOKBACK_MS = 20 * HOUR_MS;
/** Two sleeps less than this far apart are one night (woke at 3 am, slept again). */
export const SAME_NIGHT_GAP_MS = 2 * HOUR_MS;
/** A block shorter than this is a nap or a watch taken off at night: not a night, so 'unknown'. */
export const MIN_NIGHT_MIN = 3 * 60;
/** Longer than this is a tracker mistake: 'unknown'. */
export const MAX_NIGHT_MIN = 16 * 60;
/** A protein tip shows at most once in this many days. */
export const PROTEIN_TIP_GAP_DAYS = 3;

/** Health Connect's SleepSessionRecord stages that are NOT sleep (awake, out of bed, awake in bed). */
const AWAKE_STAGES = new Set([1, 3, 7]);

/** Last night's sleep, as the line uses it. */
export interface SleepNight {
  /** Minutes asleep (awake stages left out; two trackers on the same night are not added twice). */
  asleepMin: number;
  /** When the night started and ended (epoch ms). */
  startMs: number;
  endMs: number;
}

export type LastNight = SleepNight | 'unknown';

type Span = [number, number];

/** Overlapping or touching spans joined into one. PURE. */
function union(spans: readonly Span[]): Span[] {
  const sorted = spans.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((x, y) => x[0] - y[0]);
  const out: Span[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

const total = (spans: readonly Span[]): number => spans.reduce((n, [a, b]) => n + (b - a), 0);

/** The part of `spans` that `cut` covers. PURE. */
function overlap(spans: readonly Span[], cut: readonly Span[]): number {
  let n = 0;
  for (const [a, b] of spans) for (const [c, d] of cut) n += Math.max(0, Math.min(b, d) - Math.max(a, c));
  return n;
}

/**
 * Minutes asleep over some sleep sessions: the time they cover (a watch and a phone app recording the
 * same night count once) minus the stages marked awake. A session without stages counts whole. PURE.
 */
export function asleepMinutes(sessions: readonly HealthSleepSession[]): number {
  const inBed = union(sessions.map((s) => [s.startMs, s.endMs] as Span));
  const awake = union(sessions.flatMap((s) => (s.stages ?? []).filter((st) => AWAKE_STAGES.has(st.stage)).map((st) => [st.startMs, st.endMs] as Span)));
  return Math.max(0, Math.round((total(inBed) - overlap(inBed, awake)) / MIN_MS));
}

/**
 * Last night before a workout that started at `workoutStartMs`: the sleeps that ended in the 20 hours
 * before it, joined into nights (gaps under 2 hours), and the night with the most sleep (an afternoon
 * nap never wins over the night). 'unknown' when there is none, or it is too short (under 3 h: a nap,
 * or the watch was off) or too long (over 16 h) to be sure. PURE.
 */
export function lastNight(sessions: readonly HealthSleepSession[] | null | undefined, workoutStartMs: number): LastNight {
  if (!sessions || !Number.isFinite(workoutStartMs)) return 'unknown';
  const from = workoutStartMs - NIGHT_LOOKBACK_MS;
  const near = sessions
    .filter((s) => s && Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs > s.startMs && s.endMs <= workoutStartMs && s.endMs > from)
    .sort((a, b) => a.startMs - b.startMs);
  if (near.length === 0) return 'unknown';
  const nights: HealthSleepSession[][] = [];
  let end = -Infinity;
  for (const s of near) {
    const cur = nights[nights.length - 1];
    if (cur && s.startMs - end < SAME_NIGHT_GAP_MS) {
      cur.push(s);
      end = Math.max(end, s.endMs);
    } else {
      nights.push([s]);
      end = s.endMs;
    }
  }
  let best: SleepNight | null = null;
  for (const n of nights) {
    const asleepMin = asleepMinutes(n);
    if (!best || asleepMin > best.asleepMin) {
      best = { asleepMin, startMs: Math.min(...n.map((s) => s.startMs)), endMs: Math.max(...n.map((s) => s.endMs)) };
    }
  }
  if (!best || best.asleepMin < MIN_NIGHT_MIN || best.asleepMin > MAX_NIGHT_MIN) return 'unknown';
  return best;
}

/** "5 h 10 min", "6 h", "45 min". PURE. */
export function sleepWords(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** The sleep line (member-words, R-98). PURE. */
export function sleepLine(asleepMin: number): string {
  return `You slept ${sleepWords(asleepMin)} last night. A weaker day after short sleep is normal. Aim for ${GOOD_SLEEP_HOURS} hours or more tonight.`;
}

/** The protein tips, in turn (member-words, R-98). Never a number about what the member ate. */
export const PROTEIN_TIPS: readonly string[] = [
  'Was today lighter than last time? Check that you eat enough protein. A palm-sized portion with each meal helps your muscles recover.',
  'Muscles grow back stronger between workouts, with protein and rest. Eggs, paneer, dal, curd, chicken or fish with each meal all help.',
  'Lighter days happen. Some protein at every meal, not just one big one, helps your muscles recover for next time.',
];

/** Whole days from `a` to `b` (YYYY-MM-DD). PURE. */
function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Number.isFinite(ta) && Number.isFinite(tb) ? Math.round((tb - ta) / DAY_MS) : Infinity;
}

/** Can a protein tip show today (none in the last PROTEIN_TIP_GAP_DAYS days)? PURE. */
export function proteinTipDue(todayISO: string, lastTipDay: string | null): boolean {
  if (!lastTipDay) return true;
  const d = daysBetween(lastTipDay, todayISO);
  // A tip "in the future" (the phone's clock was changed) does not block for ever.
  return d >= PROTEIN_TIP_GAP_DAYS || d < 0;
}

export type ShortDayNote =
  | { kind: 'sleep'; text: string }
  /** `next`: the tip to show next time (store it with today's date when this one is shown). */
  | { kind: 'protein'; text: string; next: number };

/**
 * The one line under the finish screen's big card, or null. PURE.
 *  - only on a lighter day: `tone` 'down' and not an easy week (lighter on purpose);
 *  - sleep under 6 h (known): the sleep line;
 *  - else a protein tip when one is due (`tipDay`: when the last showed; `tipNext`: which is next).
 */
export function shortDayNote(o: {
  tone: 'up' | 'same' | 'down' | 'first' | null | undefined;
  easyWeek: boolean;
  sleep: LastNight;
  todayISO: string;
  tipDay: string | null;
  tipNext: number;
}): ShortDayNote | null {
  if (o.tone !== 'down' || o.easyWeek) return null;
  if (o.sleep !== 'unknown' && o.sleep.asleepMin < SHORT_SLEEP_MIN) return { kind: 'sleep', text: sleepLine(o.sleep.asleepMin) };
  if (!proteinTipDue(o.todayISO, o.tipDay)) return null;
  const n = PROTEIN_TIPS.length;
  const i = Number.isInteger(o.tipNext) ? ((o.tipNext % n) + n) % n : 0;
  return { kind: 'protein', text: PROTEIN_TIPS[i], next: (i + 1) % n };
}

// ---------------------------------------------------------------- reading (phone)

/** Can this build read sleep at all (an older native piece cannot)? Android only. */
export function canReadSleep(): boolean {
  if (Platform.OS !== 'android') return false; // iPhone: Apple Health later (docs/ios/PARITY.yaml)
  const n = phoneNative();
  return !!n && typeof n.healthReadSleep === 'function' && typeof n.healthRequestRead === 'function';
}

/** Is sleep reading allowed? null = no Health Connect / cannot read; 'error' = could not be asked now. */
export async function sleepAccess(): Promise<boolean | 'error' | null> {
  const n = phoneNative();
  if (!n || !canReadSleep() || !n.healthAccess) return null;
  if (n.healthStatus() !== 'available') return null;
  if (usePhonePrefs.getState().healthRevoked) return false;
  try {
    const a = await n.healthAccess();
    return a ? a.sleep === true : null;
  } catch (e) {
    console.warn('[ForgeErr] health: sleep access could not be checked', e);
    return 'error';
  }
}

/**
 * QA builds only (qa-device.yml writes extra.qaStandIns with 'sleepSample' into app.json; store and GitHub
 * release builds never carry it): mettleup://qa-sleep?min=N makes "last night" N minutes long (N < 0 =
 * unknown), so the device UAT can photograph the finish screen's line without a sleep tracker. PURE.
 */
export function hasSleepStandIn(extra: unknown): boolean {
  const list = extra && typeof extra === 'object' ? (extra as { qaStandIns?: unknown }).qaStandIns : undefined;
  return Array.isArray(list) && list.includes('sleepSample');
}

let qaSleep: number | null = null;

/** QA builds only: set by the qa-sleep link (ignored on every other build). */
export function setQaSleep(min: number | null): void {
  qaSleep = hasSleepStandIn(Constants.expoConfig?.extra) ? min : null;
}

/** True while the made-up night is in use (the line then says so on screen). */
export function qaSleepInUse(): boolean {
  return qaSleep != null && hasSleepStandIn(Constants.expoConfig?.extra);
}

/**
 * Last night's sleep before a workout, from Health Connect. 'unknown' when the switch is off, Health
 * Connect is missing, sleep may not be read, the read failed, or no night can be told. Never throws.
 * Nothing read here is stored or sent.
 */
export async function readLastNight(workoutStartMs: number): Promise<LastNight> {
  if (qaSleepInUse()) {
    const min = qaSleep ?? -1;
    return min < 0 ? 'unknown' : { asleepMin: min, startMs: workoutStartMs - 10 * HOUR_MS, endMs: workoutStartMs - 10 * HOUR_MS + min * MIN_MS };
  }
  const p = usePhonePrefs.getState();
  if (!p.sleepLinkOn || p.healthRevoked || !canReadSleep()) return 'unknown';
  const n = phoneNative();
  if (!n?.healthReadSleep || n.healthStatus() !== 'available') return 'unknown';
  try {
    const got = await n.healthReadSleep(workoutStartMs - NIGHT_LOOKBACK_MS, workoutStartMs);
    return lastNight(got, workoutStartMs);
  } catch (e) {
    console.warn('[ForgeErr] health: sleep could not be read from Health Connect', e);
    return 'unknown';
  }
}

/** Ask Health Connect for sleep only. False = nothing opened. */
export function askSleep(): boolean {
  const n = phoneNative();
  if (!n?.healthRequestRead || !canReadSleep()) return false;
  usePhonePrefs.getState().setHealthRead({ healthRevoked: false });
  return n.healthRequestRead(['sleep']);
}

// ---------------------------------------------------------------- words (Settings → Health apps)

export const SLEEP_TITLE = 'Sleep and workouts';
export const SLEEP_ABOUT =
  "When a workout is lighter than last time, MettleUp can check how long you slept last night, from your watch or sleep app through Health Connect. Your sleep stays on this phone.";
export const SLEEP_ON =
  "On. After a lighter workout, MettleUp checks last night's sleep. Your sleep stays on this phone and is never sent anywhere.";
export const SLEEP_NOT_ALLOWED =
  'Health Connect isn\'t letting MettleUp read your sleep yet. Tap "Open Health Connect" below and turn on "Sleep".';
/** Under the finish screen's line on a QA build with the made-up night. */
export const QA_SLEEP_NOTE = 'Test build: made-up sleep.';
