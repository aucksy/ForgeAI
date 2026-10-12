/**
 * The gym's real shop (S2): what each button does — call the server (gymApi.ts), keep the answer
 * on the phone (gymStore.ts), and hand the screen its words (gym.ts). A key the gym no longer
 * knows (BAD_KEY: the member left on another phone, or the gym removed them) unlinks this phone
 * and the join card says why.
 */
import { apiCancelOrder, apiJoin, apiLeaveQuietly, apiOrders, apiPlaceOrder, apiProducts } from './gymApi';
import {
  JOIN_CODE_LENGTH,
  UNLINKED_TEXT,
  cancelErrorText,
  cleanJoinCode,
  cleanMemberName,
  findLandedOrder,
  joinErrorText,
  onlyLeftText,
  orderLinesFor,
  orderPlacedText,
  placeFailure,
  refreshErrorText,
  stockLeftForKey,
  type GymError,
} from './gym';
import { useGymShop } from './gymStore';
import { removeLine } from './money';
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
  return true;
}

export async function joinGym(rawCode: string, rawName: string): Promise<ActionWords> {
  const code = cleanJoinCode(rawCode);
  const name = cleanMemberName(rawName);
  if (code.length !== JOIN_CODE_LENGTH) return `The code has ${JOIN_CODE_LENGTH} letters and numbers. Check it with the front desk.`;
  if (!name) return joinErrorText({ kind: 'EMPTY' });
  const r = await apiJoin(code, name);
  if (!r.ok) return joinErrorText(r.error);
  // The shop page that replaces this card fetches the list as it opens.
  useGymShop.getState().setLink(r.data);
  return null;
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
  orderWrites += 1;
  let r = await apiPlaceOrder(key, lines);
  orderWrites += 1;
  if (!r.ok && r.error.kind === 'timeout') {
    // The app stopped waiting, but the gym may have the order: look before saying it failed, so
    // a second tap never makes a second order.
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
  // Take out exactly what was sent (a line added on another page meanwhile stays).
  const sent = new Set(lines.map((l) => `${l.productId}::${l.optionId ?? ''}`));
  after.setBag(after.bag.filter((l) => !sent.has(`${l.productId}::${l.optionId ?? ''}`)));
  after.putOrder(r.data);
  after.setFlash({ orderId: r.data.id, text: orderPlacedText(r.data.orderNo) });
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

/** Leave the gym's shop on this phone: forget it at once, then tell the server (best-effort). */
export async function leaveGym(): Promise<void> {
  const key = useGymShop.getState().link?.memberKey;
  useGymShop.getState().unlink(null);
  if (key) await apiLeaveQuietly(key);
}
