/**
 * The cloud copy's decisions (tracker #50), PURE: what to send, what to bring back, and when to
 * try again. The phone half that reads and writes SQLite is copyLocal.ts; the calls are copyApi.ts;
 * copySync.ts runs them in order.
 *
 * THE RULES
 *  - Every thing the member keeps is one item (pack.ts). The phone remembers, per item, what it last
 *    copied (its hash and edit time: the "state"). A scan compares the phone with that memory:
 *    new or changed items are queued to send, items gone from the phone are queued as deletes.
 *  - The NEWEST EDIT WINS, on the server (0032 refuses an older edit) and when bringing a copy back
 *    to a phone. An item's edit time is when a scan first saw that version.
 *  - NO DUPLICATE WORKOUTS, and never a lost one: two workouts are the same workout only when their
 *    whole content is the same (a Hevy import done on two phones gives each its own id, with the
 *    same sets). A start time alone proves nothing (a past workout is logged to the minute, a chat
 *    day at noon), so two different workouts at the same time are both kept.
 *  - A phone that suddenly lacks much of what it copied (a restore of an old backup, a wipe, a bug)
 *    never deletes or overwrites the copy: when more than half would go at once (and more than
 *    MASS_DELETE_MIN), or every workout, the scan sends only what is new and asks for a bring-back
 *    (`needsMerge`), which puts the server's newer copy back on the phone. A delete whose exact
 *    content is still on the phone under a new id (a "Replace" import) is always sent.
 */
import { MAX_PACKED_CHARS, type ItemKind } from './pack';

/** One thing on the phone, packed. `guess`: its edit time if it was never copied (ms). */
export interface LocalItem {
  kind: ItemKind;
  id: string;
  data: string;
  hash: string;
  guess: number;
}

/** What the phone last copied of an item. */
export interface StateRow {
  kind: ItemKind;
  id: string;
  hash: string;
  editedAt: number;
}

/** A write waiting to be sent: `data` null = deleted on the phone. */
export interface QueueOp {
  kind: ItemKind;
  id: string;
  data: string | null;
  editedAt: number;
}

/** One row of the member's server copy (member_copy_get). */
export interface ServerItem {
  kind: ItemKind;
  id: string;
  v: number;
  data: string | null;
  editedAt: number;
}

export const keyOf = (x: { kind: string; id: string }): string => `${x.kind}:${x.id}`;

// ------------------------------------------------------------------ scan

/** Below this many, deletes are never held as "too many at once" (a member tidying up). */
export const MASS_DELETE_MIN = 20;

export interface ScanPlan {
  ops: QueueOp[];
  /** State rows to write (the version just queued). */
  remember: StateRow[];
  /** State rows to forget (their delete is queued). */
  forget: { kind: ItemKind; id: string }[];
  /** Changes and deletes held back by the safety rule. */
  held: number;
  /** The safety rule fired: forget the state and bring the server copy back before the next scan. */
  needsMerge: boolean;
  /** Items too big for the server, left out (logged by the caller). */
  tooBig: { kind: ItemKind; id: string; size: number }[];
}

export function planScan(local: readonly LocalItem[], state: readonly StateRow[], now: number): ScanPlan {
  const known = new Map(state.map((s) => [keyOf(s), s]));
  const here = new Set(local.map(keyOf));
  const content = new Set(local.map((l) => `${l.kind}:${l.hash}`));
  const plan: ScanPlan = { ops: [], remember: [], forget: [], held: 0, needsMerge: false, tooBig: [] };
  const fresh: LocalItem[] = [];
  const changed: LocalItem[] = [];
  for (const item of local) {
    const was = known.get(keyOf(item));
    if (was && was.hash === item.hash) continue;
    if (item.data.length > MAX_PACKED_CHARS) {
      plan.tooBig.push({ kind: item.kind, id: item.id, size: item.data.length });
      continue;
    }
    (was ? changed : fresh).push(item);
  }
  const gone = state.filter((s) => !here.has(keyOf(s)));
  // The same content still here under another id: that delete loses nothing.
  const moved = gone.filter((g) => content.has(`${g.kind}:${g.hash}`));
  const lost = gone.filter((g) => !content.has(`${g.kind}:${g.hash}`));
  const workoutsCopied = state.filter((s) => s.kind === 'w').length;
  const workoutsHere = local.filter((l) => l.kind === 'w').length;
  const allWorkoutsGone = workoutsCopied >= 2 && workoutsHere === 0 && lost.some((g) => g.kind === 'w');
  const tooMany = lost.length > MASS_DELETE_MIN && lost.length * 2 > state.length;
  const hold = allWorkoutsGone || tooMany;

  const send = (item: LocalItem): void => {
    // Never older than what was already sent for it (a phone clock set back).
    const editedAt = Math.max(now, (known.get(keyOf(item))?.editedAt ?? 0) + 1);
    plan.ops.push({ kind: item.kind, id: item.id, data: item.data, editedAt });
    plan.remember.push({ kind: item.kind, id: item.id, hash: item.hash, editedAt });
  };
  const drop = (g: StateRow): void => {
    plan.ops.push({ kind: g.kind, id: g.id, data: null, editedAt: Math.max(now, g.editedAt + 1) });
    plan.forget.push({ kind: g.kind, id: g.id });
  };
  for (const item of fresh) send(item);
  for (const g of moved) drop(g);
  if (hold) {
    // A changed item here may be an OLD version (a restored backup): it must not overwrite the copy.
    plan.held = lost.length + changed.length;
    plan.needsMerge = true;
    return plan;
  }
  for (const item of changed) send(item);
  for (const g of lost) drop(g);
  return plan;
}

// ------------------------------------------------------------------ bring back (restore merge)

export interface MergeApply {
  kind: ItemKind;
  id: string;
  data: string;
  editedAt: number;
  /** A local twin under another id that this one replaces (a workout with the same start). */
  replaces?: string;
}

export interface MergePlan {
  /** Server versions to write into the phone (new, or newer than the phone's). */
  apply: MergeApply[];
  /** Deleted on another phone after this phone's last edit: delete here too. */
  remove: { kind: ItemKind; id: string }[];
  /** The phone and the server agree on these now. */
  remember: StateRow[];
  /** Server duplicates of a workout (the same content twice): deleted on the server. */
  serverDeletes: QueueOp[];
  /** Phone versions newer than the server's: the next scan sends them. */
  keptLocal: number;
}

/**
 * Bring the server's copy into the phone, newest edit winning. A workout under another id is the
 * same workout only when its content is the same (`hashOf` is pack.ts's packHash). PURE.
 */
export function planMerge(
  server: readonly ServerItem[],
  local: readonly LocalItem[],
  state: readonly StateRow[],
  hashOf: (data: string) => string,
  now: number,
): MergePlan {
  const plan: MergePlan = { apply: [], remove: [], remember: [], serverDeletes: [], keptLocal: 0 };
  const known = new Map(state.map((s) => [keyOf(s), s]));
  const byKey = new Map(local.map((l) => [keyOf(l), l]));
  const byContent = new Map<string, LocalItem>();
  for (const l of local) if (l.kind === 'w' && !byContent.has(`w:${l.hash}`)) byContent.set(`w:${l.hash}`, l);
  const serverKeys = new Set(server.map(keyOf));

  /** When the phone's version was made: its last copy's time if unchanged since, else now (edited since), else the guess. */
  const localEdit = (l: LocalItem): number => {
    const s = known.get(keyOf(l));
    if (!s) return l.guess;
    return s.hash === l.hash ? s.editedAt : Number.POSITIVE_INFINITY;
  };

  // The same workout twice on the server (two phones before this one): the newest edit only.
  const live: ServerItem[] = [];
  const seen = new Set<string>();
  for (const s of [...server].sort((a, b) => b.editedAt - a.editedAt)) {
    if (s.kind === 'w' && s.data != null) {
      const k = `w:${hashOf(s.data)}`;
      if (seen.has(k)) {
        plan.serverDeletes.push({ kind: s.kind, id: s.id, data: null, editedAt: Math.max(now, s.editedAt + 1) });
        continue;
      }
      seen.add(k);
    }
    live.push(s);
  }
  const claimed = new Set<string>();

  for (const s of live) {
    const same = byKey.get(keyOf(s));
    if (s.data == null) {
      // A delete only ever matches the same id.
      if (same && s.editedAt > localEdit(same)) plan.remove.push({ kind: s.kind, id: s.id });
      continue;
    }
    const hash = hashOf(s.data);
    // A twin: the same content under an id the server does not hold on its own.
    const twin = !same && s.kind === 'w' ? byContent.get(`w:${hash}`) : undefined;
    const l = same ?? (twin && !claimed.has(keyOf(twin)) && !serverKeys.has(keyOf(twin)) ? twin : undefined);
    if (!l) {
      plan.apply.push({ kind: s.kind, id: s.id, data: s.data, editedAt: s.editedAt });
      plan.remember.push({ kind: s.kind, id: s.id, hash, editedAt: s.editedAt });
      continue;
    }
    claimed.add(keyOf(l));
    if (l.id === s.id && l.hash === hash) {
      plan.remember.push({ kind: s.kind, id: s.id, hash, editedAt: s.editedAt });
      continue;
    }
    if (l.id !== s.id || s.editedAt >= localEdit(l)) {
      // A twin takes the server's id (same content: nothing changes for the member).
      plan.apply.push({ kind: s.kind, id: s.id, data: s.data, editedAt: s.editedAt, ...(l.id !== s.id ? { replaces: l.id } : {}) });
      plan.remember.push({ kind: s.kind, id: s.id, hash, editedAt: s.editedAt });
      continue;
    }
    // The phone's version is newer: the next scan sends it.
    plan.keptLocal++;
  }
  return plan;
}

// ------------------------------------------------------------------ retries

/** Waits after a failed send: 30 s, 2 min, 8 min, 32 min, about 2 h, then every 6 h. PURE. */
export function nextTryAt(attempts: number, now: number): number {
  const n = Math.max(1, Math.floor(attempts));
  return now + Math.min(6 * 3600_000, 30_000 * 4 ** (n - 1));
}

/** How a failed call is handled. */
export type SendFailure = 'offline' | 'signed-out' | 'not-ready' | 'full' | 'refused';

/**
 * Read a server or network error. `not-ready` = the server has not had 0032 yet (PostgREST
 * PGRST202, or no table). PURE.
 */
export function classifyCopyError(e: { code?: unknown; message?: unknown; status?: unknown } | null | undefined): SendFailure {
  const code = typeof e?.code === 'string' ? e.code : '';
  const msg = typeof e?.message === 'string' ? e.message : '';
  const status = typeof e?.status === 'number' ? e.status : 0;
  if (code === 'PGRST202' || code === '42883' || /could not find the function/i.test(msg)) return 'not-ready';
  // No sign-in sent (the call went as "anyone"): 0032 lets only signed-in members call these.
  if (/SIGN_IN/.test(msg) || status === 401 || code === 'PGRST301' || code === '42501' || /JWT|permission denied/i.test(msg)) return 'signed-out';
  if (/COPY_FULL/.test(msg)) return 'full';
  if (/INVALID|TOO_BIG|TOO_MANY/.test(msg)) return 'refused';
  return 'offline';
}
