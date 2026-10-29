/**
 * R-200 (owner, 30 Oct 2026): "we keep it off by default but we give them a switch on option on
 * leaderboard screen but switch off in settings". The PURE half of the "Show me to my gym" box at the
 * top of the leaderboard: when it shows, what it offers, and the one-tap switch-on with a clean
 * failure. No native imports (showMeRun.ts wires the real switches; ShowMeCard.tsx draws it).
 *
 * When the box shows (showMeOffer):
 *  - only while the member's name is OFF ("Show my name on my gym's leaderboard"). Name on = the
 *    member already chose to be seen; the workouts switch then lives in Settings only, because the
 *    box is about being shown, and a box that came back after the name is on would be a nag.
 *  - it offers the name, plus the workouts ("Let my gym mates see my workouts") when that is still
 *    off and the gym's server can hold shared workouts (0040 live). Workouts already on: name only.
 *  - never when the gym has hidden the member (gymHidesMe: inferred from the board, see there);
 *  - never for a member under 18. The app knows age only from the optional "Age" in Your profile (0 =
 *    not given; no date of birth is kept). Under 18 = no box; not given = the box may show; not read
 *    yet = no box (so it never flashes up for a minor).
 *  - "Not now" hides it for this gym for 30 days, kept on the phone; then it may show again.
 *
 * Switch-on (runShowMe): the SAME switches and server calls as Settings (set the switch, mark it
 * "the gym has not heard yet", push), but awaited. Either push not accepted (offline, slow, refused):
 * both are switched back off (the same calls again, so a gym that did hear is told "off", and with
 * no signal the "off" is kept and sent later), and the member is told nothing changed. Never a half
 * state: name on with workouts off because one call failed.
 */
import type { Board, BoardList } from './leaderboard';
import type { PushOutcome } from './leaderboardPush';
import type { MateOutcome } from './mateShare';

export const SHOW_ME_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
export const ADULT_AGE = 18;
/** A push already out (the board's own refresh) makes ours wait: try again every 250 ms, for up to 20 s. */
export const BUSY_WAIT_MS = 250;
export const BUSY_TRIES = 80;
const TOP_SHOWN = 10;

export type ShowMeOffer = 'none' | 'name' | 'both';

/**
 * Has the gym hidden this member? member_board (0037) never says so to the member: a hidden member is
 * left out of everyone's top 10 but still gets their own place (`me`), counted among the members
 * not hidden. So: in a list with my place but no row marked me, I am hidden when the list is short
 * (everyone not hidden with a number fits) or my place is strictly better than the last row's (I
 * would be on it). A tie at the cut-off (10th, 10th, 10th) is not proof, so it says no. A hidden
 * member far down the list cannot be told apart: the box may show; tapping it is harmless (the gym's
 * hiding still wins). PURE.
 */
export function gymHidesMe(board: Pick<Board, 'workouts' | 'kg'>): boolean {
  return listHidesMe(board.workouts) || listHidesMe(board.kg);
}

function listHidesMe(l: BoardList): boolean {
  if (!l.me || l.top.some((r) => r.me)) return false;
  if (l.top.length < TOP_SHOWN) return true;
  const last = l.top[l.top.length - 1]!.rank;
  return l.me.rank < last;
}

export interface OfferInput {
  nameOn: boolean;
  shareOn: boolean;
  /** The gym's server can hold shared workouts (0040 answered in this app session). */
  matesLive: boolean;
  board: Pick<Board, 'workouts' | 'kg'> | null;
  /** Profile age in years; 0 = not given; null = not read yet. */
  age: number | null;
  /** When "Not now" was tapped for this gym (epoch ms), or null/undefined. */
  snoozedAt: number | null | undefined;
  now: number;
}

/** What the box offers, or 'none'. PURE. */
export function showMeOffer(i: OfferInput): ShowMeOffer {
  if (i.nameOn || !i.board) return 'none';
  if (i.age == null || (i.age > 0 && i.age < ADULT_AGE)) return 'none';
  if (typeof i.snoozedAt === 'number' && Number.isFinite(i.snoozedAt) && i.now - i.snoozedAt < SHOW_ME_SNOOZE_MS && i.now >= i.snoozedAt) return 'none';
  if (gymHidesMe(i.board)) return 'none';
  return i.matesLive && !i.shareOn ? 'both' : 'name';
}

// ------------------------------------------------------------------ switching on

export interface ShowMeDeps {
  /** Set "Show my name…" and mark it not heard yet (exactly what the Settings switch does). */
  setName: (on: boolean) => void;
  /** Set "Let my gym mates see my workouts" and mark it not heard yet. */
  setShare: (on: boolean) => void;
  /** leaderboardSync.pushBoard('setting'). */
  pushName: () => Promise<PushOutcome>;
  /** mateSync.shareWithMates('setting'). */
  pushShare: () => Promise<MateOutcome>;
  pause: (ms: number) => Promise<void>;
  log: (message: string, detail?: unknown) => void;
}

export type ShowMeResult = 'on' | 'failed';

/** 'demo': nothing is sent for the sample data, the switch is simply kept (as in Settings). */
const nameOk = (r: PushOutcome): boolean => r === 'sent' || r === 'demo';
const shareOk = (r: MateOutcome): boolean => r === 'sent' || r === 'demo';

async function settle<T>(run: () => Promise<T>, pause: (ms: number) => Promise<void>): Promise<T> {
  let r = await run();
  for (let n = 0; r === 'busy' && n < BUSY_TRIES; n++) {
    await pause(BUSY_WAIT_MS);
    r = await run();
  }
  return r;
}

/** "Show me": the name, and the workouts when `want` is 'both'. Never throws. */
export async function runShowMe(want: Exclude<ShowMeOffer, 'none'>, deps: ShowMeDeps): Promise<ShowMeResult> {
  let shareTouched = false;
  let why: unknown = null;
  try {
    deps.setName(true);
    const n = await settle(deps.pushName, deps.pause);
    if (!nameOk(n)) why = `name: ${n}`;
    else if (want === 'both') {
      shareTouched = true;
      deps.setShare(true);
      const s = await settle(deps.pushShare, deps.pause);
      if (!shareOk(s)) why = `workouts: ${s}`;
    }
  } catch (e) {
    why = e;
  }
  if (why == null) return 'on';
  deps.log('[board] show me did not go through; both switched back off', why);
  try {
    deps.setName(false);
    if (shareTouched) deps.setShare(false);
  } catch (e) {
    deps.log('[board] show me: switching back off failed', e);
  }
  // Tell the gym "off" in case one call did reach it; with no signal the "off" is kept and sent later.
  void deps.pushName().catch((e: unknown) => deps.log('[board] show me: name off push', e));
  if (shareTouched) void deps.pushShare().catch((e: unknown) => deps.log('[board] show me: workouts off push', e));
  return 'failed';
}
