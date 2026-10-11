/**
 * The demo catalog (S1) and the ONE place screens get products from.
 *
 * Every product here is generic (no real brand, no brand picture) and plainly a sample: the Shop
 * tab says so at the top, and every order is a demo order. Prices are realistic Indian gym-shop
 * prices, in paise. S2/S4 replace `getCatalog()`'s body with the gym's own catalog; the screens
 * only ever call `getCatalog()` / `findProduct()`, so nothing else changes.
 */
import type { Product, ProductOption, ShopCategory } from './types';

/** Category chips, in the order the Shop shows them. */
export const SHOP_CATEGORIES: readonly { id: ShopCategory; label: string }[] = [
  { id: 'protein', label: 'Protein' },
  { id: 'preworkout', label: 'Pre-workout' },
  { id: 'creatine', label: 'Creatine' },
  { id: 'gear', label: 'Gear' },
  { id: 'clothing', label: 'Clothing' },
  { id: 'drinks', label: 'Drinks' },
];

/** Picture colours — the app's own palette (ember ramp + chart series). */
const TINT = {
  ember: '#E8641F',
  chocolate: '#7C4218',
  vanilla: '#C98500',
  blue: '#3987E5',
  aqua: '#19A97A',
  violet: '#9085E9',
  steel: '#5E6577',
  red: '#D03B3B',
} as const;

const rs = (rupees: number): number => Math.round(rupees * 100);

type Draft = Omit<Product, 'stock' | 'active'> & { stock?: number };

/** Products with options carry the sum of their options' stock, so the two never disagree. */
function finish(d: Draft): Product {
  const stock = d.options.length > 0 ? d.options.reduce((s, o) => s + Math.max(0, o.stock), 0) : Math.max(0, d.stock ?? 0);
  return { ...d, stock, active: true };
}

const opt = (id: string, label: string, stock: number, extra: Partial<ProductOption> = {}): ProductOption => ({ id, label, stock, ...extra });

const DEMO_PRODUCTS: readonly Product[] = [
  finish({
    id: 'whey-1kg',
    name: 'Whey protein 1 kg',
    category: 'protein',
    description:
      'Whey protein concentrate, about 24 g of protein in each 33 g scoop. Mix one scoop with water or milk after training.',
    priceP: rs(2499),
    optionName: 'Flavour',
    options: [opt('chocolate', 'Chocolate', 12, { tint: TINT.chocolate }), opt('vanilla', 'Vanilla', 7, { tint: TINT.vanilla })],
    art: { kind: 'tub', tint: TINT.chocolate },
  }),
  finish({
    id: 'whey-isolate',
    name: 'Whey isolate 1 kg',
    category: 'protein',
    description: 'Filtered whey isolate: about 27 g of protein a scoop, very little fat or lactose. Light on the stomach.',
    priceP: rs(3799),
    optionName: 'Flavour',
    options: [opt('chocolate', 'Chocolate', 0, { tint: TINT.chocolate }), opt('unflavoured', 'Unflavoured', 0, { tint: TINT.steel })],
    art: { kind: 'tub', tint: TINT.steel },
  }),
  finish({
    id: 'mass-gainer',
    name: 'Mass gainer',
    category: 'protein',
    description: 'Protein with carbohydrates for members who struggle to eat enough. About 380 kcal a serving.',
    priceP: rs(1299),
    optionName: 'Size',
    options: [opt('1kg', '1 kg', 6), opt('3kg', '3 kg', 4, { priceP: rs(2999) })],
    art: { kind: 'pouch', tint: TINT.ember },
  }),
  finish({
    id: 'protein-bars',
    name: 'Protein bars, box of 12',
    category: 'protein',
    description: 'Twelve 60 g bars, 20 g of protein each. Easy to keep in the gym bag.',
    priceP: rs(1199),
    optionName: 'Flavour',
    options: [opt('peanut', 'Peanut butter', 9, { tint: TINT.vanilla }), opt('choco-chip', 'Choco chip', 5, { tint: TINT.chocolate })],
    art: { kind: 'barbox', tint: TINT.vanilla },
  }),
  finish({
    id: 'creatine-250',
    name: 'Creatine monohydrate 250 g',
    category: 'creatine',
    description: 'Plain creatine monohydrate, unflavoured. 3 to 5 g a day, any time of day, with water.',
    priceP: rs(899),
    options: [],
    stock: 20,
    art: { kind: 'jar', tint: TINT.blue },
  }),
  finish({
    id: 'creatine-500',
    name: 'Creatine monohydrate 500 g',
    category: 'creatine',
    description: 'The same plain creatine in a larger tub, about 100 days at 5 g a day.',
    priceP: rs(1599),
    options: [],
    stock: 0,
    art: { kind: 'tub', tint: TINT.blue },
  }),
  finish({
    id: 'pre-workout',
    name: 'Pre-workout 300 g',
    category: 'preworkout',
    description: 'Caffeine, beta-alanine and citrulline. Take one scoop 20 minutes before training; not late in the evening.',
    priceP: rs(1899),
    optionName: 'Flavour',
    options: [opt('watermelon', 'Watermelon', 6, { tint: TINT.red }), opt('lemon-lime', 'Lemon lime', 3, { tint: TINT.aqua })],
    art: { kind: 'tub', tint: TINT.red },
  }),
  finish({
    id: 'bcaa',
    name: 'BCAA 250 g',
    category: 'preworkout',
    description: 'Branched-chain amino acids to sip during a long workout. Mix one scoop in 500 ml of water.',
    priceP: rs(1099),
    optionName: 'Flavour',
    options: [opt('mango', 'Mango', 8, { tint: TINT.vanilla }), opt('blue-raspberry', 'Blue raspberry', 0, { tint: TINT.blue })],
    art: { kind: 'pouch', tint: TINT.vanilla },
  }),
  finish({
    id: 'electrolyte',
    name: 'Electrolyte drink, pack of 10',
    category: 'drinks',
    description: 'Ten sachets of salts and a little sugar for hot days and long workouts. One sachet in 500 ml of water.',
    priceP: rs(450),
    optionName: 'Flavour',
    options: [opt('orange', 'Orange', 15, { tint: TINT.ember }), opt('lemon', 'Lemon', 10, { tint: TINT.vanilla })],
    art: { kind: 'bottle', tint: TINT.ember },
  }),
  finish({
    id: 'protein-shake',
    name: 'Protein shake 250 ml',
    category: 'drinks',
    description: 'A chilled ready-to-drink shake from the gym fridge, 20 g of protein.',
    priceP: rs(120),
    optionName: 'Flavour',
    options: [opt('chocolate', 'Chocolate', 24, { tint: TINT.chocolate }), opt('coffee', 'Coffee', 18, { tint: TINT.steel })],
    art: { kind: 'bottle', tint: TINT.chocolate },
  }),
  finish({
    id: 'shaker',
    name: 'Shaker bottle 700 ml',
    category: 'gear',
    description: 'Leak-proof shaker with a mixing ball and a screw-on lid. Dishwasher safe.',
    priceP: rs(349),
    optionName: 'Colour',
    options: [opt('black', 'Black', 14, { tint: TINT.steel }), opt('orange', 'Orange', 9, { tint: TINT.ember })],
    art: { kind: 'shaker', tint: TINT.ember },
  }),
  finish({
    id: 'gloves',
    name: 'Gym gloves',
    category: 'gear',
    description: 'Padded palms and a wrist strap. Saves your hands on pull-ups and heavy rows.',
    priceP: rs(599),
    optionName: 'Size',
    options: [opt('s', 'S', 3), opt('m', 'M', 6), opt('l', 'L', 0), opt('xl', 'XL', 2)],
    art: { kind: 'gloves', tint: TINT.steel },
  }),
  finish({
    id: 'belt',
    name: 'Lifting belt',
    category: 'gear',
    description: 'A 10 cm stiff belt for heavy squats and deadlifts. Measure round your waist at the navel to pick a size.',
    priceP: rs(1499),
    optionName: 'Size',
    options: [opt('s', 'S (70–80 cm)', 2), opt('m', 'M (80–90 cm)', 4), opt('l', 'L (90–100 cm)', 3), opt('xl', 'XL (100–115 cm)', 1, { priceP: rs(1599) })],
    art: { kind: 'belt', tint: TINT.chocolate },
  }),
  finish({
    id: 'wrist-wraps',
    name: 'Wrist wraps, pair',
    category: 'gear',
    description: 'Elastic wraps with a thumb loop for heavy pressing. 45 cm long.',
    priceP: rs(449),
    options: [],
    stock: 11,
    art: { kind: 'wraps', tint: TINT.red },
  }),
  finish({
    id: 'bands',
    name: 'Resistance bands, set of 5',
    category: 'gear',
    description: 'Five loop bands from light to extra heavy, for warm-ups, mobility and assisted pull-ups.',
    priceP: rs(999),
    options: [],
    stock: 7,
    art: { kind: 'band', tint: TINT.aqua },
  }),
  finish({
    id: 'towel',
    name: 'Gym towel',
    category: 'gear',
    description: 'Quick-dry microfibre towel, 40 × 80 cm, with a clip for your bag.',
    priceP: rs(299),
    options: [],
    stock: 25,
    art: { kind: 'towel', tint: TINT.violet },
  }),
  finish({
    id: 'tshirt',
    name: 'Training T-shirt',
    category: 'clothing',
    description: 'Light, quick-dry training T-shirt with the gym’s name on the back. Regular fit.',
    priceP: rs(799),
    optionName: 'Size',
    options: [opt('s', 'S', 4), opt('m', 'M', 8), opt('l', 'L', 6), opt('xl', 'XL', 0), opt('xxl', 'XXL', 2, { priceP: rs(849) })],
    art: { kind: 'tshirt', tint: TINT.ember },
  }),
];

/**
 * The SAMPLE shop's catalog (the demo products, opened from the join card's "See a sample shop").
 * The gym's own list (S2) comes from the server in the same shape (gym.ts → productsFromRows) and
 * is kept in gymStore.ts; shopSource.ts picks which one a page shows. Only active products.
 */
export function getCatalog(): readonly Product[] {
  return DEMO_PRODUCTS.filter((p) => p.active);
}

/** True: getCatalog() is always the built-in demo (the gym's own list never comes from here). */
export function isDemoCatalog(): boolean {
  return true;
}

/** One product by id from a catalog, or null. PURE. */
export function findProduct(catalog: readonly Product[], id: string): Product | null {
  return catalog.find((p) => p.id === id) ?? null;
}
