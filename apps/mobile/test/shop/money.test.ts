import { describe, expect, it } from 'vitest';

import { SHOP_CATEGORIES, findProduct, getCatalog } from '@/shop/catalog';
import {
  MAX_PER_LINE,
  addToBag,
  bagBadgeCount,
  buildOrder,
  canCancel,
  cancelOrderIn,
  cardPriceText,
  clampQty,
  defaultOptionId,
  isOutOfStock,
  leftAfterOrder,
  lineKey,
  maxQty,
  orderTimeText,
  picturesOf,
  priceBag,
  removeLine,
  rupees,
  setLineQty,
  stockFor,
  stockText,
  unitPriceP,
} from '@/shop/money';
import type { BagLine, Order, Product } from '@/shop/types';

const P = (over: Partial<Product> = {}): Product => ({
  id: 'p',
  name: 'Thing',
  category: 'gear',
  description: '',
  priceP: 50000,
  options: [],
  stock: 5,
  active: true,
  art: { kind: 'tub', tint: '#000' },
  ...over,
});

const shirt = P({
  id: 'shirt',
  name: 'Shirt',
  priceP: 79900,
  optionName: 'Size',
  options: [
    { id: 'm', label: 'M', stock: 3 },
    { id: 'xl', label: 'XL', stock: 0 },
    { id: 'xxl', label: 'XXL', stock: 20, priceP: 84900 },
  ],
  stock: 23,
});
const plain = P({ id: 'plain', name: 'Plain', priceP: 29900, stock: 2 });
const catalog = [shirt, plain];

describe('rupees', () => {
  it('formats whole rupees with Indian grouping', () => {
    expect(rupees(249900)).toBe('₹2,499');
    expect(rupees(12499900)).toBe('₹1,24,999');
    expect(rupees(0)).toBe('₹0');
    expect(rupees(99900)).toBe('₹999');
  });
  it('shows paise only when there are some', () => {
    expect(rupees(9950)).toBe('₹99.50');
    expect(rupees(105)).toBe('₹1.05');
  });
  it('never prints NaN', () => {
    expect(rupees(Number.NaN)).toBe('₹0');
  });
});

describe('prices and stock', () => {
  it('uses the option price when it has one, else the product price', () => {
    expect(unitPriceP(shirt, 'm')).toBe(79900);
    expect(unitPriceP(shirt, 'xxl')).toBe(84900);
    expect(unitPriceP(plain, null)).toBe(29900);
  });
  it('reads stock per option; an invalid choice has none', () => {
    expect(stockFor(shirt, 'm')).toBe(3);
    expect(stockFor(shirt, 'xl')).toBe(0);
    expect(stockFor(shirt, null)).toBe(0); // options exist: one must be chosen
    expect(stockFor(shirt, 'nope')).toBe(0);
    expect(stockFor(plain, null)).toBe(2);
    expect(stockFor(plain, 'm')).toBe(0);
    expect(stockFor(P({ active: false }), null)).toBe(0);
  });
  it('caps a line at stock and at the per-line limit', () => {
    expect(maxQty(shirt, 'm')).toBe(3);
    expect(maxQty(shirt, 'xxl')).toBe(MAX_PER_LINE);
  });
  it('clamps quantities to whole numbers within 1..max', () => {
    expect(clampQty(0, 5)).toBe(1);
    expect(clampQty(9, 5)).toBe(5);
    expect(clampQty(2.7, 5)).toBe(2);
    expect(clampQty(3, 0)).toBe(0);
  });
  it('shows "From" only when options cost different amounts', () => {
    expect(cardPriceText(shirt)).toBe('From ₹799');
    expect(cardPriceText(plain)).toBe('₹299');
  });
  it('knows when a product is sold out', () => {
    expect(isOutOfStock(shirt)).toBe(false);
    expect(isOutOfStock(P({ options: [{ id: 'a', label: 'A', stock: 0 }] }))).toBe(true);
    expect(isOutOfStock(P({ stock: 0 }))).toBe(true);
  });
  it('starts the product page on the first option in stock', () => {
    expect(defaultOptionId(P({ options: [{ id: 'a', label: 'A', stock: 0 }, { id: 'b', label: 'B', stock: 1 }] }))).toBe('b');
    expect(defaultOptionId(plain)).toBeNull();
  });
  it('words the stock calmly', () => {
    expect(stockText(0)).toBe('Out of stock');
    expect(stockText(2)).toBe('Only 2 left');
    expect(stockText(12)).toBe('12 in stock');
  });
});

describe('the bag', () => {
  it('adds a new line, then joins the same choice into it', () => {
    let r = addToBag([], catalog, 'shirt', 'xxl', 2);
    expect(r).toEqual({ lines: [{ productId: 'shirt', optionId: 'xxl', qty: 2 }], added: 2 });
    r = addToBag(r.lines, catalog, 'shirt', 'xxl', 3);
    expect(r.lines).toEqual([{ productId: 'shirt', optionId: 'xxl', qty: 5 }]);
    r = addToBag(r.lines, catalog, 'shirt', 'm', 1);
    expect(r.lines).toHaveLength(2);
  });
  it('never puts more in a line than stock allows', () => {
    const r = addToBag([{ productId: 'shirt', optionId: 'm', qty: 2 }], catalog, 'shirt', 'm', 5);
    expect(r.added).toBe(1);
    expect(r.lines[0].qty).toBe(3);
    const again = addToBag(r.lines, catalog, 'shirt', 'm', 1);
    expect(again.added).toBe(0);
  });
  it('adds nothing for a sold-out, unknown or option-less choice', () => {
    expect(addToBag([], catalog, 'shirt', 'xl', 1).added).toBe(0);
    expect(addToBag([], catalog, 'ghost', null, 1).added).toBe(0);
    expect(addToBag([], catalog, 'shirt', null, 1).added).toBe(0);
    expect(addToBag([], catalog, 'plain', null, 0).added).toBe(0);
  });
  it('changes a quantity within its limits and removes a line', () => {
    const lines: BagLine[] = [{ productId: 'shirt', optionId: 'm', qty: 1 }, { productId: 'plain', optionId: null, qty: 1 }];
    const k = lineKey('shirt', 'm');
    expect(setLineQty(lines, catalog, k, 99)[0].qty).toBe(3);
    expect(setLineQty(lines, catalog, k, 0)[0].qty).toBe(1);
    expect(removeLine(lines, k)).toEqual([{ productId: 'plain', optionId: null, qty: 1 }]);
  });
  it('totals line by line, each at its own price', () => {
    const bag = priceBag(
      [
        { productId: 'shirt', optionId: 'm', qty: 2 },
        { productId: 'shirt', optionId: 'xxl', qty: 1 },
        { productId: 'plain', optionId: null, qty: 2 },
      ],
      catalog,
    );
    expect(bag.lines.map((l) => l.lineTotalP)).toEqual([159800, 84900, 59800]);
    expect(bag.totalP).toBe(159800 + 84900 + 59800);
    expect(bag.count).toBe(5);
    expect(bag.lines[0].name).toBe('Shirt · M');
  });
  it('keeps a sold-out or vanished line visible but out of the total', () => {
    const bag = priceBag(
      [
        { productId: 'shirt', optionId: 'xl', qty: 1 },
        { productId: 'ghost', optionId: null, qty: 1 },
        { productId: 'plain', optionId: null, qty: 1 },
      ],
      catalog,
    );
    expect(bag.lines.map((l) => l.available)).toEqual([false, false, true]);
    expect(bag.totalP).toBe(29900);
    expect(bag.count).toBe(1);
  });
  it('cuts a line to the stock left when stock fell below it', () => {
    const bag = priceBag([{ productId: 'plain', optionId: null, qty: 7 }], catalog);
    expect(bag.lines[0].qty).toBe(2);
    expect(bag.totalP).toBe(59800);
  });
  it('counts every item for the bag badge', () => {
    expect(bagBadgeCount([{ productId: 'a', optionId: null, qty: 2 }, { productId: 'b', optionId: 'x', qty: 3 }])).toBe(5);
    expect(bagBadgeCount([])).toBe(0);
  });
});

describe('orders', () => {
  const lines: BagLine[] = [
    { productId: 'shirt', optionId: 'xxl', qty: 2 },
    { productId: 'shirt', optionId: 'xl', qty: 1 },
  ];
  it('turns the orderable lines into a demo order with their names and prices', () => {
    const o = buildOrder(lines, catalog, '2026-10-11T10:00:00.000Z', 'o1');
    expect(o).toEqual({
      id: 'o1',
      createdAt: '2026-10-11T10:00:00.000Z',
      lines: [{ productId: 'shirt', optionId: 'xxl', name: 'Shirt · XXL', qty: 2, unitPriceP: 84900 }],
      totalP: 169800,
      status: 'ordered',
      demo: true,
    });
    expect(leftAfterOrder(lines, catalog)).toEqual([{ productId: 'shirt', optionId: 'xl', qty: 1 }]);
  });
  it('makes no order from a bag with nothing orderable', () => {
    expect(buildOrder([{ productId: 'shirt', optionId: 'xl', qty: 1 }], catalog, 'x', 'o')).toBeNull();
    expect(buildOrder([], catalog, 'x', 'o')).toBeNull();
  });
  it('cancels only an order not yet collected', () => {
    const base = buildOrder([{ productId: 'plain', optionId: null, qty: 1 }], catalog, 't', 'a') as Order;
    const collected: Order = { ...base, id: 'b', status: 'collected' };
    const out = cancelOrderIn([base, collected], 'a');
    expect(out[0].status).toBe('cancelled');
    expect(canCancel(out[0])).toBe(false);
    expect(cancelOrderIn(out, 'b')[1].status).toBe('collected');
  });
  it('dates an order in words', () => {
    const iso = new Date(2026, 9, 11, 16, 57).toISOString();
    expect(orderTimeText(iso)).toBe('11 Oct 2026, 4:57 pm');
    expect(orderTimeText(new Date(2026, 0, 2, 0, 5).toISOString())).toBe('2 Jan 2026, 12:05 am');
    expect(orderTimeText('nonsense')).toBe('');
  });
});

describe('the demo catalog', () => {
  const all = getCatalog();
  it('has about fifteen products in every category', () => {
    expect(all.length).toBeGreaterThanOrEqual(15);
    for (const c of SHOP_CATEGORIES) expect(all.some((p) => p.category === c.id)).toBe(true);
  });
  it('keeps prices in whole paise and ids unique', () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    for (const p of all) {
      expect(Number.isInteger(p.priceP) && p.priceP > 0).toBe(true);
      for (const o of p.options) if (o.priceP != null) expect(Number.isInteger(o.priceP)).toBe(true);
      if (p.options.length > 0) {
        expect(p.stock).toBe(p.options.reduce((s, o) => s + o.stock, 0));
        expect(new Set(p.options.map((o) => o.id)).size).toBe(p.options.length);
      }
    }
  });
  it('shows "Out of stock" for at least one product, and has plenty to buy', () => {
    expect(all.some(isOutOfStock)).toBe(true);
    expect(all.filter((p) => !isOutOfStock(p)).length).toBeGreaterThanOrEqual(12);
  });
  it('uses no brand names', () => {
    const text = all.map((p) => `${p.name} ${p.description}`).join(' ').toLowerCase();
    for (const brand of ['optimum', 'muscleblaze', 'myprotein', 'dymatize', 'on gold', 'gnc', 'nike', 'adidas', 'decathlon', 'muscletech', 'bigmuscles', 'cellucor']) {
      expect(text).not.toContain(brand);
    }
  });
  it('finds a product by id', () => {
    expect(findProduct(all, 'whey-1kg')?.name).toBe('Whey protein 1 kg');
    expect(findProduct(all, 'nope')).toBeNull();
  });
  it('draws one picture per flavour colour', () => {
    const whey = findProduct(all, 'whey-1kg') as Product;
    expect(picturesOf(whey).map((p) => p.optionId)).toEqual(['chocolate', 'vanilla']);
    expect(picturesOf(findProduct(all, 'towel') as Product)).toHaveLength(1);
  });
});
