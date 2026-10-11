/**
 * The gym's real shop (S2) — the PURE half. Everything here is data in, data out, and
 * test/shop/gym.test.ts holds it: turning the server's rows (supabase/migrations/0002_shop.sql,
 * the `member_*` functions) into the app's own Product and order shapes, the words for every
 * error the server can raise, the join code's cleaning, the bag's check against the live list,
 * and the persisted blob's cleaning. No Supabase here (it is a native-backed client); the calls
 * live in gymApi.ts and the store in gymStore.ts.
 */
import { SHOP_CATEGORIES } from './catalog';
import { lineKey, lineName, priceBag } from './money';
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
 * One `member_products` row as the app's Product (snake_case → the S1 shape): price_p → priceP,
 * option_name → optionName, options as they are, art_kind/art_tint → art. Null when the row is
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
  return { id, orderNo, createdAt, updatedAt: str(raw.updated_at) ?? createdAt, lines, totalP, status, cancelledBy: status === 'cancelled' ? by : null };
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
  return {
    memberKey,
    memberId,
    gymId,
    gymName: gymName.trim(),
    joinCode: typeof raw.joinCode === 'string' ? raw.joinCode : '',
    name: typeof raw.name === 'string' ? raw.name : '',
  };
}

// ------------------------------------------------------------------ errors → words

/**
 * What went wrong, as the app understands it. The server raises plain codes (`raise exception
 * 'SOLD_OUT:<name>'`), which reach the app as the error's message; a call that never reached
 * the server comes back with status 0 ("TypeError: Network request failed"), and one cut off by
 * the app's own timer says it was aborted.
 */
export type GymErrorKind = 'offline' | 'timeout' | 'INVALID_CODE' | 'EMPTY' | 'BUSY' | 'GONE' | 'SOLD_OUT' | 'BAD_KEY' | 'TOO_LATE' | 'other';

export interface GymError {
  kind: GymErrorKind;
  /** SOLD_OUT only: the name the server gave ("Whey protein 1 kg · Strawberry"). */
  name?: string;
}

const CODES: readonly GymErrorKind[] = ['INVALID_CODE', 'EMPTY', 'BUSY', 'GONE', 'BAD_KEY', 'TOO_LATE'];

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
  if (hasCache) return "Couldn't refresh — showing the last list.";
  if (err.kind === 'offline') return OFFLINE;
  if (err.kind === 'timeout') return SLOW;
  return "Couldn't load the shop. Try again.";
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

// ------------------------------------------------------------------ the bag against the live list

/** The bag line whose name (option included) is `name`, as its key; null when none. PURE. */
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
  const key = (l: { productId: string; optionId: string | null; qty: number }) => `${l.productId}::${l.optionId ?? ''}::${l.qty}`;
  const want = sent.map(key).sort().join('|');
  const before = new Set(idsBefore);
  return after.find((o) => !before.has(o.id) && o.status === 'ordered' && o.lines.map(key).sort().join('|') === want) ?? null;
}

// ------------------------------------------------------------------ order words

/** The badge on an order card. PURE. */
export function gymStatusBadge(o: Pick<GymOrder, 'status'>): string {
  return { ordered: 'Ordered', ready: 'Ready', collected: 'Collected', cancelled: 'Cancelled' }[o.status];
}

/** The order's state in a sentence. PURE. */
export function gymStatusText(o: Pick<GymOrder, 'status' | 'cancelledBy'>): string {
  switch (o.status) {
    case 'ordered':
      return 'Ordered — the gym is getting it ready';
    case 'ready':
      return 'Ready — collect it at the desk';
    case 'collected':
      return 'Collected';
    case 'cancelled':
      return o.cancelledBy === 'gym' ? 'Cancelled by the gym' : 'Cancelled by you';
  }
}

/** The member cancels only while the gym has not got it ready (the server's own rule). PURE. */
export function canCancelGymOrder(o: Pick<GymOrder, 'status'>): boolean {
  return o.status === 'ordered';
}

/** After a placed order. PURE. */
export function orderPlacedText(orderNo: number): string {
  return `Order ${orderNo} placed. Pay at the desk when you collect it.`;
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
