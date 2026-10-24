/**
 * The free plan's limits (tracker #43, owner 24 Oct 2026): "Members without a gym (or whose gym is
 * not on ForgeAI) get limited features, like Hevy's routine limit; gym members get everything; tell
 * people 'join through your gym to unlock everything'." Hevy's free plan: 4 routines, 7 custom
 * exercises, 3 months of charts — the same numbers here.
 *
 * OFF AT LAUNCH. One server switch turns them on for every phone, with no app update:
 * public.app_config 'free_limits' (supabase/migrations/0032_member_cloud.sql), read by
 * limitsFlag.ts and kept for 12 hours. Anything unreadable, or a server without 0032, means OFF:
 * the app never limits anyone by mistake. PURE.
 */

export interface FreeLimits {
  on: boolean;
  routines: number;
  customExercises: number;
  chartMonths: number;
}

/** What the app uses until the server says otherwise: everything free for everyone. */
export const LAUNCH_LIMITS: FreeLimits = { on: false, routines: 4, customExercises: 7, chartMonths: 3 };

const whole = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 10_000 ? v : fallback;

/** The server's answer as limits. `on` only when it says exactly true. PURE. */
export function parseFreeLimits(raw: unknown): FreeLimits {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    on: o.on === true,
    routines: whole(o.routines, LAUNCH_LIMITS.routines),
    customExercises: whole(o.customExercises, LAUNCH_LIMITS.customExercises),
    chartMonths: whole(o.chartMonths, LAUNCH_LIMITS.chartMonths),
  };
}

/** Do the limits apply to this member? Only when switched on AND the phone is in no gym. PURE. */
export function limitsApply(l: FreeLimits, inGym: boolean): boolean {
  return l.on && !inGym;
}

export type CountedLimit = 'routines' | 'customExercises';

/** Would one more go over the limit? `have` = how many the member has now. PURE. */
export function atLimit(l: FreeLimits, inGym: boolean, kind: CountedLimit, have: number): boolean {
  return limitsApply(l, inGym) && have >= l[kind];
}

/**
 * May a chart show this far back? `months` = the range's length (null = all time). The exercise
 * chart's "3 months" and the Profile's "Last 12 weeks" fit; "Year" and "All time" do not. PURE.
 */
export function chartRangeAllowed(l: FreeLimits, inGym: boolean, months: number | null): boolean {
  if (!limitsApply(l, inGym)) return true;
  return months != null && months <= l.chartMonths;
}

/** The months a chart range shows (null = all time): exercise charts '3m'/'1y'/'all', Profile 'weeks'/'year'/'all'. PURE. */
export function monthsOfRange(range: string): number | null {
  switch (range) {
    case '3m':
    case 'weeks': // the Profile's "Last 12 weeks"
      return 3;
    case '1y':
    case 'year':
      return 12;
    default:
      return null;
  }
}

/** How long the server's answer is kept on the phone. */
export const LIMITS_KEEP_MS = 12 * 60 * 60 * 1000;

export function limitsFresh(at: number | null, now: number): boolean {
  return at != null && now - at >= 0 && now - at < LIMITS_KEEP_MS;
}

// ------------------------------------------------------------------ words (member-words skill)

export type LimitKind = CountedLimit | 'charts';

/** The calm line, then what to do. Never "upgrade", never a price: joining a gym is free. */
export const JOIN_GYM_LINE = 'Join through your gym to unlock everything, free.';
export const JOIN_GYM_BUTTON = 'Open Your gym';
export const NOT_NOW = 'Not now';

/** Why the member is reading this, in one line. PURE. */
export function limitTitle(kind: LimitKind, l: FreeLimits): string {
  switch (kind) {
    case 'routines':
      return `Without a gym, you can keep ${l.routines} routines`;
    case 'customExercises':
      return `Without a gym, you can make ${l.customExercises} exercises of your own`;
    case 'charts':
      return `Without a gym, charts show the last ${l.chartMonths} months`;
  }
}
