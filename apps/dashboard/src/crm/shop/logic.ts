/**
 * Shop — the pure rules behind the owner's Shop screens (S2).
 *
 * Everything here is plain TypeScript with no network and no React, so it is
 * tested directly (`test/crm/shop.test.ts`). The cloud contract these shapes
 * mirror is `supabase/migrations/0002_shop.sql`: money is integer paise, an order
 * moves ordered -> ready -> collected, and either of the first two can be
 * cancelled (stock goes back). Collected and cancelled are final.
 */

import { SUSPENDED_WORDS } from '../auth/signin';
import { formatINR, parseRupeeInput, type Paise } from '../logic/money';
import { dateISOFromEpoch, IST_OFFSET_MS } from '../logic/dates';

// ---------------------------------------------------------------- shapes

export type Category = 'protein' | 'preworkout' | 'creatine' | 'gear' | 'clothing' | 'drinks';
export type ArtKind =
  | 'tub'
  | 'jar'
  | 'pouch'
  | 'barbox'
  | 'shaker'
  | 'bottle'
  | 'gloves'
  | 'belt'
  | 'wraps'
  | 'band'
  | 'towel'
  | 'tshirt';
export type OrderStatus = 'ordered' | 'ready' | 'collected' | 'cancelled';

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'protein', label: 'Protein' },
  { value: 'preworkout', label: 'Pre-workout' },
  { value: 'creatine', label: 'Creatine' },
  { value: 'gear', label: 'Gear' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'drinks', label: 'Drinks' },
];

export const ART_KINDS: { value: ArtKind; label: string }[] = [
  { value: 'tub', label: 'Tub' },
  { value: 'jar', label: 'Jar' },
  { value: 'pouch', label: 'Pouch' },
  { value: 'barbox', label: 'Box' },
  { value: 'shaker', label: 'Shaker' },
  { value: 'bottle', label: 'Bottle' },
  { value: 'gloves', label: 'Gloves' },
  { value: 'belt', label: 'Belt' },
  { value: 'wraps', label: 'Wraps' },
  { value: 'band', label: 'Band' },
  { value: 'towel', label: 'Towel' },
  { value: 'tshirt', label: 'T-shirt' },
];

/** The colour swatches offered for a product's picture, with names a screen reader can say. */
export const TINT_CHOICES: { value: string; name: string }[] = [
  { value: '#E8661F', name: 'Orange' },
  { value: '#C2185B', name: 'Berry' },
  { value: '#D9536F', name: 'Pink' },
  { value: '#C98A12', name: 'Gold' },
  { value: '#7CB342', name: 'Lime' },
  { value: '#2F7D6D', name: 'Teal' },
  { value: '#29B6F6', name: 'Sky blue' },
  { value: '#5B6475', name: 'Slate' },
  { value: '#7A4A2A', name: 'Chocolate' },
  { value: '#3E2723', name: 'Coffee' },
  { value: '#1F2937', name: 'Charcoal' },
  { value: '#ECEFF1', name: 'White' },
];
export const TINTS = TINT_CHOICES.map((t) => t.value);

export interface ProductOption {
  id: string;
  label: string;
  /** Own price, when this option costs something different from the product. */
  priceP?: Paise | null;
  stock: number;
  tint?: string | null;
}

export interface Product {
  productId: string;
  name: string;
  category: Category;
  description: string;
  priceP: Paise;
  optionName: string | null;
  options: ProductOption[];
  stock: number;
  active: boolean;
  artKind: ArtKind;
  artTint: string;
  sort: number;
  /**
   * The row's `updated_at` EXACTLY as the cloud sent it. Sent back on save so the
   * cloud can refuse (CHANGED) when the product moved on meanwhile — a member's
   * order took stock, or another tab saved — instead of overwriting it.
   */
  updatedAt: string;
  /** A real photo in the product-photos bucket, or null: then the drawn picture shows. */
  imageUrl: string | null;
}

export interface OrderLine {
  productId: string;
  optionId: string | null;
  name: string;
  qty: number;
  unitPriceP: Paise;
}

export interface Order {
  orderId: string;
  orderNo: number;
  memberName: string;
  lines: OrderLine[];
  totalP: Paise;
  status: OrderStatus;
  cancelledBy: 'member' | 'gym' | null;
  createdAt: number;
  updatedAt: number;
}

export interface AppMember {
  memberId: string;
  name: string;
  phone: string | null;
  joinedAt: number;
  lastSeen: number;
  orders: number;
  spentP: Paise;
}

// ---------------------------------------------------------------- rows from the cloud

type Row = Record<string, unknown>;

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const time = (v: unknown): number => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
};

export function productFromRow(r: Row): Product {
  const options = Array.isArray(r.options) ? (r.options as Row[]) : [];
  return {
    productId: str(r.product_id),
    name: str(r.name),
    category: str(r.category, 'gear') as Category,
    description: str(r.description),
    priceP: num(r.price_p),
    optionName: typeof r.option_name === 'string' ? r.option_name : null,
    options: options.map((o) => ({
      id: str(o.id),
      label: str(o.label),
      priceP: o.priceP === undefined || o.priceP === null ? null : num(o.priceP),
      stock: num(o.stock),
      tint: typeof o.tint === 'string' ? o.tint : null,
    })),
    stock: num(r.stock),
    active: r.active !== false,
    artKind: str(r.art_kind, 'tub') as ArtKind,
    artTint: str(r.art_tint, '#E8661F'),
    sort: num(r.sort),
    updatedAt: str(r.updated_at),
    imageUrl: typeof r.image_url === 'string' && r.image_url ? r.image_url : null,
  };
}

export function orderFromRow(r: Row): Order {
  const lines = Array.isArray(r.lines) ? (r.lines as Row[]) : [];
  return {
    orderId: str(r.order_id),
    orderNo: num(r.order_no),
    memberName: str(r.member_name) || 'A member',
    lines: lines.map((l) => ({
      productId: str(l.productId),
      optionId: typeof l.optionId === 'string' ? l.optionId : null,
      name: str(l.name),
      qty: num(l.qty),
      unitPriceP: num(l.unitPriceP),
    })),
    totalP: num(r.total_p),
    status: str(r.status, 'ordered') as OrderStatus,
    cancelledBy: r.cancelled_by === 'member' || r.cancelled_by === 'gym' ? r.cancelled_by : null,
    createdAt: time(r.created_at),
    updatedAt: time(r.updated_at),
  };
}

export function appMemberFromRow(r: Row): AppMember {
  return {
    memberId: str(r.member_id),
    name: str(r.name),
    phone: typeof r.phone === 'string' ? r.phone : null,
    joinedAt: time(r.joined_at),
    lastSeen: time(r.last_seen),
    orders: num(r.orders),
    spentP: num(r.spent_p),
  };
}

/**
 * R-85 (owner, 23 Oct 2026): the gym's own member record for someone who joined in the app, so a tap
 * opens their page. Matched by the last 10 digits of the mobile (the app keeps "+91…" or the bare
 * number); a left member's old record still counts. Null = not in the member list yet. PURE.
 */
export function rosterIdFor(
  phone: string | null,
  members: readonly { id: string; phone: string; archived?: boolean }[],
): string | null {
  const key = (p: string | null) => (p ?? '').replace(/\D/g, '').slice(-10);
  const want = key(phone);
  if (want.length < 10) return null;
  const hits = members.filter((m) => key(m.phone) === want);
  return (hits.find((m) => !m.archived) ?? hits[0])?.id ?? null;
}

// ---------------------------------------------------------------- orders

export const STATUS_LABEL: Record<OrderStatus, string> = {
  get ordered() {
    return 'New';
  },
  get ready() {
    return 'Ready';
  },
  get collected() {
    return 'Collected';
  },
  get cancelled() {
    return 'Cancelled';
  },
};

export type OrderAction = 'ready' | 'collected' | 'back' | 'cancel';

export const ACTION_LABEL: Record<OrderAction, string> = {
  get ready() {
    return 'Mark ready';
  },
  get collected() {
    return 'Collected (paid)';
  },
  get back() {
    return 'Back to new';
  },
  get cancel() {
    return 'Cancel order';
  },
};

/** The status each button moves the order to — the server's allowed steps. */
export const ACTION_TARGET: Record<OrderAction, OrderStatus> = {
  ready: 'ready',
  collected: 'collected',
  back: 'ordered',
  cancel: 'cancelled',
};

/** Buttons shown on an order card, in order. Final orders get none. */
export function actionsFor(status: OrderStatus): OrderAction[] {
  if (status === 'ordered') return ['ready', 'collected', 'cancel'];
  if (status === 'ready') return ['collected', 'back', 'cancel'];
  return [];
}

/** Mirrors `owner_set_order_status`, so a button never offers a step the server refuses. */
export function canMove(from: OrderStatus, to: OrderStatus): boolean {
  if (from === 'ordered') return to === 'ready' || to === 'collected' || to === 'cancelled';
  if (from === 'ready') return to === 'ordered' || to === 'collected' || to === 'cancelled';
  return false;
}

export type OrderFilter = 'ordered' | 'ready' | 'collected' | 'cancelled' | 'all';

export function filterOrders(orders: readonly Order[], filter: OrderFilter): Order[] {
  return filter === 'all' ? [...orders] : orders.filter((o) => o.status === filter);
}

export function countByStatus(orders: readonly Order[]): Record<OrderFilter, number> {
  const c: Record<OrderFilter, number> = { ordered: 0, ready: 0, collected: 0, cancelled: 0, all: orders.length };
  for (const o of orders) c[o.status] += 1;
  return c;
}

/** Same calendar day in India (UAT F-13: the gym's day, whatever the PC's time zone). */
export function isSameLocalDay(a: number, b: number): boolean {
  return dateISOFromEpoch(a) === dateISOFromEpoch(b);
}

/** Money collected at the desk today: collected orders whose last change was today. */
export function collectedTodayP(orders: readonly Order[], now: number): Paise {
  let sum = 0;
  for (const o of orders) if (o.status === 'collected' && isSameLocalDay(o.updatedAt, now)) sum += o.totalP;
  return sum;
}

/**
 * Orders that are new since the last look: never seen before AND still waiting.
 * `seen` is null on the very first load, which must not toast the whole backlog.
 */
export function newArrivals(seen: ReadonlySet<string> | null, orders: readonly Order[]): Order[] {
  if (seen === null) return [];
  return orders.filter((o) => o.status === 'ordered' && !seen.has(o.orderId));
}

/** "New order from Riya — ₹2,899", or a count when several land at once. */
export function arrivalMessage(arrivals: readonly Order[]): string | null {
  if (arrivals.length === 0) return null;
  if (arrivals.length === 1) {
    const o = arrivals[0];
    return `New order from ${firstName(o.memberName)} — ${formatINR(o.totalP)}`;
  }
  return `${arrivals.length} new orders`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'a member';
}

export function lineText(l: OrderLine): string {
  return `${l.qty} × ${l.name}`;
}

// ---------------------------------------------------------------- time

/** "just now", "2 min ago", "3 hours ago", "yesterday", "5 days ago". */
export function timeAgo(then: number, now: number): string {
  if (!then) return '';
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24 && isSameLocalDay(then, now)) return h === 1 ? '1 hour ago' : `${h} hours ago`;
  const d = Math.max(1, Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000));
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(then).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function startOfDay(t: number): number {
  // Midnight in India of the day `t` falls on (UAT F-13).
  return t - ((t + IST_OFFSET_MS) % 86_400_000 + 86_400_000) % 86_400_000;
}

export function clockTime(t: number): string {
  return new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

// ---------------------------------------------------------------- products

/** Price limits the cloud enforces (shop_products.price_p): ₹1 to ₹1,00,000. */
export const MIN_PRICE_P: Paise = 100;
export const MAX_PRICE_P: Paise = 10_000_000;
export const MAX_STOCK = 100_000;
export const MAX_OPTIONS = 12;

/** A typed rupee price -> paise, or a plain-English reason it is not allowed. */
export function parsePrice(text: string): { ok: true; paise: Paise } | { ok: false; error: string } {
  if (text.trim() === '') return { ok: false, error: 'Type the price.' };
  const p = parseRupeeInput(text);
  if (p === null) return { ok: false, error: 'Type the price in rupees, like 2499.' };
  if (p < MIN_PRICE_P) return { ok: false, error: 'The price must be at least ₹1.' };
  if (p > MAX_PRICE_P) return { ok: false, error: 'The price can be at most ₹1,00,000.' };
  return { ok: true, paise: p };
}

/** A typed stock count, or null when it is not a whole number from 0 to 1,00,000. */
export function parseStock(text: string): number | null {
  const t = text.trim();
  if (t === '') return 0;
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n <= MAX_STOCK ? n : null;
}

/** A product with options holds the sum of its options' stock — the server's rule too. */
export function optionStockSum(options: readonly Pick<ProductOption, 'stock'>[]): number {
  let s = 0;
  for (const o of options) s += Math.max(0, Math.floor(Number.isFinite(o.stock) ? o.stock : 0));
  return s;
}

export type StockTone = 'out' | 'low' | 'ok';

export function stockLabel(stock: number): { text: string; tone: StockTone } {
  if (stock <= 0) return { text: 'Out of stock', tone: 'out' };
  if (stock <= 3) return { text: `Low: ${stock} left`, tone: 'low' };
  return { text: `${stock} in stock`, tone: 'ok' };
}

/** "₹2,499" or "From ₹1,799" when an option has its own, lower price. */
export function priceText(p: Pick<Product, 'priceP' | 'options'>): string {
  const own = p.options.map((o) => o.priceP).filter((x): x is number => typeof x === 'number' && x > 0);
  const lowest = Math.min(p.priceP, ...own);
  const varies = own.some((x) => x !== p.priceP);
  return varies ? `From ${formatINR(lowest)}` : formatINR(p.priceP);
}

/** A stable id for a new option, from its label ("Cookies & Cream" -> "cookies-cream-x7k"). */
export function newOptionId(label: string, taken: ReadonlySet<string>, rand: () => number = Math.random): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 16) || 'option';
  for (let i = 0; i < 50; i += 1) {
    const id = `${base}-${Math.floor(rand() * 36 ** 3)
      .toString(36)
      .padStart(3, '0')}`;
    if (!taken.has(id)) return id;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** The form's working copy of a product. Prices and stock are text until saved. */
export interface ProductDraft {
  productId: string | null;
  /** The version being edited (see Product.updatedAt); null for a new product. */
  updatedAt: string | null;
  /** The photo, uploaded already; null shows the drawn picture. */
  imageUrl: string | null;
  name: string;
  category: Category;
  description: string;
  price: string;
  artKind: ArtKind;
  artTint: string;
  active: boolean;
  stock: string;
  useOptions: boolean;
  optionName: string;
  options: OptionDraft[];
}

export interface OptionDraft {
  /** Kept when editing — orders refer to an option by this id, and cancelling restocks it. */
  id: string | null;
  label: string;
  stock: string;
  price: string;
  tint: string | null;
}

export function draftFromProduct(p: Product | null): ProductDraft {
  if (!p) {
    return {
      productId: null,
      updatedAt: null,
      imageUrl: null,
      name: '',
      category: 'protein',
      description: '',
      price: '',
      artKind: 'tub',
      artTint: TINTS[0],
      active: true,
      stock: '10',
      useOptions: false,
      optionName: 'Flavour',
      options: [],
    };
  }
  return {
    productId: p.productId,
    updatedAt: p.updatedAt,
    imageUrl: p.imageUrl,
    name: p.name,
    category: p.category,
    description: p.description,
    price: rupeesText(p.priceP),
    artKind: p.artKind,
    artTint: p.artTint,
    active: p.active,
    stock: String(p.stock),
    useOptions: p.options.length > 0,
    optionName: p.optionName ?? 'Flavour',
    options: p.options.map((o) => ({
      id: o.id,
      label: o.label,
      stock: String(o.stock),
      price: typeof o.priceP === 'number' && o.priceP > 0 ? rupeesText(o.priceP) : '',
      tint: o.tint ?? null,
    })),
  };
}

/** Paise -> what the owner typed ("2499", or "2499.50"). */
export function rupeesText(p: Paise): string {
  const whole = Math.floor(p / 100);
  const rest = p % 100;
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, '0')}`;
}

/** Exactly what `owner_save_product` takes as `p`. */
export interface SavePayload {
  productId?: string;
  /** Required by the cloud when updating: the version the owner was editing. */
  updatedAt?: string;
  /** The photo; null removes it. Left out, the cloud keeps whatever is there. */
  imageUrl?: string | null;
  name: string;
  category: Category;
  description: string;
  priceP: Paise;
  optionName: string | null;
  options: { id: string; label: string; stock: number; priceP?: Paise; tint?: string }[];
  stock: number;
  active: boolean;
  artKind: ArtKind;
  artTint: string;
}

export type DraftErrors = Partial<Record<'name' | 'price' | 'stock' | 'optionName' | 'options', string>> & {
  optionRows?: Record<number, string>;
};

/** Check a draft. Returns the payload to send, or the reasons it cannot be saved. */
export function validateDraft(
  d: ProductDraft,
  rand: () => number = Math.random,
): { ok: true; payload: SavePayload } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const name = d.name.trim();
  if (name.length === 0) errors.name = 'Give the product a name.';
  else if (name.length > 80) errors.name = 'Keep the name under 80 letters.';

  const price = parsePrice(d.price);
  if (!price.ok) errors.price = price.error;

  let stock = 0;
  let optionName: string | null = null;
  const options: SavePayload['options'] = [];

  if (d.useOptions) {
    optionName = d.optionName.trim() || null;
    if (!optionName) errors.optionName = 'Say what the choice is, like Flavour or Size.';
    else if (optionName.length > 30) errors.optionName = 'Keep this under 30 letters.';
    if (d.options.length === 0) errors.options = 'Add at least one choice, or turn choices off.';
    if (d.options.length > MAX_OPTIONS) errors.options = `At most ${MAX_OPTIONS} choices.`;

    const rowErrors: Record<number, string> = {};
    const taken = new Set(d.options.map((o) => o.id).filter((x): x is string => Boolean(x)));
    const labels = new Set<string>();
    d.options.forEach((o, i) => {
      const label = o.label.trim();
      const s = parseStock(o.stock);
      if (!label) rowErrors[i] = 'Give this choice a name.';
      else if (labels.has(label.toLowerCase())) rowErrors[i] = 'Two choices have the same name.';
      else if (s === null) rowErrors[i] = 'Stock must be a whole number.';
      labels.add(label.toLowerCase());

      let ownPrice: Paise | undefined;
      if (o.price.trim() !== '') {
        const p = parsePrice(o.price);
        if (!p.ok) rowErrors[i] = rowErrors[i] ?? p.error;
        else ownPrice = p.paise;
      }
      const id = o.id ?? newOptionId(label, taken, rand);
      taken.add(id);
      options.push({
        id,
        label,
        stock: s ?? 0,
        ...(ownPrice !== undefined ? { priceP: ownPrice } : {}),
        ...(o.tint ? { tint: o.tint } : {}),
      });
    });
    if (Object.keys(rowErrors).length > 0) errors.optionRows = rowErrors;
    stock = optionStockSum(options);
  } else {
    const s = parseStock(d.stock);
    if (s === null) errors.stock = 'Stock must be a whole number from 0 to 1,00,000.';
    else stock = s;
  }

  if (Object.keys(errors).length > 0 || !price.ok) return { ok: false, errors };

  return {
    ok: true,
    payload: {
      ...(d.productId ? { productId: d.productId } : {}),
      ...(d.productId && d.updatedAt ? { updatedAt: d.updatedAt } : {}),
      imageUrl: d.imageUrl,
      name,
      category: d.category,
      description: d.description.trim().slice(0, 600),
      priceP: price.paise,
      optionName: d.useOptions ? optionName : null,
      options: d.useOptions ? options : [],
      stock,
      active: d.active,
      artKind: d.artKind,
      artTint: d.artTint,
    },
  };
}

/**
 * Which choice "+10 stock" tops up: the first one that is sold out, else the
 * first. Null for a product without choices. The cloud adds the stock itself
 * (owner_add_stock), so a member's order landing at the same moment is never
 * overwritten by an absolute number from this screen.
 */
export function restockOptionId(p: Pick<Product, 'options'>): string | null {
  if (p.options.length === 0) return null;
  const out = p.options.find((o) => o.stock <= 0);
  return (out ?? p.options[0]).id;
}

/** A product's own save payload, unchanged (with its version) — the form's starting point. */
export function toPayload(p: Product): SavePayload {
  return {
    productId: p.productId,
    updatedAt: p.updatedAt,
    imageUrl: p.imageUrl,
    name: p.name,
    category: p.category,
    description: p.description,
    priceP: p.priceP,
    optionName: p.options.length > 0 ? p.optionName : null,
    options: p.options.map((o) => ({
      id: o.id,
      label: o.label,
      stock: o.stock,
      ...(typeof o.priceP === 'number' && o.priceP > 0 ? { priceP: o.priceP } : {}),
      ...(o.tint ? { tint: o.tint } : {}),
    })),
    stock: p.stock,
    active: p.active,
    artKind: p.artKind,
    artTint: p.artTint,
  };
}

// ---------------------------------------------------------------- errors

/** Codes the cloud raises (0002_shop.sql), plus the ones the browser makes. */
export type ShopErrorCode =
  | 'BAD_KEY'
  | 'GONE'
  | 'BAD_STEP'
  | 'EMPTY'
  | 'BAD_OPTIONS'
  | 'BUSY'
  | 'CHANGED'
  | 'TOO_MANY'
  | 'BAD_PHOTO'
  | 'SUSPENDED'
  | 'OFFLINE'
  | 'INVALID'
  | 'UNKNOWN';

export function errorCode(err: unknown): ShopErrorCode {
  const msg = errorText(err);
  for (const code of ['BAD_KEY', 'GONE', 'BAD_STEP', 'EMPTY', 'BAD_OPTIONS', 'BUSY', 'CHANGED', 'TOO_MANY', 'BAD_PHOTO', 'SUSPENDED'] as const) {
    if (new RegExp(`\\b${code}\\b`).test(msg)) return code;
  }
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out/i.test(msg)) {
    return 'OFFLINE';
  }
  if (/check constraint|invalid input|out of range|violates/i.test(msg)) return 'INVALID';
  return 'UNKNOWN';
}

function errorText(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const o = err as { message?: unknown; details?: unknown; hint?: unknown };
    return [o.message, o.details, o.hint].filter((x) => typeof x === 'string').join(' ');
  }
  return String(err);
}

const ERROR_WORDS: Record<ShopErrorCode, string> = {
  get BAD_KEY() {
    return 'This demo gym is no longer available. Start a new demo gym.';
  },
  get GONE() {
    return 'That was already removed or changed. We updated the list.';
  },
  get BAD_STEP() {
    return 'Someone already changed that order. We updated the list.';
  },
  get EMPTY() {
    return 'Type the name.';
  },
  get BAD_OPTIONS() {
    return `Too many choices. Keep it to ${MAX_OPTIONS} or fewer.`;
  },
  get BUSY() {
    return 'Too many demo gyms were started in the last hour. Please try again in a few minutes.';
  },
  get CHANGED() {
    return 'This product changed while you were editing. Someone may have ordered it. We loaded the new details. Check them and save again.';
  },
  get TOO_MANY() {
    return 'Too many orders from this member in the last hour.';
  },
  get BAD_PHOTO() {
    return 'That photo link can’t be used. Upload the photo again from this screen.';
  },
  get SUSPENDED() {
    // #51: the same sentence the records screens use.
    return SUSPENDED_WORDS;
  },
  get OFFLINE() {
    return 'Can’t reach the internet. Check the connection and try again.';
  },
  get INVALID() {
    return 'Something in this form isn’t allowed. Check the price (₹1 to ₹1,00,000) and stock.';
  },
  get UNKNOWN() {
    return 'Something went wrong. Please try again.';
  },
};

/**
 * What to tell the owner when a cloud call fails. Never a raw database message:
 * anything unrecognised ("deadlock detected", a stack trace) becomes the UNKNOWN
 * sentence.
 */
export function errorWords(err: unknown): string {
  return ERROR_WORDS[errorCode(err)];
}

// ---------------------------------------------------------------- stale reads

/**
 * Keeps a slow poll from undoing a tap. A list read that was already on its way
 * when the owner pressed "Mark ready" can arrive AFTER the button's reply and
 * paint the old state back (card flips to New, badge returns). Every mutation
 * bumps the generation when it starts and again when it finishes; a read is only
 * applied if no mutation started or finished while it was out, and none is
 * running now.
 */
export class MutationGate {
  private gen = 0;
  private active = 0;

  /** Call before sending a read; pass the result to `fresh` when it returns. */
  stamp(): number {
    return this.gen;
  }

  fresh(stamp: number): boolean {
    return stamp === this.gen && this.active === 0;
  }

  begin(): void {
    this.gen += 1;
    this.active += 1;
  }

  end(): void {
    this.gen += 1;
    this.active = Math.max(0, this.active - 1);
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.begin();
    try {
      return await fn();
    } finally {
      this.end();
    }
  }
}
