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
import { autoAnswerFromRow, type AutoRemindersAnswer } from './autoReminders';
import { checkInFromRow, type CheckInAnswer } from './checkIn';
import { gymPlansFromRow, type GymPlansAnswer } from './gymPlans';
import { gymDietsFromRow, gymMeasuresFromRow, type GymDietsAnswer, type GymMeasuresAnswer } from './gymBody';
import { gymHoursFromRow } from './gymTimings';
import { busyFromRow, type GymBusy } from './gymBusy';
import { boardFromRow, type Board, type BoardDay } from './leaderboard';
import { mateBoardFrom, mateProfileFrom, type MateBoard, type MateProfile, type MateShare } from './mateProfile';
import type { GymHours } from '@forgeai/theme';
import { membershipFromRow, type MembershipAnswer } from './membership';
import { inboxFromRows, type InboxMessage } from './inbox';
import { offerErrorOf, offersFromRow, type OffersAnswer } from './offer';
import { askAnswerFromRow, planRequestsFromRow, type PlanRequest, type PlanRequestsAnswer } from './planRequest';
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

type CallResult = GymResult<unknown> & { noSuchFunction?: boolean; message?: string };

async function call(fn: string, args: Record<string, unknown>, timeoutMs: number): Promise<CallResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await getSupabase().rpc(fn, args).abortSignal(ac.signal);
    if (res.error) {
      const noSuchFunction = (res.error as { code?: unknown }).code === NO_SUCH_FUNCTION;
      const message = (res.error as { message?: unknown }).message;
      return { ok: false, error: classifyRpcError(res.error, res.status), ...(noSuchFunction ? { noSuchFunction } : {}), ...(typeof message === 'string' ? { message } : {}) };
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
 * "My membership" (member_membership, 0023). `missing`: the server has not had 0023 yet, so the
 * app simply shows nothing (the card stays hidden) until it has.
 */
export async function apiMembership(key: string): Promise<GymResult<MembershipAnswer> | { ok: false; missing: true }> {
  const r = await call('member_membership', { p_key: key }, READ_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : r;
  const answer = membershipFromRow(r.data);
  return answer ? { ok: true, data: answer } : { ok: false, error: { kind: 'other' } };
}

/**
 * Automatic reminders (member_auto_reminders, 0029, R-86): the owner's switches and the member's
 * birthday (MM-DD), joining day and last check-in day. `missing`: the server has not had 0029 yet,
 * so the phone uses the built-in defaults.
 */
export async function apiAutoReminders(key: string): Promise<GymResult<AutoRemindersAnswer> | { ok: false; missing: true }> {
  const r = await call('member_auto_reminders', { p_key: key }, READ_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : r;
  const answer = autoAnswerFromRow(r.data);
  return answer ? { ok: true, data: answer } : { ok: false, error: { kind: 'other' } };
}

/**
 * Workout plans the gym sent (member_gym_plans, 0024). `missing`: the server has not had 0024 yet —
 * nothing happens until it has.
 */
export async function apiGymPlans(key: string): Promise<GymResult<GymPlansAnswer> | { ok: false; missing: true }> {
  const r = await call('member_gym_plans', { p_key: key }, READ_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : r;
  const answer = gymPlansFromRow(r.data);
  return answer ? { ok: true, data: answer } : { ok: false, error: { kind: 'other' } };
}

/**
 * Measurements the gym's trainer took (member_measurements, 0035, R-120). `missing`: the server has
 * not had 0035 yet; nothing happens until it has.
 */
export async function apiGymMeasures(key: string): Promise<GymResult<GymMeasuresAnswer> | { ok: false; missing: true }> {
  const r = await call('member_measurements', { p_key: key }, READ_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : r;
  const answer = gymMeasuresFromRow(r.data);
  return answer ? { ok: true, data: answer } : { ok: false, error: { kind: 'other' } };
}

/** Diet plans the gym sent (member_diet_plans, 0035, R-120). `missing`: the server has not had 0035 yet. */
export async function apiGymDiets(key: string): Promise<GymResult<GymDietsAnswer> | { ok: false; missing: true }> {
  const r = await call('member_diet_plans', { p_key: key }, READ_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : r;
  const answer = gymDietsFromRow(r.data);
  return answer ? { ok: true, data: answer } : { ok: false, error: { kind: 'other' } };
}

/**
 * The gym's opening hours (member_gym_timings, 0036, R-124). `missing`: the server has not had 0036
 * yet; nothing shows until it has.
 */
export async function apiGymTimings(key: string): Promise<GymResult<{ gymId: string; gymName: string; hours: GymHours | null }> | { ok: false; missing: true }> {
  const r = await call('member_gym_timings', { p_key: key }, READ_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : r;
  const answer = gymHoursFromRow(r.data);
  return answer ? { ok: true, data: answer } : { ok: false, error: { kind: 'other' } };
}

/**
 * The gym leaderboard (member_board, 0037, R-133). `missing`: the server has not had 0037 yet; no
 * card shows until it has.
 */
export async function apiBoard(key: string): Promise<GymResult<Board> | { ok: false; missing: true }> {
  const r = await call('member_board', { p_key: key }, READ_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : r;
  const answer = boardFromRow(r.data);
  return answer ? { ok: true, data: answer } : { ok: false, error: { kind: 'other' } };
}

/**
 * How busy the gym is now and at each hour (member_gym_busy, 0039, R-163). data null: the gym has too
 * few check-ins yet (or the answer is not one): no card. `missing`: the server has not had 0039 yet.
 */
export async function apiGymBusy(key: string): Promise<GymResult<GymBusy | null> | { ok: false; missing: true }> {
  const r = await call('member_gym_busy', { p_key: key }, READ_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : r;
  return { ok: true, data: busyFromRow(r.data) };
}

/**
 * Send this phone's day totals (member_board_push, 0037): per day only the number of workouts and
 * the kg, and the member's name switch. `missing`: the server has not had 0037 yet.
 */
export async function apiBoardPush(key: string, days: readonly BoardDay[], showName: boolean): Promise<GymResult<true> | { ok: false; missing: true }> {
  const r = await call('member_board_push', { p_key: key, p_days: days, p_show_name: showName }, WRITE_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : r;
  const data = Array.isArray(r.data) ? r.data[0] : r.data;
  return (data as { ok?: unknown } | null)?.ok === true ? { ok: true, data: true } : { ok: false, error: { kind: 'other' } };
}

// ------------------------------------------------------------------ pause / renew requests (0044, F150)

export type PlanRequestCall<T> = { ok: true; data: T } | { ok: false; missing: true } | { ok: false; refused: string } | { ok: false; error: GymError };

/**
 * The member's pause / renew requests and the plans they may renew on (member_plan_requests).
 * `missing`: the server has not had 0044 yet, so the two buttons stay hidden.
 */
export async function apiPlanRequests(key: string): Promise<PlanRequestCall<PlanRequestsAnswer>> {
  const r = await call('member_plan_requests', { p_key: key }, READ_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : { ok: false, error: r.error };
  const answer = planRequestsFromRow(r.data);
  return answer ? { ok: true, data: answer } : { ok: false, error: { kind: 'other' } };
}

/** Ask the desk to pause (from..to) or renew (on a plan) (member_ask_plan_change). */
export async function apiAskPlanChange(
  key: string,
  ask: { kind: 'freeze'; from: string; to: string } | { kind: 'renew'; planId: string },
): Promise<PlanRequestCall<PlanRequest>> {
  const args = ask.kind === 'freeze'
    ? { p_key: key, p_kind: 'freeze', p_from: ask.from, p_to: ask.to, p_plan: null }
    : { p_key: key, p_kind: 'renew', p_from: null, p_to: null, p_plan: ask.planId };
  const r = await call('member_ask_plan_change', args, WRITE_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : { ok: false, error: r.error };
  const answer = askAnswerFromRow(r.data);
  if (!answer) return { ok: false, error: { kind: 'other' } };
  return answer.ok ? { ok: true, data: answer.request } : { ok: false, refused: answer.refused };
}

/** Take back a request the desk has not answered yet (member_cancel_plan_request). True when it was. */
export async function apiCancelPlanRequest(key: string, requestId: string): Promise<PlanRequestCall<boolean>> {
  const r = await call('member_cancel_plan_request', { p_key: key, p_request: requestId }, WRITE_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : { ok: false, error: r.error };
  const data = Array.isArray(r.data) ? r.data[0] : r.data;
  return { ok: true, data: (data as { cancelled?: unknown } | null)?.cancelled === true };
}

/** Tell the gym the member has read these answers, so they stop showing (member_saw_plan_requests). */
export async function apiSawPlanRequests(key: string, ids: string[]): Promise<PlanRequestCall<number>> {
  const r = await call('member_saw_plan_requests', { p_key: key, p_ids: ids }, READ_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : { ok: false, error: r.error };
  return { ok: true, data: Number(r.data) || 0 };
}

// ------------------------------------------------------------------ gym mate profiles (0040, R-164)

export type MateCall<T> = { ok: true; data: T } | { ok: false; missing: true } | { ok: false; notShared: true } | { ok: false; error: GymError };

/** Share this member's bio and recent workouts (member_mate_share). `missing`: 0040 is not live yet. */
export async function apiMateShare(key: string, share: MateShare): Promise<MateCall<true>> {
  const r = await call('member_mate_share', { p_key: key, p_profile: share }, WRITE_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : { ok: false, error: r.error };
  const data = Array.isArray(r.data) ? r.data[0] : r.data;
  return (data as { ok?: unknown } | null)?.ok === true ? { ok: true, data: true } : { ok: false, error: { kind: 'other' } };
}

/** Delete everything this member shared (member_mate_stop). */
export async function apiMateStop(key: string): Promise<MateCall<true>> {
  const r = await call('member_mate_stop', { p_key: key }, WRITE_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : { ok: false, error: r.error };
  return { ok: true, data: true };
}

/** Which leaderboard rows open a profile (member_mate_board). */
export async function apiMateBoard(key: string): Promise<MateCall<MateBoard>> {
  const r = await call('member_mate_board', { p_key: key }, READ_MS);
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : { ok: false, error: r.error };
  const answer = mateBoardFrom(r.data);
  return answer ? { ok: true, data: answer } : { ok: false, error: { kind: 'other' } };
}

/** A gym mate's shared profile (member_mate_profile). `notShared`: they stopped sharing, hid their name, or left. */
export async function apiMateProfile(key: string, profile: string): Promise<MateCall<MateProfile>> {
  const r = await call('member_mate_profile', { p_key: key, p_profile: profile }, READ_MS);
  if (!r.ok) {
    if (r.noSuchFunction) return { ok: false, missing: true };
    if (r.message?.trim() === 'NOT_SHARED') return { ok: false, notShared: true };
    return { ok: false, error: r.error };
  }
  const answer = mateProfileFrom(r.data);
  return answer ? { ok: true, data: answer } : { ok: false, error: { kind: 'other' } };
}

// ------------------------------------------------------------------ the workout offer (0025)

/**
 * An answer from the workout offer's functions. `missing`: the server has not had 0025 yet, so the
 * offer card simply does not appear. `refused`: the gym said no ({error: 'NO_PLAN'} and the like).
 */
export type OfferResult = { ok: true; data: OffersAnswer } | { ok: false; missing: true } | { ok: false; refused: string } | { ok: false; error: GymError };

function offerResult(r: CallResult): OfferResult {
  if (!r.ok) return r.noSuchFunction ? { ok: false, missing: true } : { ok: false, error: r.error };
  const answer = offersFromRow(r.data);
  if (answer) return { ok: true, data: answer };
  const code = offerErrorOf(r.data);
  return code ? { ok: false, refused: code } : { ok: false, error: { kind: 'other' } };
}

/** The gym's workout offer for this member (member_offers). */
export async function apiOffers(key: string): Promise<OfferResult> {
  return offerResult(await call('member_offers', { p_key: key }, READ_MS));
}

/** "Join the offer", with the version of the consent words the member saw (member_join_offer). */
export async function apiJoinOffer(key: string, offerId: string, notice: string): Promise<OfferResult> {
  return offerResult(await call('member_join_offer', { p_key: key, p_offer: offerId, p_notice: notice }, WRITE_MS));
}

/** The DATES of counted workouts, nothing else (member_offer_days). The gym checks each against its register. */
export async function apiOfferDays(key: string, offerId: string, days: string[]): Promise<OfferResult> {
  return offerResult(await call('member_offer_days', { p_key: key, p_offer: offerId, p_days: days }, WRITE_MS));
}

/** "Leave the offer" (member_leave_offer): the gym deletes the dates. True when the gym confirmed. */
export async function apiLeaveOffer(key: string, offerId: string): Promise<{ ok: true } | { ok: false; missing?: true; error?: GymError }> {
  const r = await call('member_leave_offer', { p_key: key, p_offer: offerId }, WRITE_MS);
  if (r.ok) return { ok: true };
  return r.noSuchFunction ? { ok: false, missing: true } : { ok: false, error: r.error };
}

/**
 * Stop the key working on the server (member_leave also clears the member's numbers). Short, so
 * Leave and Erase never hang. True when the gym confirmed, or no longer knows the key (an earlier
 * leave whose answer was lost); false when it could not be reached — pendingLeave.ts sends it again.
 */
export async function apiLeaveQuietly(key: string, timeoutMs = 6000): Promise<boolean> {
  const r = await call('member_leave', { p_key: key }, timeoutMs);
  return r.ok || r.error.kind === 'BAD_KEY';
}

/**
 * R-153 step 2: this phone's push address (Firebase), so the gym's messages and offers pop up at
 * once (member_save_push_token / member_clear_push_token, 0038). `missing`: the server has not had
 * 0038 yet (the phone's own 15-minute check still works); the app tries again on a later start.
 */
export type PushTokenResult = { ok: true } | { ok: false; missing?: true; error?: GymError };

export async function apiSavePushToken(key: string, token: string, platform: 'android' | 'ios' = 'android'): Promise<PushTokenResult> {
  const r = await call('member_save_push_token', { p_key: key, p_token: token, p_platform: platform }, WRITE_MS);
  if (r.ok) return { ok: true };
  return r.noSuchFunction ? { ok: false, missing: true } : { ok: false, error: r.error };
}

/** Forget this phone's push address (the switch went off, or the phone's notifications did). */
export async function apiClearPushToken(key: string, token: string): Promise<PushTokenResult> {
  const r = await call('member_clear_push_token', { p_key: key, p_token: token }, WRITE_MS);
  if (r.ok) return { ok: true };
  return r.noSuchFunction ? { ok: false, missing: true } : { ok: false, error: r.error };
}
