/**
 * The Shop's data model (S1, PLAN §7). Shaped like the future gym server's rows so S2 can swap
 * the demo catalog for the gym's own without touching a screen:
 *   product  → products table (price in PAISE, a whole number — never rupee floats)
 *   option   → product_options (a flavour, a size, a colour; its own price and stock when needed)
 *   order    → orders + order_lines (each line keeps the name and price it was ordered at)
 */

import type { GymBrand } from '@forgeai/theme';

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
  /**
   * The gym's own photo of it (S2, uploaded in the owner's panel): an https link, or absent. When
   * set, the Shop shows the photo; the drawn `art` stays as the stand-in if it cannot load. The
   * sample shop never has one.
   */
  imageUrl?: string;
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

/**
 * S2: this phone's link to the gym's real shop, from `member_join`. The member key is a secret
 * the gym's database made (only its hash is stored there); it is the member's only way back in,
 * so it is kept on the phone until "Leave" or "Erase all data".
 */
export interface GymLink {
  memberKey: string;
  memberId: string;
  gymId: string;
  gymName: string;
  joinCode: string;
  name: string;
  /**
   * Gym branding (Level 1): the gym's colour, background tone, logo and heading style, from the
   * join and every launch (member_me). Null when the gym has none (ForgeAI's own look). The app's
   * theme follows it (theme/gymTheme.ts).
   */
  brand?: GymBrand | null;
}

/** S2: an order the gym holds (from `member_orders`). Paid at the desk, never in the app. */
export interface GymOrder {
  id: string;
  /** The gym's running number the desk calls out ("Order 12"). */
  orderNo: number;
  createdAt: string;
  updatedAt: string;
  lines: OrderLine[];
  totalP: number;
  status: OrderStatus;
  cancelledBy: 'member' | 'gym' | null;
  /** The id this phone gave the order before sending it (0020, audit C6-1); absent on older orders. */
  clientOrderId?: string;
}
