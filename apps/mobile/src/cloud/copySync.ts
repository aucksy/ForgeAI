/**
 * The cloud copy, run (tracker #50, owner 24 Oct 2026). For a member signed in with "Continue with
 * Google", every saved workout — and routines, own exercises, rest lengths, body weight,
 * measurements, progress photo days and the profile — is also kept on ForgeAI's server, quietly in
 * the background:
 *
 *   scan    reads the phone, compares it with what was last copied (copyPlan.planScan), queues
 *           what changed. One job in the app's write queue, so it never overlaps a save or a wipe.
 *   drain   sends the queue 100 at a time; a failure waits and tries again (copyPlan.nextTryAt),
 *           so it works offline: nothing is lost, the queue just waits for the internet.
 *   bring back  (after sign-in on a new phone, or Settings → Backup → "Bring back my workouts")
 *           reads the whole copy and merges it in: no duplicate workouts, the newest edit wins.
 *
 * WHEN. After any saved change (debounced), when the app goes to the background, when it comes back,
 * when the internet comes back, and right after a finished workout; never during a workout. A phone
 * with no account (or a build without it) subscribes to nothing and makes no network call.
 *
 * BRING BACK FIRST. After a sign-in, a Drive restore or an undo replaced the data, the scan's safety
 * rule, or the server holding newer edits, MERGE_PENDING_KEY is set: the next copy brings the server
 * copy in before anything on the phone is sent, so an older phone never overwrites a newer copy.
 *
 * NEVER for demo data (isDemoData): the sample member's made-up weeks never reach the server.
 * Google Drive backup is separate and stays as an optional extra copy.
 */
import { getDb, getMeta, setMeta } from '@/db';
import { enqueueWrite, onWriteDone } from '@/db/writeQueue';
import { isDemoData } from '@/onboarding/db/dataActions';
import { dataStamp } from '@/tracker/db/dataStamp';

import { COPY_FULL_KEY, getStoredAccount, LAST_COPY_KEY, MERGE_PENDING_KEY, NEEDS_SIGN_IN_KEY } from './accountMeta';
import type { CopyAnswer, CopyPage, PutAnswer } from './copyApi';
import { isAccountBuild } from './config';
import { nextTryAt, planMerge, planScan, type MergePlan, type QueueOp, type ScanPlan, type SendFailure, type ServerItem } from './copyPlan';
import {
  applyExclusive,
  dueOps,
  forgetCopiedState,
  initCloudCopySchema,
  markFailed,
  markSent,
  queueSize,
  readLocalItems,
  readState,
  writeScan,
  type ApplyResult,
  type QueuedRow,
} from './copyLocal';
import { packHash } from './pack';

/** The two calls the copy needs; the real ones load lazily (tests pass their own). */
export interface CopyApi {
  put: (ops: readonly QueueOp[]) => Promise<CopyAnswer<PutAnswer>>;
  get: (afterKind: string, afterId: string, limit: number) => Promise<CopyAnswer<CopyPage>>;
}

let apiForTests: CopyApi | null = null;
/** Tests only: talk to a stand-in server. */
export function setCopyApi(api: CopyApi | null): void {
  apiForTests = api;
}

async function copyApi(): Promise<CopyApi> {
  if (apiForTests) return apiForTests;
  const m = await import('./copyApi');
  return { put: m.apiCopyPut, get: m.apiCopyGet };
}

export const SEND_BATCH = 100;
export const PAGE = 500;
/** At most this many batches per drain (10,000 items): a first copy of years of history fits. */
const MAX_ROUNDS = 100;

// ------------------------------------------------------------------ the copy's own writes

/**
 * The copy's own queued writes. Each one's "saved" news is not a member's change, so it never
 * starts another copy (else every copy would cause one more full scan).
 */
let ownDone = 0;
/** Saved changes that were not the copy's own, counted (copyNow keeps its stamp only without one). */
let foreignSeen = 0;

function ownWrite<T>(fn: () => Promise<T>): Promise<T> {
  return enqueueWrite(async () => {
    const r = await fn();
    ownDone++; // only on success: a failed job tells "failed", not "saved"
    return r;
  });
}

function onSaved(): void {
  if (ownDone > 0) {
    ownDone--;
    return;
  }
  foreignSeen++;
  copySoon('saved');
}

// ------------------------------------------------------------------ scan

/** Read the phone and queue what changed. Null when nobody is signed in or the data is the demo. */
export async function scanCopy(now: () => number = Date.now): Promise<ScanPlan | null> {
  await initCloudCopySchema();
  const plan = await ownWrite(async () => {
    if (!(await getStoredAccount())) return null;
    if (await isDemoData()) return null;
    const db = getDb();
    const p = planScan(await readLocalItems(db), await readState(db), now());
    if (p.ops.length > 0 || p.forget.length > 0 || p.needsMerge) {
      await db.withTransactionAsync(async () => {
        await writeScan(db, p);
        // The safety rule fired: forget what was copied; the next copy brings the server's back first.
        if (p.needsMerge) await forgetCopiedState(db);
      });
    }
    return p;
  });
  if (plan?.held) console.warn(`[cloud copy] ${plan.held} changes and deletes held back (much of the copy would change at once); the server copy is brought back first`);
  for (const t of plan?.tooBig ?? []) console.warn(`[cloud copy] ${t.kind}:${t.id} is too big to copy (${t.size} characters); left on the phone only`);
  return plan;
}

// ------------------------------------------------------------------ drain

export interface DrainResult {
  sent: number;
  failure: SendFailure | null;
  left: number;
}

let draining: Promise<DrainResult> | null = null;

/** Send what is due. One drain at a time; a second call joins the running one. */
export function drainCopy(now: () => number = Date.now): Promise<DrainResult> {
  draining ??= drainOnce(now).finally(() => {
    draining = null;
  });
  return draining;
}

async function drainOnce(now: () => number): Promise<DrainResult> {
  await initCloudCopySchema();
  const result: DrainResult = { sent: 0, failure: null, left: 0 };
  if (!(await getStoredAccount())) return result;
  const api = await copyApi();
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const due = await dueOps(now(), SEND_BATCH);
    if (due.length === 0) break;
    const sent = await sendBatch(api, due, now);
    result.sent += sent.sent;
    if (sent.failure) {
      result.failure = sent.failure;
      break;
    }
  }
  if (result.sent > 0) {
    await setMeta(LAST_COPY_KEY, String(now()));
    await setMeta(COPY_FULL_KEY, '');
    await setMeta(NEEDS_SIGN_IN_KEY, '');
  }
  if (result.failure === 'signed-out') await setMeta(NEEDS_SIGN_IN_KEY, '1');
  if (result.failure === 'full') await setMeta(COPY_FULL_KEY, '1');
  result.left = await queueSize();
  return result;
}

/** One batch. A refused batch is sent one by one, so one damaged item never holds the rest back. */
async function sendBatch(api: CopyApi, due: QueuedRow[], now: () => number): Promise<{ sent: number; failure: SendFailure | null }> {
  const r = await api.put(due);
  if (r.ok) {
    await ownWrite(() => markSent(getDb(), due));
    if (r.data.older > 0) {
      // The server holds a newer edit of these (another phone): they come to this phone next time.
      const ids = r.data.olderIds.slice(0, 5).map((o) => `${o.kind}:${o.id}`).join(', ');
      console.warn(`[cloud copy] the server kept ${r.data.older} newer edit(s) (${ids}); brought to this phone on the next copy`);
      await setMeta(MERGE_PENDING_KEY, '1');
    }
    return { sent: due.length, failure: null };
  }
  if (r.failure === 'refused' && due.length > 1) {
    let sent = 0;
    for (const one of due) {
      const alone = await sendBatch(api, [one], now);
      sent += alone.sent;
      if (alone.failure && alone.failure !== 'refused') return { sent, failure: alone.failure };
    }
    return { sent, failure: null };
  }
  // The server without 0032 yet: wait hours, not seconds. A refused item: the longest wait.
  const failure = r.failure;
  const wait = (n: number): number => nextTryAt(failure === 'not-ready' || failure === 'refused' ? Math.max(n, 6) : n, now());
  await ownWrite(() => markFailed(getDb(), due, failure, wait));
  if (failure === 'refused') console.warn(`[cloud copy] ${due[0].kind}:${due[0].id} refused by the server; tried again in 6 hours`);
  return { sent: 0, failure: failure === 'refused' ? null : failure };
}

// ------------------------------------------------------------------ bring back

export type BringBack = { ok: true; result: ApplyResult & { keptLocal: number; onServer: number } } | { ok: false; failure: SendFailure | 'demo' };

/** The whole copy, a page at a time (paged on the rows the server sent, readable or not). */
export async function pullCopy(): Promise<CopyAnswer<ServerItem[]>> {
  const api = await copyApi();
  const all: ServerItem[] = [];
  let afterKind = '';
  let afterId = '';
  for (let page = 0; page < 200; page++) {
    const r = await api.get(afterKind, afterId, PAGE);
    if (!r.ok) return r;
    all.push(...r.data.items);
    if (r.data.rows < PAGE || !r.data.last) break;
    afterKind = r.data.last.kind;
    afterId = r.data.last.id;
  }
  return { ok: true, data: all };
}

/**
 * Bring the server copy into this phone (see the file note). The caller clears MERGE_PENDING_KEY
 * when this worked; the next scan then sends what the phone has that is newer.
 */
export async function bringBackCopy(now: () => number = Date.now, pulled?: ServerItem[]): Promise<BringBack> {
  await initCloudCopySchema();
  if (await isDemoData()) return { ok: false, failure: 'demo' };
  let server = pulled;
  if (!server) {
    const r = await pullCopy();
    if (!r.ok) return r;
    server = r.data;
  }
  const items = server;
  // A phone still on the welcome screen has no exercise library yet (start-up adds it with the
  // profile): add it first, so the sets come back onto the real library rows, with their types.
  const lib = await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM exercises WHERE catalog_key IS NOT NULL');
  if ((lib?.n ?? 0) === 0 && items.some((s) => s.data != null && (s.kind === 'w' || s.kind === 'r' || s.kind === 'p'))) {
    const { syncExerciseCatalog } = await import('@/tracker/catalog/catalogSync');
    await syncExerciseCatalog({ force: true, demo: false });
  }
  let plan: MergePlan | null = null;
  const applied = await ownWrite(async () => {
    const db = getDb();
    plan = planMerge(items, await readLocalItems(db), await readState(db), packHash, now());
    return applyExclusive(plan);
  });
  if (applied.exerciseIds.length > 0) {
    // Records are worked out from the sets that came back (the frozen record log).
    const { reconcilePrsForExercises } = await import('@/tracker/services/prRebuild');
    await ownWrite(() => reconcilePrsForExercises(applied.exerciseIds)).catch((e: unknown) =>
      console.warn('[cloud copy] records after bring-back failed; they catch up on the next edit', e),
    );
  }
  const keptLocal = (plan as MergePlan | null)?.keptLocal ?? 0;
  return { ok: true, result: { ...applied, keptLocal, onServer: items.filter((s) => s.data != null).length } };
}

// ------------------------------------------------------------------ when

const DEBOUNCE_MS = 8000;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastStamp: string | null = null;
let running = false;
let paused = false;

/** While the account screens sign in and bring the copy back, the background copy waits. */
export function setCopyPaused(p: boolean): void {
  paused = p;
}

/**
 * Bring back first when one is pending, then scan (when anything changed since the last scan, or
 * `force`) and send. Never throws. Never during a workout.
 */
export async function copyNow(why: string, opts: { force?: boolean } = {}): Promise<void> {
  if (running || paused) return;
  running = true;
  try {
    if (!(await getStoredAccount())) return;
    // Never during a workout: a scan reads the whole history inside the write queue, and the
    // workout's own saves must not wait behind it. The finish screen copies right after.
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    if (useActiveWorkout.getState().active) return;
    const before = foreignSeen;
    let force = opts.force === true;
    if ((await getMeta(MERGE_PENDING_KEY)) === '1') {
      // Nothing on the phone is sent as new until the server's copy is in (a sign-in, a restore, ...).
      const back = await bringBackCopy();
      if (!back.ok) {
        console.warn(`[cloud copy] ${why}: bring-back first did not work (${back.failure}); nothing sent, tried again later`);
        return;
      }
      await setMeta(MERGE_PENDING_KEY, '');
      force = true;
      if (back.result.workouts + back.result.other + back.result.removed > 0) {
        const { useDashboard } = await import('@/store/dashboardStore');
        await useDashboard.getState().refresh().catch((e: unknown) => console.warn('[cloud copy] refresh after bring-back', e));
      }
    }
    const stamp = await dataStamp().catch((e: unknown): string | null => {
      console.warn('[cloud copy] could not tell what changed; reading everything', e);
      return null;
    });
    if (force || stamp === null || stamp !== lastStamp) await scanCopy();
    await drainCopy();
    // The copy's own writes moved the stamp: keep the stamp as it is NOW, unless a member's change
    // was saved meanwhile (then the next copy reads again).
    lastStamp =
      foreignSeen === before
        ? await dataStamp().catch((e: unknown): string | null => {
            console.warn('[cloud copy] could not read the stamp after copying', e);
            return null;
          })
        : null;
  } catch (e) {
    console.warn(`[cloud copy] ${why}: failed; tried again later`, e);
  } finally {
    running = false;
  }
}

/** After a sign-in or a bring-back: the next copy reads everything again. */
export function forgetCopyStamp(): void {
  lastStamp = null;
}

/** A change was saved: copy in a few seconds (many saves close together copy once). */
export function copySoon(why: string, ms = DEBOUNCE_MS, opts: { force?: boolean } = {}): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void copyNow(why, opts);
  }, ms);
}

let watcher: { stop: () => void } | null = null;

/**
 * Watch for changes, leaving the app, coming back and the internet coming back (once; after a
 * sign-in, or at start for a phone already signed in). `stopWatchingCloudCopy` undoes it.
 */
export function watchCloudCopy(): void {
  if (watcher) return;
  let stopped = false;
  const offs: (() => void)[] = [onWriteDone(onSaved)];
  void (async () => {
    const { AppState } = await import('react-native');
    if (stopped) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') void copyNow('leaving the app', { force: true });
      else if (s === 'active') copySoon('back in the app', 1000);
    });
    offs.push(() => sub.remove());
    const NetInfo = (await import('@react-native-community/netinfo')).default;
    if (stopped) return;
    offs.push(
      NetInfo.addEventListener((state) => {
        if (state.isInternetReachable === true) copySoon('internet back', 1500);
      }),
    );
  })().catch((e: unknown) => console.warn('[cloud copy] could not start watching', e));
  watcher = {
    stop: () => {
      stopped = true;
      for (const off of offs.splice(0)) off();
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
  copySoon('start', 3000, { force: true });
}

export function stopWatchingCloudCopy(): void {
  watcher?.stop();
  watcher = null;
}

/**
 * From the root layout. Watches ONLY on a build with the member account and a phone signed in to it:
 * every other phone subscribes to nothing (no internet listener, no change listener). Returns the stop.
 */
export function startCloudCopy(): () => void {
  let cancelled = false;
  void (async () => {
    if (!isAccountBuild()) return;
    if (!(await getStoredAccount())) return;
    if (!cancelled) watchCloudCopy();
  })().catch((e: unknown) => console.warn('[cloud copy] could not check the account at start', e));
  return () => {
    cancelled = true;
    stopWatchingCloudCopy();
  };
}

/** What Settings shows. */
export interface CopyStatus {
  waiting: number;
  lastAt: number | null;
  needsSignIn: boolean;
  full: boolean;
}

export async function copyStatus(): Promise<CopyStatus> {
  await initCloudCopySchema();
  const last = Number((await getMeta(LAST_COPY_KEY)) ?? '');
  return {
    waiting: await queueSize(),
    lastAt: Number.isFinite(last) && last > 0 ? last : null,
    needsSignIn: (await getMeta(NEEDS_SIGN_IN_KEY)) === '1',
    full: (await getMeta(COPY_FULL_KEY)) === '1',
  };
}
