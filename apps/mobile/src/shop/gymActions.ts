/**
 * The gym's real shop (S2): what each button does — call the server (gymApi.ts), keep the answer
 * on the phone (gymStore.ts), and hand the screen its words (gym.ts). A key the gym no longer
 * knows (BAD_KEY: the member left on another phone, or the gym removed them) unlinks this phone
 * and the join card says why.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { uuid } from '@/lib/uuid';
import { prefetchGymLogo } from '@/theme/logoPrefetch';

import { apiCancelOrder, apiCheckIn, apiJoin, apiMe, apiPreview, apiMessages, apiOrders, apiPlaceOrder, apiProducts, apiSawMessages } from './gymApi';
import { useGymInbox } from './inboxStore';
import { leaveOnServer, leavePendingText, retryPendingLeaves } from './pendingLeave';
import {
  JOIN_CODE_LENGTH,
  UNLINKED_TEXT,
  cancelErrorText,
  cleanJoinCode,
  cleanMemberName,
  findLandedOrder,
  gymCheckDue,
  JOIN_TRY_STORAGE_KEY,
  joinErrorText,
  joinIdFor,
  onlyLeftText,
  orderLinesFor,
  orderIdFor,
  orderLinesKey,
  orderPlacedText,
  pendingOrderSettled,
  placeFailure,
  refreshErrorText,
  stockLeftForKey,
  type GymError,
} from './gym';
import type { CheckInAnswer } from './checkIn';
import { useGymShop } from './gymStore';
import { priceBag, removeLine } from './money';
import type { GymOrder } from './types';

/** null = done; otherwise the words to show. */
export type ActionWords = string | null;

/**
 * Counts this phone's own order writes (place, cancel). A list that was asked for before a write
 * and arrives after it is older than what the phone already shows — dropped, or a cancelled
 * order would flick back to "Ordered" until the next 10 s refresh.
 */
let orderWrites = 0;

function lostKey(err: GymError): boolean {
  if (err.kind !== 'BAD_KEY') return false;
  useGymShop.getState().unlink(UNLINKED_TEXT);
  // C6-15: the gym's messages go with the link (they were kept, hidden, on the phone).
  useGymInbox.getState().clear();
  return true;
}

/**
 * Audit C6-6: this phone's id for the join it is trying (member_join's p_join_id, 0020). A retry
 * of the same code after a lost answer sends the same id, so the gym gives back the member it
 * already made (with a new key) instead of a second one on its list. Kept on the phone for 15
 * minutes (an app closed between the two taps still sends it), forgotten once joined.
 */
async function joinIdNow(code: string): Promise<string> {
  let kept: unknown = null;
  try {
    const raw = await AsyncStorage.getItem(JOIN_TRY_STORAGE_KEY);
    kept = raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[ForgeErr] join: could not read the kept join id', e);
  }
  const next = joinIdFor(kept, code, Date.now(), uuid);
  try {
    await AsyncStorage.setItem(JOIN_TRY_STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[ForgeErr] join: could not keep the join id', e);
  }
  return next.id;
}

async function forgetJoinId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(JOIN_TRY_STORAGE_KEY);
  } catch (e) {
    console.warn('[ForgeErr] join: could not forget the join id', e);
  }
}

export async function joinGym(rawCode: string, rawName: string): Promise<ActionWords> {
  const code = cleanJoinCode(rawCode);
  const name = cleanMemberName(rawName);
  if (code.length !== JOIN_CODE_LENGTH) return `The code has ${JOIN_CODE_LENGTH} letters and numbers. Check it with the front desk.`;
  if (!name) return joinErrorText({ kind: 'EMPTY' });
  const r = await apiJoin(code, name, await joinIdNow(code));
  if (!r.ok) return joinErrorText(r.error);
  await forgetJoinId();
  // The logo starts downloading now, while the opening is still being laid out (D13).
  prefetchGymLogo(r.data.brand?.logoUrl);
  // The shop page that replaces this card fetches the list as it opens.
  useGymShop.getState().setLink(r.data);
  return null;
}

/** What a typed code is, before joining with it (C6-11). */
export type TypedCodeCheck = { kind: 'gym'; gymName: string } | { kind: 'words'; words: string } | { kind: 'ask-failed' };

/**
 * Audit C6-11: a typed code names its gym first (gym_preview), so a one-letter slip that hits
 * another gym's code is caught before the member's name goes to a stranger's desk. When the gym
 * cannot be asked, the join itself is tried — it says why if it fails too.
 */
export async function checkTypedCode(rawCode: string, rawName?: string): Promise<TypedCodeCheck> {
  const code = cleanJoinCode(rawCode);
  if (code.length !== JOIN_CODE_LENGTH) return { kind: 'words', words: `The code has ${JOIN_CODE_LENGTH} letters and numbers. Check it with the front desk.` };
  if (rawName !== undefined && !cleanMemberName(rawName)) return { kind: 'words', words: joinErrorText({ kind: 'EMPTY' }) };
  const r = await apiPreview(code);
  if (!r.ok) return { kind: 'ask-failed' };
  if (!r.data) return { kind: 'words', words: joinErrorText({ kind: 'INVALID_CODE' }) };
  return { kind: 'gym', gymName: r.data.gymName };
}

/**
 * Invite link: join the gym the link names. A phone already in ANOTHER gym joins the new one
 * first and only then lets the old key go — a failed join (offline, wrong code) leaves the member
 * exactly where they were, never in no gym at all.
 */
export async function joinFromInvite(rawCode: string, rawName: string): Promise<ActionWords> {
  const oldKey = useGymShop.getState().link?.memberKey ?? null;
  const words = await joinGym(rawCode, rawName);
  if (words) return words;
  // Not waited for: the new gym is already on screen, and the leave call can take its full timeout.
  // Kept and sent again until the old gym confirms (C6-2).
  if (oldKey && oldKey !== useGymShop.getState().link?.memberKey) void leaveOnServer(oldKey);
  return null;
}

/** What a check-in came to: the server's answer, a key the gym no longer knows, or no answer. */
export type CheckInOutcome =
  | { kind: 'answer'; answer: CheckInAnswer }
  | { kind: 'unlinked' }
  | { kind: 'not-joined' }
  | { kind: 'failed'; error: GymError };

/**
 * QR self check-in: check this phone's member in at the gym the poster names (member_check_in).
 * `phone` is sent only when the member just typed it. A key the gym no longer knows unlinks the
 * phone, as every other call does.
 */
export async function checkInAtGym(code: string, phone: string | null): Promise<CheckInOutcome> {
  const key = useGymShop.getState().link?.memberKey;
  if (!key) return { kind: 'not-joined' };
  const r = await apiCheckIn(key, cleanJoinCode(code), phone);
  if (r.ok) return { kind: 'answer', answer: r.data };
  if (lostKey(r.error)) return { kind: 'unlinked' };
  return { kind: 'failed', error: r.error };
}

/** When member_me was last asked (epoch ms), for the once-an-hour check on return to the app. */
let gymCheckedAt: number | null = null;

/**
 * Gym branding: ask the gym for its name and look as they are now (member_me), on launch, when
 * the Shop opens, and on return to the app at most about once an hour (`refreshGymIfDue`). A
 * changed brand is kept on the phone; the theme decides when to show it (theme/gymTheme.ts — at
 * once while the gym's logo is on screen, else the next time the app comes back with no workout
 * open). Quiet: no words for the member, a failure just keeps what the phone has.
 */
export async function refreshGymNow(): Promise<void> {
  try {
    await checkGymNow();
  } finally {
    // C6-2: a Leave or Erase the gym never heard (no signal then) is sent again on every start —
    // after the gym check and in the background, so start-up never waits on it.
    void retryPendingLeaves().catch((e: unknown) => console.warn('[ForgeErr] pending leave retry', e));
  }
}

async function checkGymNow(): Promise<void> {
  const key = useGymShop.getState().link?.memberKey;
  if (!key) return;
  gymCheckedAt = Date.now();
  const r = await apiMe(key);
  if (useGymShop.getState().link?.memberKey !== key) return;
  if (!r.ok) {
    lostKey(r.error);
    return;
  }
  // A new logo is in the cache before the opening that will show it (D13).
  prefetchGymLogo(r.data.brand?.logoUrl);
  useGymShop.getState().setGymNow(r.data);
  // Gym messages: the bell's count is fresh whenever the gym was asked anyway (launch, hourly).
  void refreshInbox().catch(() => undefined);
}

/**
 * Gym messages: the inbox from the gym (member_messages), and any "seen" the server missed sent
 * again. Returns words when it failed (the last list stays on screen), else null.
 */
export async function refreshInbox(): Promise<ActionWords> {
  const link = useGymShop.getState().link;
  if (!link) return null;
  const r = await apiMessages(link.memberKey);
  if (useGymShop.getState().link?.memberKey !== link.memberKey) return null;
  if (!r.ok) {
    if (lostKey(r.error)) return null;
    return r.error.kind === 'offline' ? "No internet — showing the last messages." : "Couldn't refresh — showing the last messages.";
  }
  useGymInbox.getState().setList(link.memberId, r.data);
  const unsent = useGymInbox.getState().unsent;
  if (unsent.length > 0) await sendSeen(link.memberKey, unsent);
  return null;
}

/** The inbox showed these messages: seen here at once, and the gym is told (again later if offline). */
export async function markInboxSeen(ids: string[]): Promise<void> {
  const link = useGymShop.getState().link;
  if (!link || ids.length === 0) return;
  useGymInbox.getState().markSeen(link.memberId, ids);
  await sendSeen(link.memberKey, useGymInbox.getState().unsent);
}

async function sendSeen(key: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = ids.slice(0, 100);
  const r = await apiSawMessages(key, batch);
  if (r.ok) useGymInbox.getState().confirmSeen(batch);
}

/** The app came back to the foreground: ask the gym again if the last ask is an hour old. */
export async function refreshGymIfDue(now: number = Date.now()): Promise<void> {
  if (!gymCheckDue(gymCheckedAt, now)) return;
  await refreshGymNow();
}

/** Fetch the gym's list. Returns words when it failed (with or without a cached list), else null. */
export async function refreshProducts(): Promise<ActionWords> {
  const key = useGymShop.getState().link?.memberKey;
  if (!key) return null;
  const r = await apiProducts(key);
  // The member left (or joined another gym) while this was on its way: drop the answer.
  if (useGymShop.getState().link?.memberKey !== key) return null;
  if (!r.ok) {
    if (lostKey(r.error)) return null;
    return refreshErrorText(r.error, useGymShop.getState().productsAt != null);
  }
  useGymShop.getState().setProducts(r.data, new Date().toISOString());
  return null;
}

export async function refreshOrders(): Promise<ActionWords> {
  const key = useGymShop.getState().link?.memberKey;
  if (!key) return null;
  const writesBefore = orderWrites;
  const r = await apiOrders(key);
  if (useGymShop.getState().link?.memberKey !== key) return null;
  if (r.ok && writesBefore !== orderWrites) return null;
  if (!r.ok) {
    if (lostKey(r.error)) return null;
    return "Couldn't refresh — showing the last list.";
  }
  useGymShop.getState().setOrders(r.data);
  // The order a kept id made is on the list: the id is done (a later same bag is a new order).
  const kept = useGymShop.getState().pendingOrder;
  if (pendingOrderSettled(kept, r.data)) useGymShop.getState().setPendingOrder(null);
  return null;
}

export type PlaceOutcome = { ok: true; order: GymOrder } | { ok: false; message: string };

/** Send the bag as an order. On success the ordered lines leave the bag and My orders opens with the flash line. */
export async function placeGymOrder(): Promise<PlaceOutcome> {
  const s = useGymShop.getState();
  const key = s.link?.memberKey;
  if (!key) return { ok: false, message: UNLINKED_TEXT };
  const lines = orderLinesFor(s.bag, s.products);
  if (lines.length === 0) return { ok: false, message: 'Your bag has nothing that can be ordered right now.' };
  const idsBefore = s.orders.map((o) => o.id);
  // C6-3: the total the bag showed at the tap, to say so when the gym charged another.
  const shownTotalP = priceBag(s.bag, s.products).totalP;
  // Audit C6-1: the same bag sent again keeps its id, so a retry after a lost answer gets the
  // order the gym already wrote (0020). A changed bag is a new order with a new id.
  const linesKey = orderLinesKey(lines);
  const pending = orderIdFor(s.pendingOrder, linesKey, Date.now(), uuid);
  s.setPendingOrder(pending);
  orderWrites += 1;
  let r = await apiPlaceOrder(key, lines, pending.id);
  orderWrites += 1;
  if (!r.ok && (r.error.kind === 'timeout' || r.error.kind === 'offline')) {
    // The app stopped waiting, or the answer was lost on the way back ("Network request failed"
    // after the gym wrote it): look before saying it failed, so a second tap never makes a
    // second order (a server before 0020 has no order id to catch it).
    const check = await apiOrders(key);
    const landed = check.ok ? findLandedOrder(idsBefore, check.data, lines) : null;
    if (landed) r = { ok: true, data: landed };
  }
  if (!r.ok) {
    if (lostKey(r.error)) return { ok: false, message: UNLINKED_TEXT };
    const now = useGymShop.getState();
    const f = placeFailure(r.error, now.bag, now.products);
    if (f.refresh) await refreshProducts();
    if (f.removeKey) {
      // Fetch first, then decide: "sold out" can mean "fewer left than you asked for".
      const fresh = useGymShop.getState();
      const left = stockLeftForKey(fresh.bag, fresh.products, f.removeKey);
      if (left > 0) return { ok: false, message: onlyLeftText(r.error.name || 'this', left) };
      fresh.setBag(removeLine(fresh.bag, f.removeKey));
    }
    return { ok: false, message: f.message };
  }
  const after = useGymShop.getState();
  if (after.pendingOrder?.id === pending.id) after.setPendingOrder(null);
  // Take out exactly what was sent (a line added on another page meanwhile stays).
  const sent = new Set(lines.map((l) => `${l.productId}::${l.optionId ?? ''}`));
  after.setBag(after.bag.filter((l) => !sent.has(`${l.productId}::${l.optionId ?? ''}`)));
  after.putOrder(r.data);
  after.setFlash({ orderId: r.data.id, text: orderPlacedText(r.data.orderNo, r.data.totalP !== shownTotalP ? r.data.totalP : null) });
  void refreshProducts();
  return { ok: true, order: r.data };
}

export async function cancelGymOrder(orderId: string): Promise<ActionWords> {
  const key = useGymShop.getState().link?.memberKey;
  if (!key) return UNLINKED_TEXT;
  orderWrites += 1;
  const r = await apiCancelOrder(key, orderId);
  orderWrites += 1;
  if (!r.ok) {
    if (lostKey(r.error)) return UNLINKED_TEXT;
    void refreshOrders();
    return cancelErrorText(r.error);
  }
  useGymShop.getState().putOrder(r.data);
  void refreshProducts();
  return null;
}

/**
 * Leave the gym's shop on this phone: forget it at once, then tell the server. When the gym cannot
 * be reached, the key is kept and sent again on the next start, and the join card says so (C6-2).
 */
export async function leaveGym(): Promise<void> {
  const link = useGymShop.getState().link;
  useGymShop.getState().unlink(null);
  useGymInbox.getState().clear();
  if (!link) return;
  const told = await leaveOnServer(link.memberKey);
  // A join in the meantime owns the card now: its words win.
  if (!told && !useGymShop.getState().link) useGymShop.getState().setNotice(leavePendingText(link.gymName));
}
