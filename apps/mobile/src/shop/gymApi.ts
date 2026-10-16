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

import { classifyRpcError, gymNowFromMe, linkFromJoin, orderFromRow, ordersFromRows, previewFromRow, productsFromRows, type GymError, type GymNow, type GymPreview } from './gym';
import { checkInFromRow, type CheckInAnswer } from './checkIn';
import { inboxFromRows, type InboxMessage } from './inbox';
import type { GymLink, GymOrder, Product } from './types';

export type GymResult<T> = { ok: true; data: T } | { ok: false; error: GymError };

/** How long a call may take before the app stops waiting (ms). An order gets longer: it writes. */
const READ_MS = 15000;
const WRITE_MS = 30000;

/**
 * PostgREST's "no function with these argument names". A server the newest migration has not
 * reached yet answers this to an argument it does not know (audit C6-1, C6-6: 0020's ids).
 */
const NO_SUCH_FUNCTION = 'PGRST202';

type CallResult = GymResult<unknown> & { noSuchFunction?: boolean };

async function call(fn: string, args: Record<string, unknown>, timeoutMs: number): Promise<CallResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await getSupabase().rpc(fn, args).abortSignal(ac.signal);
    if (res.error) {
      const noSuchFunction = (res.error as { code?: unknown }).code === NO_SUCH_FUNCTION;
      return { ok: false, error: classifyRpcError(res.error, res.status), ...(noSuchFunction ? { noSuchFunction } : {}) };
    }
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

/**
 * A call with an argument only newer servers know (`extra`): when the server has not had that
 * migration yet, the same call is made again without it, so this app works before and after.
 */
async function callWithNewer(fn: string, args: Record<string, unknown>, extra: Record<string, unknown>, timeoutMs: number): Promise<CallResult> {
  const r = await call(fn, { ...args, ...extra }, timeoutMs);
  if (r.ok || !r.noSuchFunction) return r;
  return call(fn, args, timeoutMs);
}

/** Join a gym. `joinId` (audit C6-6): the same id again within a day is the same member (0020). */
export async function apiJoin(code: string, name: string, joinId?: string): Promise<GymResult<GymLink>> {
  const base = { p_code: code, p_name: name };
  const r = joinId ? await callWithNewer('member_join', base, { p_join_id: joinId }, WRITE_MS) : await call('member_join', base, WRITE_MS);
  if (!r.ok) return r;
  const link = linkFromJoin(r.data);
  return link ? { ok: true, data: link } : { ok: false, error: { kind: 'other' } };
}

/** The gym's messages for this member (member_messages, 0008), newest first. */
export async function apiMessages(key: string): Promise<GymResult<InboxMessage[]>> {
  const r = await call('member_messages', { p_key: key }, READ_MS);
  return r.ok ? { ok: true, data: inboxFromRows(r.data) } : r;
}

/** Tell the gym these messages were shown (member_saw_messages, 0008). */
export async function apiSawMessages(key: string, ids: string[]): Promise<GymResult<number>> {
  const r = await call('member_saw_messages', { p_key: key, p_ids: ids }, READ_MS);
  return r.ok ? { ok: true, data: Number(r.data) || 0 } : r;
}

/** What a join code is, before joining (gym_preview, 0007): null data = no gym has that code. */
export async function apiPreview(code: string): Promise<GymResult<GymPreview | null>> {
  const r = await call('gym_preview', { p_code: code }, READ_MS);
  return r.ok ? { ok: true, data: previewFromRow(r.data) } : r;
}

/** The gym as it is now (name, brand) — member_me. Also tells the gym this phone is still in use. */
export async function apiMe(key: string): Promise<GymResult<GymNow>> {
  const r = await call('member_me', { p_key: key }, READ_MS);
  if (!r.ok) return r;
  const now = gymNowFromMe(Array.isArray(r.data) ? r.data[0] : r.data);
  return now ? { ok: true, data: now } : { ok: false, error: { kind: 'other' } };
}

export async function apiProducts(key: string): Promise<GymResult<Product[]>> {
  const r = await call('member_products', { p_key: key }, READ_MS);
  return r.ok ? { ok: true, data: productsFromRows(r.data) } : r;
}

export async function apiOrders(key: string): Promise<GymResult<GymOrder[]>> {
  const r = await call('member_orders', { p_key: key }, READ_MS);
  return r.ok ? { ok: true, data: ordersFromRows(r.data) } : r;
}

/**
 * Place an order. `orderId` (audit C6-1) is this phone's own id for it: the gym keeps it once, so
 * sending the same id again returns that order instead of writing a second one (0020).
 */
export async function apiPlaceOrder(key: string, lines: { productId: string; optionId: string | null; qty: number }[], orderId?: string): Promise<GymResult<GymOrder>> {
  const base = { p_key: key, p_lines: lines };
  const r = orderId ? await callWithNewer('member_place_order', base, { p_order_id: orderId }, WRITE_MS) : await call('member_place_order', base, WRITE_MS);
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

/**
 * QR self check-in (member_check_in, 0015): this member at the gym whose code the poster carries.
 * `phone` only when the member just typed it (the server keeps it for next time).
 */
export async function apiCheckIn(key: string, code: string, phone: string | null): Promise<GymResult<CheckInAnswer>> {
  const r = await call('member_check_in', { p_key: key, p_code: code, p_phone: phone }, WRITE_MS);
  if (!r.ok) return r;
  const answer = checkInFromRow(r.data);
  return answer ? { ok: true, data: answer } : { ok: false, error: { kind: 'other' } };
}

/**
 * Stop the key working on the server (member_leave also clears the member's numbers). Short, so
 * Leave and Erase never hang. True when the gym confirmed, or no longer knows the key (an earlier
 * leave whose answer was lost); false when it could not be reached — pendingLeave.ts sends it again.
 */
export async function apiLeaveQuietly(key: string): Promise<boolean> {
  const r = await call('member_leave', { p_key: key }, 6000);
  return r.ok || r.error.kind === 'BAD_KEY';
}
