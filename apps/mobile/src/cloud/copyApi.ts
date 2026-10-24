/**
 * The cloud copy's calls (supabase/migrations/0032_member_cloud.sql). Each answer is either the
 * data or a `SendFailure` (copyPlan.classifyCopyError); nothing here throws. The full error is
 * logged; the member only ever reads the words in accountWords.ts. No key or token is logged.
 *
 * Kept apart from the pure modules: the Supabase client is native-backed (AsyncStorage).
 */
import { getSupabase } from '@/cloud/client';

import { classifyCopyError, type QueueOp, type SendFailure, type ServerItem } from './copyPlan';
import { ITEM_KINDS, PACK_VERSION, type ItemKind } from './pack';

export type CopyAnswer<T> = { ok: true; data: T } | { ok: false; failure: SendFailure };

const READ_MS = 20_000;
const WRITE_MS = 30_000;

async function rpc(fn: string, args: Record<string, unknown> | undefined, timeoutMs: number): Promise<CopyAnswer<unknown>> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await getSupabase().rpc(fn, args).abortSignal(ac.signal);
    if (res.error) {
      const failure = classifyCopyError({ ...res.error, status: res.status });
      console.warn(`[cloud copy] ${fn} refused (${failure}): ${res.error.code ?? ''} ${res.error.message ?? ''}`);
      return { ok: false, failure };
    }
    return { ok: true, data: res.data };
  } catch (e) {
    console.warn(`[cloud copy] ${fn} did not get an answer`, e);
    return { ok: false, failure: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/** What the server said to a batch: how many it kept, and which it refused as older than its own. */
export interface PutAnswer {
  saved: number;
  older: number;
  /** The items the server already holds a NEWER edit of (0032 returns them; empty from an older 0032). */
  olderIds: { kind: ItemKind; id: string }[];
}

/** Send up to 200 writes; the server keeps each unless it already holds a newer edit. */
export async function apiCopyPut(ops: readonly QueueOp[]): Promise<CopyAnswer<PutAnswer>> {
  const items = ops.map((o) => ({ k: o.kind, i: o.id, v: PACK_VERSION, d: o.data, e: o.editedAt }));
  const r = await rpc('member_copy_put', { p_items: items }, WRITE_MS);
  if (!r.ok) return r;
  return { ok: true, data: putAnswerOf(r.data) };
}

/** member_copy_put's answer as the app's shape. PURE. */
export function putAnswerOf(raw: unknown): PutAnswer {
  const d = (raw ?? {}) as { saved?: unknown; older?: unknown; olderIds?: unknown };
  const olderIds: PutAnswer['olderIds'] = [];
  for (const x of Array.isArray(d.olderIds) ? (d.olderIds as unknown[]) : []) {
    const o = x as { k?: unknown; i?: unknown } | null;
    if (o && typeof o.k === 'string' && ITEM_KINDS.includes(o.k as ItemKind) && typeof o.i === 'string') olderIds.push({ kind: o.k as ItemKind, id: o.i });
  }
  return { saved: Number(d.saved) || 0, older: Number(d.older) || 0, olderIds };
}

/** One page of the copy: the readable items, how many rows the server sent, and the last row's place. */
export interface CopyPage {
  items: ServerItem[];
  rows: number;
  last: { kind: string; id: string } | null;
}

/** One page of the member's copy, in (kind, id) order after the given place. */
export async function apiCopyGet(afterKind: string, afterId: string, limit: number): Promise<CopyAnswer<CopyPage>> {
  const r = await rpc('member_copy_get', { p_after_kind: afterKind, p_after_id: afterId, p_limit: limit }, READ_MS);
  if (!r.ok) return r;
  return { ok: true, data: copyPageOf(r.data) };
}

/**
 * The server's rows as the app's shape. An unreadable row is left out of `items` (and logged), but
 * still counts in `rows` and moves `last`, so paging never stops early on it. PURE.
 */
export function copyPageOf(raw: unknown): CopyPage {
  const page: CopyPage = { items: [], rows: 0, last: null };
  if (!Array.isArray(raw)) return page;
  for (const x of raw as unknown[]) {
    page.rows++;
    const o = x as { k?: unknown; i?: unknown; v?: unknown; d?: unknown; e?: unknown } | null;
    if (o && typeof o.k === 'string' && typeof o.i === 'string') page.last = { kind: o.k, id: o.i };
    const e = Number(o?.e);
    if (!o || typeof o.k !== 'string' || !ITEM_KINDS.includes(o.k as ItemKind) || typeof o.i !== 'string' || !Number.isFinite(e)) {
      console.warn('[cloud copy] a row of the copy could not be read; left out');
      continue;
    }
    page.items.push({ kind: o.k as ItemKind, id: o.i, v: Number(o.v) || 1, data: typeof o.d === 'string' ? o.d : null, editedAt: e });
  }
  return page;
}

export async function apiCopyCount(): Promise<CopyAnswer<{ items: number; workouts: number }>> {
  const r = await rpc('member_copy_count', undefined, READ_MS);
  if (!r.ok) return r;
  const d = (r.data ?? {}) as { items?: unknown; workouts?: unknown };
  return { ok: true, data: { items: Number(d.items) || 0, workouts: Number(d.workouts) || 0 } };
}

/**
 * Delete the member's copy, and the account itself unless it is also a gym's sign-in (0032 keeps an
 * owner's, a trainer's or an older gym-sync member's account and deletes only the copy: 'kept').
 */
export async function apiAccountDelete(): Promise<CopyAnswer<'deleted' | 'kept'>> {
  const r = await rpc('member_account_delete', undefined, WRITE_MS);
  if (!r.ok) return r;
  const d = (r.data ?? {}) as { account?: unknown };
  return { ok: true, data: d.account === 'kept' ? 'kept' : 'deleted' };
}

export async function apiAppLimits(): Promise<CopyAnswer<unknown>> {
  // Short: it is read in the background, and a slow answer only means the kept one is used.
  return rpc('app_limits', undefined, 8000);
}
