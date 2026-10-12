/**
 * The Shop's money and bag rules (S1). PURE — every number the bag, product page and orders show
 * comes from here, and test/shop/money.test.ts holds them.
 *
 * Money is whole paise (integers) end to end; only `rupees()` turns it into text. Rupee amounts
 * always use Indian grouping ("₹1,24,999"), whatever the phone's own number style: a price in
 * rupees is read the Indian way.
 */
import { groupIntAs } from '@/lib/numberFormat';

import type { BagLine, Order, OrderLine, Product, ProductOption } from './types';

/** No single line goes above this many, even with plenty in stock (a demo bag, not a pallet). */
export const MAX_PER_LINE = 10;

/** "₹2,499", "₹1,24,999", "₹99.50". Paise are shown only when there are some. PURE. */
export function rupees(paise: number): string {
  const p = Math.round(Number.isFinite(paise) ? paise : 0);
  const neg = p < 0;
  const abs = Math.abs(p);
  const whole = Math.floor(abs / 100);
  const rest = abs % 100;
  const text = `₹${groupIntAs(whole, 'indian')}${rest > 0 ? `.${String(rest).padStart(2, '0')}` : ''}`;
  return neg ? `-${text}` : text;
}

/** The option a bag line names, or null (no options, or an option that no longer exists). PURE. */
export function optionOf(product: Product, optionId: string | null): ProductOption | null {
  if (optionId == null) return null;
  return product.options.find((o) => o.id === optionId) ?? null;
}

/** True when this product+option pair can be bought at all (an option is needed iff it has some). PURE. */
export function isValidChoice(product: Product, optionId: string | null): boolean {
  if (product.options.length === 0) return optionId == null;
  return optionOf(product, optionId) != null;
}

/** The price of one: the option's own price, else the product's. PURE. */
export function unitPriceP(product: Product, optionId: string | null): number {
  return optionOf(product, optionId)?.priceP ?? product.priceP;
}

/** How many are in stock for this choice (0 for an invalid choice). PURE. */
export function stockFor(product: Product, optionId: string | null): number {
  if (!product.active || !isValidChoice(product, optionId)) return 0;
  const o = optionOf(product, optionId);
  return Math.max(0, Math.floor(o ? o.stock : product.stock));
}

/** True when nothing of this product can be bought (every option, or the product, at 0). PURE. */
export function isOutOfStock(product: Product): boolean {
  if (!product.active) return true;
  if (product.options.length > 0) return product.options.every((o) => o.stock <= 0);
  return product.stock <= 0;
}

/** The most one bag line of this choice may hold. PURE. */
export function maxQty(product: Product, optionId: string | null): number {
  return Math.min(MAX_PER_LINE, stockFor(product, optionId));
}

/** A quantity made whole and kept within 1..max (0 when none can be had). PURE. */
export function clampQty(qty: number, max: number): number {
  if (max <= 0) return 0;
  const q = Number.isFinite(qty) ? Math.floor(qty) : 1;
  return Math.min(max, Math.max(1, q));
}

/** The lowest and highest price across the options (both the product price without options). PURE. */
export function priceRange(product: Product): { minP: number; maxP: number } {
  if (product.options.length === 0) return { minP: product.priceP, maxP: product.priceP };
  const prices = product.options.map((o) => o.priceP ?? product.priceP);
  return { minP: Math.min(...prices), maxP: Math.max(...prices) };
}

/** The price under a grid card: "₹2,499", or "From ₹1,299" when options cost different amounts. PURE. */
export function cardPriceText(product: Product): string {
  const { minP, maxP } = priceRange(product);
  return minP === maxP ? rupees(minP) : `From ${rupees(minP)}`;
}

/** The first option that is in stock (the product page's starting choice), else the first. PURE. */
export function defaultOptionId(product: Product): string | null {
  if (product.options.length === 0) return null;
  return (product.options.find((o) => o.stock > 0) ?? product.options[0]).id;
}

/** A bag line's identity: one line per product+option. PURE. */
export function lineKey(productId: string, optionId: string | null): string {
  return `${productId}::${optionId ?? ''}`;
}

/** "Whey protein 1 kg · Chocolate". PURE. */
export function lineName(product: Product, optionId: string | null): string {
  const o = optionOf(product, optionId);
  return o ? `${product.name} · ${o.label}` : product.name;
}

export interface AddResult {
  lines: BagLine[];
  /** How many actually went in (fewer than asked when the line hit its limit; 0 when none could). */
  added: number;
}

/**
 * Put `qty` of a choice in the bag: joins an existing line of the same choice, never above the
 * line's limit (stock and MAX_PER_LINE). An invalid or sold-out choice adds nothing. PURE.
 */
export function addToBag(lines: readonly BagLine[], catalog: readonly Product[], productId: string, optionId: string | null, qty: number): AddResult {
  const product = catalog.find((p) => p.id === productId);
  const want = Number.isFinite(qty) ? Math.floor(qty) : 0;
  if (!product || want <= 0) return { lines: [...lines], added: 0 };
  const max = maxQty(product, optionId);
  const key = lineKey(productId, optionId);
  const at = lines.findIndex((l) => lineKey(l.productId, l.optionId) === key);
  const have = at >= 0 ? lines[at].qty : 0;
  const next = Math.min(max, have + want);
  const added = Math.max(0, next - have);
  if (added === 0) return { lines: [...lines], added: 0 };
  if (at >= 0) return { lines: lines.map((l, i) => (i === at ? { ...l, qty: next } : l)), added };
  return { lines: [...lines, { productId, optionId, qty: next }], added };
}

/** Change one line's quantity, kept within 1..its limit (use removeLine to take it out). PURE. */
export function setLineQty(lines: readonly BagLine[], catalog: readonly Product[], key: string, qty: number): BagLine[] {
  return lines.map((l) => {
    if (lineKey(l.productId, l.optionId) !== key) return l;
    const product = catalog.find((p) => p.id === l.productId);
    if (!product) return l;
    const max = maxQty(product, l.optionId);
    return max <= 0 ? l : { ...l, qty: clampQty(qty, max) };
  });
}

/** Take one line out of the bag. PURE. */
export function removeLine(lines: readonly BagLine[], key: string): BagLine[] {
  return lines.filter((l) => lineKey(l.productId, l.optionId) !== key);
}

export interface PricedLine {
  key: string;
  line: BagLine;
  /** Null when the product has left the catalog. */
  product: Product | null;
  name: string;
  /** What the line will be ordered at (its quantity cut to the stock left). */
  qty: number;
  max: number;
  unitPriceP: number;
  lineTotalP: number;
  /** False when it cannot be ordered now (gone, or sold out): it stays visible, outside the total. */
  available: boolean;
}

export interface PricedBag {
  lines: PricedLine[];
  /** Items to be ordered (sum of available quantities). */
  count: number;
  totalP: number;
}

/** Price every bag line against the catalog as it is now. PURE. */
export function priceBag(lines: readonly BagLine[], catalog: readonly Product[]): PricedBag {
  const priced: PricedLine[] = lines.map((line) => {
    const key = lineKey(line.productId, line.optionId);
    const product = catalog.find((p) => p.id === line.productId) ?? null;
    if (!product || !isValidChoice(product, line.optionId)) {
      return { key, line, product, name: product ? product.name : 'No longer sold', qty: line.qty, max: 0, unitPriceP: 0, lineTotalP: 0, available: false };
    }
    const max = maxQty(product, line.optionId);
    const qty = clampQty(line.qty, max);
    const unit = unitPriceP(product, line.optionId);
    const available = max > 0;
    return { key, line, product, name: lineName(product, line.optionId), qty: available ? qty : line.qty, max, unitPriceP: unit, lineTotalP: available ? unit * qty : 0, available };
  });
  const usable = priced.filter((l) => l.available);
  return {
    lines: priced,
    count: usable.reduce((s, l) => s + l.qty, 0),
    totalP: usable.reduce((s, l) => s + l.lineTotalP, 0),
  };
}

/** The number on the bag icon: every item in the bag, as it was added. PURE. */
export function bagBadgeCount(lines: readonly BagLine[]): number {
  return lines.reduce((s, l) => s + Math.max(0, Math.floor(l.qty)), 0);
}

/**
 * The order the bag becomes: available lines only, each with the name and price it had now.
 * Null when nothing in the bag can be ordered. PURE.
 */
export function buildOrder(lines: readonly BagLine[], catalog: readonly Product[], nowISO: string, id: string): Order | null {
  const bag = priceBag(lines, catalog);
  const orderLines: OrderLine[] = bag.lines
    .filter((l) => l.available)
    .map((l) => ({ productId: l.line.productId, optionId: l.line.optionId, name: l.name, qty: l.qty, unitPriceP: l.unitPriceP }));
  if (orderLines.length === 0) return null;
  return {
    id,
    createdAt: nowISO,
    lines: orderLines,
    totalP: orderLines.reduce((s, l) => s + l.unitPriceP * l.qty, 0),
    status: 'ordered',
    demo: true,
  };
}

/** Lines that stay in the bag after an order: the ones that could not be ordered. PURE. */
export function leftAfterOrder(lines: readonly BagLine[], catalog: readonly Product[]): BagLine[] {
  const bag = priceBag(lines, catalog);
  return bag.lines.filter((l) => !l.available).map((l) => l.line);
}

/** Only an order not yet collected (or already cancelled) can be cancelled. PURE. */
export function canCancel(order: Order): boolean {
  return order.status === 'ordered' || order.status === 'ready';
}

/** Mark one order cancelled (no change when it cannot be). PURE. */
export function cancelOrderIn(orders: readonly Order[], id: string): Order[] {
  return orders.map((o) => (o.id === id && canCancel(o) ? { ...o, status: 'cancelled' } : o));
}

/** Words for a status. */
export const ORDER_STATUS_TEXT: Record<Order['status'], string> = {
  ordered: 'Ordered',
  ready: 'Ready to collect',
  collected: 'Collected',
  cancelled: 'Cancelled',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "11 Oct 2026, 4:57 pm" in the phone's time zone. PURE (given the date). */
export function orderTimeText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

/** "3 items" / "1 item". PURE. */
export function itemsText(n: number): string {
  return `${n} ${n === 1 ? 'item' : 'items'}`;
}

/** "12 in stock", "Only 2 left", "Out of stock". PURE. */
export function stockText(n: number): string {
  if (n <= 0) return 'Out of stock';
  if (n <= 3) return `Only ${n} left`;
  return `${n} in stock`;
}

/** One picture per option colour (a flavour's tub), or the product's own. PURE. */
export function picturesOf(product: Product): { key: string; tint: string; optionId: string | null }[] {
  const seen = new Set<string>();
  const out: { key: string; tint: string; optionId: string | null }[] = [];
  for (const o of product.options) {
    if (o.tint && !seen.has(o.tint)) {
      seen.add(o.tint);
      out.push({ key: o.id, tint: o.tint, optionId: o.id });
    }
  }
  return out.length > 0 ? out : [{ key: 'main', tint: product.art.tint, optionId: null }];
}

const NBSP = String.fromCharCode(0xa0);
/** A number and its unit: "1 kg", "700 ml", "60 caps" (the space, or spaces, between them). */
const NUMBER_UNIT = /(\d) +(kg|g|mg|mcg|ml|l|lb|lbs|oz|cm|mm|m|pcs|pc|caps|tabs|servings|scoops)(?![A-Za-z])/gi;

/**
 * A product name for the screen: the space between a number and its unit becomes a non-breaking
 * one, so a large font never wraps "Whey protein 1" away from "kg". Display only — the name sent
 * to the gym's server, and every TalkBack label, keep the plain name. PURE.
 */
export function displayName(name: string): string {
  return name.replace(NUMBER_UNIT, `$1${NBSP}$2`);
}
