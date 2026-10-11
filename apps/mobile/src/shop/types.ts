/**
 * The Shop's data model (S1, PLAN §7). Shaped like the future gym server's rows so S2 can swap
 * the demo catalog for the gym's own without touching a screen:
 *   product  → products table (price in PAISE, a whole number — never rupee floats)
 *   option   → product_options (a flavour, a size, a colour; its own price and stock when needed)
 *   order    → orders + order_lines (each line keeps the name and price it was ordered at)
 */

export type ShopCategory = 'protein' | 'preworkout' | 'creatine' | 'gear' | 'clothing' | 'drinks';

/** What the drawn product picture shows (ProductArt). */
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

export interface ProductOption {
  id: string;
  label: string;
  /** This option's own price; absent = the product's price. */
  priceP?: number;
  stock: number;
  /** Picture colour for this option (a flavour's tub label, a shirt's colour). */
  tint?: string;
}

export interface Product {
  id: string;
  name: string;
  category: ShopCategory;
  description: string;
  /** Price in paise (₹2,499 = 249900). With options, the price of any option without its own. */
  priceP: number;
  /** What the options are ("Flavour", "Size", "Colour"); absent when there are none. */
  optionName?: string;
  options: ProductOption[];
  /** Without options: the stock. With options: the sum of theirs (kept in step by the catalog). */
  stock: number;
  active: boolean;
  art: { kind: ArtKind; tint: string };
}

/** One line in the bag: which product, which option, how many. Prices are read live. */
export interface BagLine {
  productId: string;
  optionId: string | null;
  qty: number;
}

export type OrderStatus = 'ordered' | 'ready' | 'collected' | 'cancelled';

export interface OrderLine {
  productId: string;
  optionId: string | null;
  /** The name as it read when ordered, option included ("Whey protein 1 kg · Chocolate"). */
  name: string;
  qty: number;
  unitPriceP: number;
}

export interface Order {
  id: string;
  /** ISO timestamp. */
  createdAt: string;
  lines: OrderLine[];
  totalP: number;
  status: OrderStatus;
  /** Every S1 order is a demo: never sent anywhere. */
  demo: true;
}
