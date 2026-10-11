/**
 * The gym's real shop (S2): the calls to the server. Each one is a `member_*` function in
 * supabase/migrations/0002_shop.sql, called as the anonymous role with this phone's MEMBER KEY —
 * no account, no sign-in. Every answer comes back as { ok, data } or { ok: false, error } with
 * the error already read (gym.ts → classifyRpcError), so screens only ever pick words.
 *
 * Kept out of the pure modules: the Supabase client is native-backed (AsyncStorage), and the
 * unit tests alias those packages to throwing stubs.
 */
import { getSupabase } from '@/cloud/client';

import { classifyRpcError, linkFromJoin, orderFromRow, ordersFromRows, productsFromRows, type GymError } from './gym';
import type { GymLink, GymOrder, Product } from './types';

export type GymResult<T> = { ok: true; data: T } | { ok: false; error: GymError };

/** How long a call may take before the app stops waiting (ms). An order gets longer: it writes. */
const READ_MS = 15000;
const WRITE_MS = 30000;

async function call(fn: string, args: Record<string, unknown>, timeoutMs: number): Promise<GymResult<unknown>> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await getSupabase().rpc(fn, args).abortSignal(ac.signal);
    if (res.error) return { ok: false, error: classifyRpcError(res.error, res.status) };
    return { ok: true, data: res.data };
  } catch (e) {
    // Not configured, or the fetch threw past the client (an abort is re-thrown by it).
    const err = e as { name?: string; message?: string } | undefined;
    if (err?.name === 'AbortError') return { ok: false, error: { kind: 'timeout' } };
    return { ok: false, error: classifyRpcError(err ?? {}, 0) };
  } finally {
    clearTimeout(timer);
  }
}

export async function apiJoin(code: string, name: string): Promise<GymResult<GymLink>> {
  const r = await call('member_join', { p_code: code, p_name: name }, WRITE_MS);
  if (!r.ok) return r;
  const link = linkFromJoin(r.data);
  return link ? { ok: true, data: link } : { ok: false, error: { kind: 'other' } };
}

export async function apiProducts(key: string): Promise<GymResult<Product[]>> {
  const r = await call('member_products', { p_key: key }, READ_MS);
  return r.ok ? { ok: true, data: productsFromRows(r.data) } : r;
}

export async function apiOrders(key: string): Promise<GymResult<GymOrder[]>> {
  const r = await call('member_orders', { p_key: key }, READ_MS);
  return r.ok ? { ok: true, data: ordersFromRows(r.data) } : r;
}

export async function apiPlaceOrder(key: string, lines: { productId: string; optionId: string | null; qty: number }[]): Promise<GymResult<GymOrder>> {
  const r = await call('member_place_order', { p_key: key, p_lines: lines }, WRITE_MS);
  if (!r.ok) return r;
  // A function returning one row comes back as that row (PostgREST); be lenient with a 1-row array.
  const order = orderFromRow(Array.isArray(r.data) ? r.data[0] : r.data);
  return order ? { ok: true, data: order } : { ok: false, error: { kind: 'other' } };
}

export async function apiCancelOrder(key: string, orderId: string): Promise<GymResult<GymOrder>> {
  const r = await call('member_cancel_order', { p_key: key, p_order: orderId }, WRITE_MS);
  if (!r.ok) return r;
  const order = orderFromRow(Array.isArray(r.data) ? r.data[0] : r.data);
  return order ? { ok: true, data: order } : { ok: false, error: { kind: 'other' } };
}

/** Stop the key working on the server. Best-effort and short: Leave and Erase never wait on it. */
export async function apiLeaveQuietly(key: string): Promise<void> {
  await call('member_leave', { p_key: key }, 6000).catch(() => undefined);
}
