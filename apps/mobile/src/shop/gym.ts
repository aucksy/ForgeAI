/**
 * The gym's real shop (S2) — the PURE half. Everything here is data in, data out, and
 * test/shop/gym.test.ts holds it: turning the server's rows (supabase/migrations/0002_shop.sql,
 * the `member_*` functions) into the app's own Product and order shapes, the words for every
 * error the server can raise, the join code's cleaning, the bag's check against the live list,
 * and the persisted blob's cleaning. No Supabase here (it is a native-backed client); the calls
 * live in gymApi.ts and the store in gymStore.ts.
 */
import { packOf, parseGymBrand, sameBrand, type GymBrand } from '@forgeai/theme';

import { SHOP_CATEGORIES } from './catalog';
import { lineKey, lineName, priceBag, rupees } from './money';
import { INVITE_HOSTS, inviteCodeFromUrl } from './pendingInvite';
import type { ArtKind, BagLine, GymLink, GymOrder, OrderLine, OrderStatus, Product, ProductOption, ShopCategory } from './types';

// ------------------------------------------------------------------ join code

/** Gym codes are 6 letters or digits (the server makes them from a uuid; FORGE1 for the test gym). */
export const JOIN_CODE_LENGTH = 6;

/** What the member typed, as a code: capitals, letters and digits only, at most 6. PURE. */
export function cleanJoinCode(raw: string): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, JOIN_CODE_LENGTH);
}

/**
 * What goes in the code box from what was typed or pasted (audit C6-5): the gym's invite link —
 * alone or inside the WhatsApp message it came in — gives its code; anything else is cleaned as a
 * typed code. PURE.
 */
export function joinCodeFromTyped(raw: string): string {
  const text = String(raw ?? '');
  let otherLink = false;
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const lower = word.toLowerCase();
    // The gym link as WhatsApp sometimes shows it: no https:// in front.
    const bare = INVITE_HOSTS.some((host) => lower.startsWith(host) || lower.startsWith(`www.${host}`));
    const code = inviteCodeFromUrl(bare ? `https://${word}` : word);
    if (code) return code;
    if (bare || /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i.test(word)) otherLink = true;
  }
  // Review of wave 4a: another link is not a code ("HTTPSE"): the box stays empty.
  return otherLink ? '' : cleanJoinCode(text);
}

/** Where a Join's id is kept on the phone for a retry (C6-6). */
export const JOIN_TRY_STORAGE_KEY = 'forgeai-gym-join-try';
/** How long a Join's id is kept for a retry (review of wave 4a): one sitting, not days. */
export const JOIN_TRY_MS = 15 * 60 * 1000;

/** A Join's id, as kept on the phone for a retry of the same code. */
export interface JoinTry {
  code: string;
  id: string;
  at: number;
}

/** The id to send for this code now: the kept one when it is the same code and fresh, else new. PURE. */
export function joinIdFor(kept: unknown, code: string, nowMs: number, newId: () => string): JoinTry {
  if (isObj(kept) && kept.code === code && typeof kept.id === 'string' && kept.id && typeof kept.at === 'number' && nowMs >= kept.at && nowMs - kept.at < JOIN_TRY_MS) {
    return { code, id: kept.id, at: kept.at };
  }
  return { code, id: newId(), at: nowMs };
}

/** The name sent with a join: spaces tidied, at most 60 characters (the server's own limit). PURE. */
export function cleanMemberName(raw: string): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

// ------------------------------------------------------------------ rows → app shapes

const ART_KINDS: readonly ArtKind[] = ['tub', 'jar', 'pouch', 'barbox', 'shaker', 'bottle', 'gloves', 'belt', 'wraps', 'band', 'towel', 'tshirt'];
const CATEGORY_IDS: readonly ShopCategory[] = SHOP_CATEGORIES.map((c) => c.id);
const HEX = /^#[0-9A-Fa-f]{6}$/;
const FALLBACK_TINT = '#E8661F';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v : null);
/** A whole number from a number or a numeric string (Postgres sends integers as numbers; be lenient). */
function int(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** One option from the product's `options` JSON; null when it is not usable. PURE. */
function optionFromJson(raw: unknown): ProductOption | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const label = str(raw.label);
  if (!id || !label) return null;
  const o: ProductOption = { id, label, stock: Math.max(0, int(raw.stock) ?? 0) };
  const price = int(raw.priceP);
  if (price != null && price > 0) o.priceP = price;
  const tint = str(raw.tint);
  if (tint && HEX.test(tint)) o.tint = tint;
  return o;
}

/**
 * A product photo link the app will load: https only, a real URL, no spaces, at most 400
 * characters (the server's own limit). Anything else is no photo (the drawing shows). PURE.
 */
export function photoUrlOf(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const url = v.trim();
  if (url.length < 9 || url.length > 400 || /\s/.test(url) || !/^https:\/\/[^/?#]+\.[^/?#]+\//i.test(url)) return undefined;
  return url;
}

/**
 * One `member_products` row as the app's Product (snake_case → the S1 shape): price_p → priceP,
 * option_name → optionName, options as they are, art_kind/art_tint → art, image_url → imageUrl
 * (https only). Null when the row is
 * not a product the Shop can show (no id, no name, no price). PURE.
 */
export function productFromRow(raw: unknown): Product | null {
  if (!isObj(raw)) return null;
  const id = str(raw.product_id);
  const name = str(raw.name);
  const priceP = int(raw.price_p);
  if (!id || !name || priceP == null || priceP <= 0) return null;
  const category = CATEGORY_IDS.includes(raw.category as ShopCategory) ? (raw.category as ShopCategory) : 'gear';
  const options = Array.isArray(raw.options) ? raw.options.map(optionFromJson).filter((o): o is ProductOption => o != null) : [];
  const seen = new Set<string>();
  const unique = options.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  const stock = unique.length > 0 ? unique.reduce((s, o) => s + o.stock, 0) : Math.max(0, int(raw.stock) ?? 0);
  const kind = ART_KINDS.includes(raw.art_kind as ArtKind) ? (raw.art_kind as ArtKind) : 'tub';
  const tint = typeof raw.art_tint === 'string' && HEX.test(raw.art_tint) ? raw.art_tint : FALLBACK_TINT;
  const optionName = str(raw.option_name);
  const imageUrl = photoUrlOf(raw.image_url);
  return {
    id,
    name: name.trim(),
    category,
    description: typeof raw.description === 'string' ? raw.description : '',
    priceP,
    ...(optionName && unique.length > 0 ? { optionName } : {}),
    options: unique,
    stock,
    active: raw.active !== false,
    art: { kind, tint },
    ...(imageUrl ? { imageUrl } : {}),
  };
}

/** Every usable row, in the server's order (it sorts by the gym's own `sort`); inactive ones out. PURE. */
export function productsFromRows(rows: unknown): Product[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(productFromRow).filter((p): p is Product => p != null && p.active);
}

const STATUSES: readonly OrderStatus[] = ['ordered', 'ready', 'collected', 'cancelled'];

function orderLineFromJson(raw: unknown): OrderLine | null {
  if (!isObj(raw)) return null;
  const name = str(raw.name);
  const qty = int(raw.qty);
  const unit = int(raw.unitPriceP);
  if (!name || qty == null || qty <= 0 || unit == null || unit < 0) return null;
  return {
    productId: typeof raw.productId === 'string' ? raw.productId : '',
    optionId: typeof raw.optionId === 'string' && raw.optionId !== '' ? raw.optionId : null,
    name,
    qty,
    unitPriceP: unit,
  };
}

/** One `member_orders` / `member_place_order` row as the app's GymOrder; null when unusable. PURE. */
export function orderFromRow(raw: unknown): GymOrder | null {
  if (!isObj(raw)) return null;
  const id = str(raw.order_id);
  const orderNo = int(raw.order_no);
  const totalP = int(raw.total_p);
  const createdAt = str(raw.created_at);
  if (!id || orderNo == null || totalP == null || !createdAt) return null;
  const status = STATUSES.includes(raw.status as OrderStatus) ? (raw.status as OrderStatus) : 'ordered';
  const by = raw.cancelled_by === 'member' || raw.cancelled_by === 'gym' ? raw.cancelled_by : null;
  const lines = Array.isArray(raw.lines) ? raw.lines.map(orderLineFromJson).filter((l): l is OrderLine => l != null) : [];
  const clientOrderId = str(raw.client_order_id);
  return {
    id,
    orderNo,
    createdAt,
    updatedAt: str(raw.updated_at) ?? createdAt,
    lines,
    totalP,
    status,
    cancelledBy: status === 'cancelled' ? by : null,
    ...(clientOrderId ? { clientOrderId } : {}),
  };
}

/** Every usable order row, newest first. PURE. */
export function ordersFromRows(rows: unknown): GymOrder[] {
  if (!Array.isArray(rows)) return [];
  return newestFirst(rows.map(orderFromRow).filter((o): o is GymOrder => o != null));
}

/** Put one order in the list (replacing the one with its id), newest first. PURE. */
export function upsertOrder(orders: readonly GymOrder[], order: GymOrder): GymOrder[] {
  return newestFirst([order, ...orders.filter((o) => o.id !== order.id)]);
}

function newestFirst(list: GymOrder[]): GymOrder[] {
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.orderNo - a.orderNo));
}

/** The join's answer as this phone's link; null when anything needed is missing. PURE. */
export function linkFromJoin(raw: unknown): GymLink | null {
  if (!isObj(raw)) return null;
  const memberKey = str(raw.memberKey);
  const memberId = str(raw.memberId);
  const gymId = str(raw.gymId);
  const gymName = str(raw.gymName);
  if (!memberKey || !memberId || !gymId || !gymName) return null;
  // Gym branding: the join's (and a saved link's) brand; an unbranded gym carries none.
  const brand = parseGymBrand(raw.brand);
  // T66: a saved link's pack (only a known word; anything else = not known = every feature on).
  const plan = packOf(raw.plan);
  return {
    memberKey,
    memberId,
    gymId,
    gymName: gymName.trim(),
    joinCode: typeof raw.joinCode === 'string' ? raw.joinCode : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    ...(brand ? { brand } : {}),
    ...(plan ? { plan } : {}),
  };
}

/**
 * T66: the link with the gym's pack as member_gym_pack (0046) says it now: the same link (same object)
 * when nothing changed; null (no pack) removes it. PURE.
 */
export function linkWithPack(link: GymLink, raw: unknown): GymLink {
  const plan = packOf(raw);
  if ((link.plan ?? null) === plan) return link;
  const next: GymLink = { ...link };
  if (plan) next.plan = plan;
  else delete next.plan;
  return next;
}

/** What member_me says about the gym now: its name and brand (the owner may have changed them). */
export interface GymNow {
  gymId: string;
  gymName: string;
  brand: GymBrand | null;
}

/** member_me's answer, read; null when anything needed is missing. PURE. */
export function gymNowFromMe(raw: unknown): GymNow | null {
  if (!isObj(raw)) return null;
  const gymId = str(raw.gymId);
  const gymName = str(raw.gymName);
  if (!gymId || !gymName) return null;
  return { gymId, gymName: gymName.trim(), brand: parseGymBrand(raw.brand) };
}

/**
 * The link with member_me's news applied: the same link (same object) when nothing changed, so
 * the store and the theme only move when the gym really changed its name or look. PURE.
 */
export function linkWithNow(link: GymLink, now: GymNow): GymLink {
  if (now.gymId !== link.gymId) return link;
  const brand = now.brand;
  if (now.gymName === link.gymName && sameBrand(link.brand ?? null, brand)) return link;
  const next: GymLink = { ...link, gymName: now.gymName };
  if (brand) next.brand = brand;
  else delete next.brand;
  return next;
}

// ------------------------------------------------------------------ errors → words

/**
 * What went wrong, as the app understands it. The server raises plain codes (`raise exception
 * 'SOLD_OUT:<name>'`), which reach the app as the error's message; a call that never reached
 * the server comes back with status 0 ("TypeError: Network request failed"), and one cut off by
 * the app's own timer says it was aborted.
 */
export type GymErrorKind = 'offline' | 'timeout' | 'INVALID_CODE' | 'EMPTY' | 'BUSY' | 'GONE' | 'SOLD_OUT' | 'BAD_KEY' | 'TOO_LATE' | 'TOO_MANY' | 'TOO_BIG' | 'SUSPENDED' | 'other';

export interface GymError {
  kind: GymErrorKind;
  /** SOLD_OUT only: the name the server gave ("Whey protein 1 kg · Strawberry"). */
  name?: string;
}

const CODES: readonly GymErrorKind[] = ['INVALID_CODE', 'EMPTY', 'BUSY', 'GONE', 'BAD_KEY', 'TOO_LATE', 'TOO_MANY', 'TOO_BIG', 'SUSPENDED'];

/**
 * ForgeAI HQ (#51, server migration 0027): ForgeAI paused the gym's account. The gym's records can be
 * read but nothing at the gym can change (orders, check-ins, offers). The member's own workouts live
 * on the phone and are untouched.
 */
export const GYM_PAUSED_TEXT = "Your gym's MettleUp account is paused. Your workouts are safe on this phone.";

/** Read an error from a Supabase call ({ message, hint }, plus the HTTP status). PURE. */
export function classifyRpcError(error: unknown, status?: number): GymError {
  const e = isObj(error) ? error : {};
  const message = typeof e.message === 'string' ? e.message.trim() : typeof error === 'string' ? error.trim() : '';
  const hint = typeof e.hint === 'string' ? e.hint : '';
  if (message.startsWith('SOLD_OUT:')) return { kind: 'SOLD_OUT', name: message.slice('SOLD_OUT:'.length).trim() };
  if (message === 'SOLD_OUT') return { kind: 'SOLD_OUT', name: '' };
  const code = CODES.find((c) => message === c);
  if (code) return { kind: code };
  if (/abort/i.test(message) || /abort/i.test(hint)) return { kind: 'timeout' };
  if (status === 0 || /network|fetch|failed to connect|internet|offline|timed? ?out/i.test(message)) return { kind: 'offline' };
  return { kind: 'other' };
}

const OFFLINE = "No internet. Try again when you're online.";
const SLOW = "The gym didn't answer. Try again in a moment.";

/** Words for a failed Join. PURE. */
export function joinErrorText(err: GymError): string {
  switch (err.kind) {
    case 'INVALID_CODE':
      return "That code didn't match a gym. Check it with the front desk.";
    case 'EMPTY':
      return 'Type your name so the desk knows whose order it is.';
    case 'BUSY':
      return 'Lots of people are joining right now. Try again in a minute.';
    case 'offline':
      return OFFLINE;
    case 'timeout':
      return SLOW;
    default:
      return "Couldn't join just now. Try again.";
  }
}

/** Words under the shop when the list could not be refreshed. PURE. */
export function refreshErrorText(err: GymError, hasCache: boolean): string {
  if (err.kind === 'SUSPENDED') return GYM_PAUSED_TEXT;
  if (hasCache) return "Couldn't refresh — showing the last list.";
  if (err.kind === 'offline') return OFFLINE;
  if (err.kind === 'timeout') return SLOW;
  return "Couldn't reach your gym. Try again.";
}

/** What the bag does after a failed order, and the words it shows. PURE. */
export interface PlaceFailure {
  message: string;
  /** SOLD_OUT: the bag line to take out (its key), when it can be found. */
  removeKey: string | null;
  /** Fetch the shop's list again (prices or stock moved). */
  refresh: boolean;
}

export function placeFailure(err: GymError, bag: readonly BagLine[], products: readonly Product[]): PlaceFailure {
  switch (err.kind) {
    case 'SOLD_OUT': {
      const name = err.name && err.name.length > 0 ? err.name : 'Something in your bag';
      return { message: `${name} just sold out. It's out of your bag now.`, removeKey: lineKeyNamed(bag, products, err.name ?? ''), refresh: true };
    }
    case 'GONE':
      return { message: 'Something in your bag is no longer sold. We refreshed the shop.', removeKey: null, refresh: true };
    case 'EMPTY':
      return { message: 'Your bag has nothing that can be ordered right now.', removeKey: null, refresh: true };
    case 'TOO_MANY':
      return { message: "You've placed a lot of orders in the last hour. Ask at the desk, or try again later.", removeKey: null, refresh: false };
    case 'TOO_BIG':
      return { message: 'This order is too big to place in the app. Ask at the desk.', removeKey: null, refresh: false };
    case 'SUSPENDED':
      return { message: GYM_PAUSED_TEXT, removeKey: null, refresh: false };
    case 'offline':
      return { message: "No internet. Your bag is kept — try again when you're online.", removeKey: null, refresh: false };
    case 'timeout':
      return { message: "The gym didn't answer. Check My orders before you try again.", removeKey: null, refresh: false };
    default:
      return { message: "Couldn't place the order. Your bag is kept — try again.", removeKey: null, refresh: false };
  }
}

/** Words for a failed cancel. PURE. */
export function cancelErrorText(err: GymError): string {
  switch (err.kind) {
    case 'TOO_LATE':
      return 'The gym has already moved this order on, so it can no longer be cancelled here. Ask at the desk.';
    case 'GONE':
      return 'This order is no longer at the gym.';
    case 'SUSPENDED':
      return GYM_PAUSED_TEXT;
    case 'offline':
      return "No internet. The order is still placed — try again when you're online.";
    case 'timeout':
      return SLOW;
    default:
      return "Couldn't cancel the order. Try again.";
  }
}

/** Shown on the join card when the gym no longer knows this phone's key. */
export const UNLINKED_TEXT = 'This phone is no longer joined to the gym. Join again with its code.';

/** Gym branding: the gym's name and look are asked again on return to the app at most this often. */
export const GYM_CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * Ask the gym again (member_me) now? Yes the first time, then once `GYM_CHECK_EVERY_MS` has passed
 * since the last ask — or when the phone's clock went back past it. PURE.
 */
export function gymCheckDue(lastAtMs: number | null, nowMs: number): boolean {
  if (lastAtMs == null) return true;
  return nowMs - lastAtMs >= GYM_CHECK_EVERY_MS || nowMs < lastAtMs;
}

// ------------------------------------------------------------------ the bag against the live list

/** The bag line whose name (option included) is `name`, as its key; null when none. PURE. */
/**
 * After SOLD_OUT, with the list fetched again: how many of that bag line are still for sale.
 * The server says SOLD_OUT whenever stock is below the quantity asked for, not only at 0, so a
 * line with some left stays in the bag (the order sends at most what is left). PURE.
 */
export function stockLeftForKey(bag: readonly BagLine[], products: readonly Product[], key: string): number {
  const l = bag.find((x) => lineKey(x.productId, x.optionId) === key);
  if (!l) return 0;
  const p = products.find((x) => x.id === l.productId);
  if (!p || !p.active) return 0;
  if (l.optionId === null) return p.options.length > 0 ? 0 : Math.max(0, p.stock);
  const o = p.options.find((x) => x.id === l.optionId);
  return o ? Math.max(0, o.stock) : 0;
}

/** The words when some, but not all, of a bag line is left. PURE. */
export function onlyLeftText(name: string, left: number): string {
  return `Only ${left} of ${name} left now. Tap Place order again to get ${left === 1 ? 'it' : `those ${left}`}.`;
}

export function lineKeyNamed(bag: readonly BagLine[], products: readonly Product[], name: string): string | null {
  const want = name.trim().toLowerCase();
  if (!want) return null;
  for (const l of bag) {
    const p = products.find((x) => x.id === l.productId);
    if (p && lineName(p, l.optionId).trim().toLowerCase() === want) return lineKey(l.productId, l.optionId);
  }
  return null;
}

/**
 * The lines `member_place_order` gets: only what can be ordered now (in the list, a valid choice,
 * in stock), each cut to the stock left. The server checks every price and stock again. PURE.
 */
export function orderLinesFor(bag: readonly BagLine[], products: readonly Product[]): { productId: string; optionId: string | null; qty: number }[] {
  return priceBag(bag, products)
    .lines.filter((l) => l.available && l.qty > 0)
    .map((l) => ({ productId: l.line.productId, optionId: l.line.optionId, qty: l.qty }));
}

/**
 * After an order call the app stopped waiting for, the server may still have placed it. The
 * order that landed is one not in the list from before, still Ordered, with exactly the lines
 * that were sent; null when there is none (the call really failed). PURE.
 */
export function findLandedOrder(
  idsBefore: readonly string[],
  after: readonly GymOrder[],
  sent: readonly { productId: string; optionId: string | null; qty: number }[],
): GymOrder | null {
  const want = orderLinesKey(sent);
  const before = new Set(idsBefore);
  return after.find((o) => !before.has(o.id) && o.status === 'ordered' && orderLinesKey(o.lines) === want) ?? null;
}

/**
 * Audit C6-1: the id this phone gives an order before sending it (member_place_order's
 * p_order_id, migration 0020). The gym keeps it once, so the same bag sent again after a lost
 * answer returns the order it already has. Kept (and saved) until that order is confirmed.
 */
export interface PendingOrder {
  id: string;
  /** The exact lines it was made for: a changed bag is a new order with a new id. */
  lines: string;
  /** When it was made (epoch ms): after `PENDING_ORDER_MS` the same bag is a new order. */
  at: number;
}

/**
 * How long a retry may reuse the id (review of wave 4a): only minutes. A week later the same item
 * is a new order, never the old one handed back. The server also only matches an open order from
 * the last 24 hours.
 */
export const PENDING_ORDER_MS = 15 * 60 * 1000;

/** The id to send for these lines now: the kept one while it is the same bag and fresh, else new. PURE. */
export function orderIdFor(kept: PendingOrder | null, linesKey: string, nowMs: number, newId: () => string): PendingOrder {
  if (kept && kept.lines === linesKey && nowMs >= kept.at && nowMs - kept.at < PENDING_ORDER_MS) return kept;
  return { id: newId(), lines: linesKey, at: nowMs };
}

/** True once My orders shows the order this id made: the id has done its job. PURE. */
export function pendingOrderSettled(kept: PendingOrder | null, orders: readonly Pick<GymOrder, 'clientOrderId'>[]): boolean {
  return kept != null && orders.some((o) => o.clientOrderId === kept.id);
}

/** The lines as one string, in a fixed order, so the same bag always reads the same. PURE. */
export function orderLinesKey(lines: readonly { productId: string; optionId: string | null; qty: number }[]): string {
  return lines
    .map((l) => `${l.productId}::${l.optionId ?? ''}::${l.qty}`)
    .sort()
    .join('|');
}

/** A saved pending order, or null when it is missing or damaged. PURE. */
export function cleanPendingOrder(raw: unknown): PendingOrder | null {
  if (!isObj(raw)) return null;
  return typeof raw.id === 'string' && raw.id.length > 0 && typeof raw.lines === 'string' && typeof raw.at === 'number' && Number.isFinite(raw.at)
    ? { id: raw.id, lines: raw.lines, at: raw.at }
    : null;
}

// ------------------------------------------------------------------ order words

/** The badge on an order card. PURE. */
export function gymStatusBadge(o: Pick<GymOrder, 'status'>): string {
  return { ordered: 'Ordered', ready: 'Ready', collected: 'Collected', cancelled: 'Cancelled' }[o.status];
}

/**
 * What the status pill does not already say, in a sentence (the pill shows the state word; this
 * never repeats it). Null when the pill says it all (Collected). PURE.
 */
export function gymStatusText(o: Pick<GymOrder, 'status' | 'cancelledBy'>): string | null {
  switch (o.status) {
    case 'ordered':
      return 'The gym is getting it ready';
    case 'ready':
      return 'Collect it at the desk';
    case 'collected':
      return null;
    case 'cancelled':
      return o.cancelledBy === 'gym' ? 'The gym cancelled this order' : 'You cancelled this order';
  }
}

/** The line under an order card, about paying (only while it is still to be collected). PURE. */
export function gymPayText(o: Pick<GymOrder, 'status'>): string | null {
  if (o.status === 'ordered') return 'Pay at the desk when you collect it.';
  if (o.status === 'ready') return 'Pay when you collect it.';
  return null;
}

/** The member cancels only while the gym has not got it ready (the server's own rule). PURE. */
export function canCancelGymOrder(o: Pick<GymOrder, 'status'>): boolean {
  return o.status === 'ordered';
}

/**
 * UAT U-G2: the gym Settings names — the gym this phone JOINED, else the name the member typed at
 * onboarding (optional, for members who are not in a gym in the app), else null. PURE.
 */
export function settingsGymName(link: Pick<GymLink, 'gymName'> | null, typed: string | null | undefined): string | null {
  if (link) return link.gymName;
  const t = (typed ?? '').trim();
  return t.length > 0 ? t : null;
}

// ------------------------------------------------------------------ leaving with open orders (UAT U-G1)

/**
 * Leaving the gym (Leave, or an invite link's "Switch to <gym>"). A member who left lost their
 * open orders for good (the gym kept them "Ordered" with the stock held; a rejoin is a new member
 * who never sees them), so the question now says what is open, and Leave cancels what it can.
 */
export type LeaveKind = 'leave' | 'switch';

/** Orders still with the gym: `ordered` (the phone cancels them) and `ready` (the desk's to settle). PURE. */
export function openOrdersOf(orders: readonly GymOrder[]): { ordered: GymOrder[]; ready: GymOrder[] } {
  return { ordered: orders.filter((o) => o.status === 'ordered'), ready: orders.filter((o) => o.status === 'ready') };
}

/**
 * "You have 1 open order (₹450). Leaving cancels it." and/or "1 order is ready at the desk.
 * Collect it or ask the desk to cancel it before you leave." — '' when nothing is open. A switch
 * names the gym being left (`fromGym`), since the screen shows the new one. PURE.
 */
export function openOrdersText(orders: readonly GymOrder[], kind: LeaveKind, fromGym?: string): string {
  const { ordered, ready } = openOrdersOf(orders);
  const at = kind === 'switch' && fromGym ? ` at ${fromGym}` : '';
  const desk = kind === 'switch' && fromGym ? `${fromGym}'s desk` : 'the desk';
  const parts: string[] = [];
  if (ordered.length > 0) {
    const total = ordered.reduce((s, o) => s + o.totalP, 0);
    const one = ordered.length === 1;
    parts.push(
      `You have ${ordered.length} open order${one ? '' : 's'}${at} (${rupees(total)}). ${kind === 'switch' ? 'Switching' : 'Leaving'} cancels ${one ? 'it' : 'them'}.`,
    );
  }
  if (ready.length > 0) {
    const one = ready.length === 1;
    parts.push(
      `${ready.length} order${one ? ' is' : 's are'} ready at ${desk}. Collect ${one ? 'it' : 'them'} or ask the desk to cancel ${one ? 'it' : 'them'} before you ${kind === 'switch' ? 'switch' : 'leave'}.`,
    );
  }
  return parts.join(' ');
}

export interface LeaveQuestion {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
}

function leaveButton(orders: readonly GymOrder[], kind: LeaveKind): string | null {
  const { ordered, ready } = openOrdersOf(orders);
  const verb = kind === 'switch' ? 'switch' : 'leave';
  if (ordered.length > 0) return `Cancel order${ordered.length === 1 ? '' : 's'} and ${verb}`;
  if (ready.length > 0) return kind === 'switch' ? 'Switch anyway' : 'Leave anyway';
  return null;
}

/**
 * "Leave <gym>?" (from the gym's tab or Settings → Your gym; R-77: it is leaving the gym, not a
 * shop), with what is still open. PURE.
 */
export function leaveQuestion(a: { gymName: string; branded: boolean; orders: readonly GymOrder[] }): LeaveQuestion {
  const base = a.branded
    ? "The app goes back to MettleUp's colours. Your workouts stay on this phone. You can join again with the code."
    : 'Your workouts stay on this phone. You can join again with the code.';
  const open = openOrdersText(a.orders, 'leave');
  return {
    title: `Leave ${a.gymName}?`,
    body: open ? `${open} ${base}` : base,
    confirmLabel: leaveButton(a.orders, 'leave') ?? 'Leave gym',
    cancelLabel: 'Stay',
  };
}

/** An invite link's "Switch to <gym>": a question only when something is open at the old gym. PURE. */
export function switchQuestion(a: { fromGym: string; toGym: string; orders: readonly GymOrder[] }): LeaveQuestion | null {
  const label = leaveButton(a.orders, 'switch');
  if (!label) return null;
  return { title: `Switch to ${a.toGym}?`, body: openOrdersText(a.orders, 'switch', a.fromGym), confirmLabel: label, cancelLabel: 'Stay' };
}

/** Where the member still is when a cancel before leaving failed. */
function stillIn(kind: LeaveKind): string {
  return kind === 'switch' ? "you haven't switched gyms" : "you're still in the gym";
}

/** A cancel before leaving failed (no internet, slow gym, other): nothing was left. PURE. */
export function leaveCancelFailText(err: GymError, kind: LeaveKind, count: number): string {
  const still = stillIn(kind);
  const placed = count === 1 ? 'Your order is still placed' : 'Your orders are still placed';
  if (err.kind === 'offline') return `No internet. ${placed} and ${still}. Try again when you're online.`;
  if (err.kind === 'timeout') return `The gym didn't answer. ${placed} and ${still}. Try again in a moment.`;
  return `Couldn't cancel your order, so ${still}. Try again.`;
}

/** An order whose answer was lost could not be looked up (no signal): leaving waits. PURE. */
export function leaveUncheckedText(kind: LeaveKind): string {
  return `No internet, so your last order couldn't be checked with the gym, and ${stillIn(kind)}. Try again when you're online.`;
}

/** The desk made an open order ready while the member was leaving: it is theirs to settle. PURE. */
export function leaveReadyNowText(orderNo: number, kind: LeaveKind): { title: string; body: string } {
  return {
    title: `Order ${orderNo} is ready`,
    body: `The gym has just got order ${orderNo} ready at the desk, so it can't be cancelled here. Collect it or ask the desk to cancel it. For now ${stillIn(kind)}.`,
  };
}

/**
 * After a placed order. `changedTotalP` (audit C6-3): the order's total when the gym charged a
 * different amount than the bag showed at the tap (a price changed meanwhile). PURE.
 */
export function orderPlacedText(orderNo: number, changedTotalP: number | null = null): string {
  if (changedTotalP != null) return `Order ${orderNo} placed. The price changed since your bag — total ${rupees(changedTotalP)}. Pay at the desk when you collect it.`;
  return `Order ${orderNo} placed. Pay at the desk when you collect it.`;
}

/** A product list older than this says how old it is (audit C6-4). */
export const LIST_STALE_MS = 10 * 60 * 1000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Prices and stock as of 7:10 pm today." / "… as of Mon 13 Oct, 7:10 pm." for a list fetched more
 * than 10 minutes ago (the phone's own clock); null when fresh, never fetched or unreadable. PURE.
 */
export function listAgeText(atISO: string | null, nowMs: number): string | null {
  if (!atISO) return null;
  const at = new Date(atISO);
  if (Number.isNaN(at.getTime()) || nowMs - at.getTime() < LIST_STALE_MS) return null;
  const h = at.getHours();
  const time = `${h % 12 === 0 ? 12 : h % 12}:${String(at.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  const now = new Date(nowMs);
  const today = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  if (today) return `Prices and stock as of ${time} today.`;
  return `Prices and stock as of ${DAYS[at.getDay()]} ${at.getDate()} ${MONTHS[at.getMonth()]}, ${time}.`;
}

/** "Order 12 placed…", said once on the My orders the bag opened, tied to the order it is about. */
export interface OrderFlash {
  orderId: string;
  text: string;
}

/**
 * The placed line, only while its order is still Ordered: once the member (or the gym) cancels it,
 * or it moves on to Ready, a green "placed" banner over that card would contradict it. PURE.
 */
export function visibleFlash(flash: OrderFlash | null, orders: readonly Pick<GymOrder, 'id' | 'status'>[]): string | null {
  if (!flash) return null;
  const o = orders.find((x) => x.id === flash.orderId);
  return o && o.status === 'ordered' ? flash.text : null;
}

// ------------------------------------------------------------------ the persisted blob

export interface GymBlob {
  link: GymLink | null;
  products: Product[];
  /** When the product list was last fetched (ISO), null when never. */
  productsAt: string | null;
  orders: GymOrder[];
  bag: BagLine[];
}

export const EMPTY_GYM_BLOB: GymBlob = { link: null, products: [], productsAt: null, orders: [], bag: [] };

function cleanBag(raw: unknown): BagLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is BagLine =>
      isObj(l) && typeof l.productId === 'string' && (typeof l.optionId === 'string' || l.optionId === null) && Number.isInteger(l.qty) && (l.qty as number) > 0,
  );
}

/** A cached product, as the app saved it (already in the app's shape); null when damaged. */
function cleanCachedProduct(raw: unknown): Product | null {
  if (!isObj(raw) || !isObj(raw.art)) return null;
  // Re-read it through the row mapper so one rule decides what a usable product is.
  return productFromRow({
    product_id: raw.id,
    name: raw.name,
    category: raw.category,
    description: raw.description,
    price_p: raw.priceP,
    option_name: raw.optionName,
    options: raw.options,
    stock: raw.stock,
    active: raw.active,
    art_kind: raw.art.kind,
    art_tint: raw.art.tint,
    // A list saved before photos existed has none: it loads as drawings.
    image_url: raw.imageUrl,
  });
}

function cleanCachedOrder(raw: unknown): GymOrder | null {
  if (!isObj(raw)) return null;
  return orderFromRow({
    order_id: raw.id,
    order_no: raw.orderNo,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    lines: raw.lines,
    total_p: raw.totalP,
    status: raw.status,
    cancelled_by: raw.cancelledBy,
    client_order_id: raw.clientOrderId,
  });
}

/**
 * Keep only well-formed parts of what storage held (an older or damaged blob must never crash
 * the Shop). No usable link means nothing else is kept: a cache without its gym is a stranger's. PURE.
 */
export function cleanGymBlob(raw: unknown): GymBlob {
  const r = isObj(raw) ? raw : {};
  const link = isObj(r.link) ? linkFromJoin(r.link) : null;
  if (!link) return { ...EMPTY_GYM_BLOB };
  const products = Array.isArray(r.products) ? r.products.map(cleanCachedProduct).filter((p): p is Product => p != null) : [];
  const orders = Array.isArray(r.orders) ? newestFirst(r.orders.map(cleanCachedOrder).filter((o): o is GymOrder => o != null)) : [];
  return {
    link,
    products,
    productsAt: typeof r.productsAt === 'string' ? r.productsAt : null,
    orders,
    bag: cleanBag(r.bag),
  };
}

// ------------------------------------------------------------------ invite link (14 Oct 2026)

/** What gym_preview (0007) says a code is: the gym's name and look, before anyone joins. */
export interface GymPreview {
  gymName: string;
  joinCode: string;
  brand: GymBrand | null;
}

/** gym_preview's answer → a preview; null for an unknown code (the server answers null). PURE. */
export function previewFromRow(raw: unknown): GymPreview | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(row)) return null;
  const gymName = str(row.gymName);
  const joinCode = str(row.joinCode);
  if (!gymName || !joinCode) return null;
  return { gymName: gymName.trim(), joinCode, brand: parseGymBrand(row.brand) };
}

/**
 * The code in an invite link's path (/j/RAMS01, or forgeai://j/RAMS01): cleaned like a typed code.
 * Null when it cannot be a code at all, so the screen says "not a gym link" without asking. PURE.
 */
export function codeFromInvite(raw: unknown): string | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== 'string') return null;
  // C6-9: exactly 6 letters or digits, like the check-in link and the cold-start path — /j/RAMS01X
  // is not RAMS01.
  const t = s.trim();
  return /^[A-Za-z0-9]{6}$/.test(t) ? t.toUpperCase() : null;
}

/**
 * The letter on a gym's tile when it has no logo (C6-13): its first letter or digit — never half
 * of an emoji ("💪 Iron Paradise" → "I"); a name with neither gives its first whole character. PURE.
 */
export function gymInitial(name: string): string {
  const chars = [...String(name ?? '').trim()];
  const first = chars.find((c) => /[\p{L}\p{N}]/u.test(c)) ?? chars[0] ?? '';
  return first.toUpperCase();
}

/** C6-16: the check-in poster's "Join <gym>" — the join screen comes back to the check-in. PURE. */
export function joinPathFromCheckIn(code: string): string {
  return `/j/${code}?then=checkin`;
}

/** Where the join screen goes after a join: back to the poster's check-in when it came from one, else Workout. PURE. */
export function afterJoinPath(code: string, then: unknown): string {
  const t = Array.isArray(then) ? then[0] : then;
  // R-77: a join lands on the Workout tab, as if the app started again in the gym's look.
  return t === 'checkin' ? `/c/${code}` : '/workout';
}

/** Where this phone stands against an invite: not in a gym, already in that one, or in another. PURE. */
export type InviteStanding = 'fresh' | 'same' | 'other';
/** Words when the gym could not be asked about an invite's code. PURE. */
export function previewErrorText(err: GymError): string {
  if (err.kind === 'offline') return OFFLINE;
  if (err.kind === 'timeout') return SLOW;
  return "Couldn't reach your gym. Try again.";
}

/**
 * v0.47.0 review (FINDINGS U-G6): a switch with open orders cancels them at the old gym FIRST. If the
 * new gym then can't be reached, the member stayed in the old gym with nothing left on order. So
 * the new gym is asked first: null = it answered with its name, go on; else what to say (nothing
 * was cancelled, still in the old gym). PURE.
 */
export function switchReachWords(
  r: { ok: true; data: GymPreview | null } | { ok: false; error: GymError },
  fromGym: string,
  toGym: string,
): string | null {
  if (r.ok && r.data) return null;
  // The gym that failed is the NEW one: name it ("your gym" would read as the old one).
  const why = r.ok
    ? 'That gym code is not in use any more. Ask the desk for the right one.'
    : r.error.kind === 'offline' || r.error.kind === 'timeout'
      ? previewErrorText(r.error)
      : `Couldn't reach ${toGym}. Try again.`;
  return `${why} Nothing was cancelled: you are still in ${fromGym}.`;
}

export function inviteStanding(link: Pick<GymLink, 'joinCode'> | null, code: string): InviteStanding {
  if (!link) return 'fresh';
  return cleanJoinCode(link.joinCode) === code ? 'same' : 'other';
}

/**
 * Owner report, 17 Oct 2026: Settings → Your gym had no way to join, so a member who already uses
 * the app never found the code box (it sat on the Shop tab). The page's code box opens the invite
 * screen for the code (it shows the gym, then "Join this gym"); a code that is not 6 letters or
 * digits opens nothing. PURE.
 */
export function joinPathFromSettings(typed: string): string | null {
  const code = joinCodeFromTyped(typed);
  return code.length === JOIN_CODE_LENGTH ? `/j/${code}` : null;
}
