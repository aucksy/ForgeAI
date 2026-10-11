/**
 * Shop (S2) — the pure rules behind the owner's Shop screens. The cloud contract
 * these mirror is supabase/migrations/0002_shop.sql; where the server has a rule
 * (allowed order steps, option stock sum, price limits) the test pins the panel to
 * the same rule, so a button never offers what the server will refuse.
 */

import { describe, expect, it } from 'vitest';

import { clearCloudGym, CLOUD_GYM_KEY, readCloudGym, writeCloudGym } from '../../src/crm/shop/cloudGym';
import { memoryStore } from '../../src/crm/data/local';
import {
  ACTION_TARGET,
  actionsFor,
  arrivalMessage,
  canMove,
  collectedTodayP,
  countByStatus,
  draftFromProduct,
  errorCode,
  errorWords,
  filterOrders,
  newArrivals,
  newOptionId,
  optionStockSum,
  orderFromRow,
  parsePrice,
  parseStock,
  priceText,
  productFromRow,
  restockPayload,
  stockLabel,
  timeAgo,
  toPayload,
  validateDraft,
  type Order,
  type OrderStatus,
  type Product,
} from '../../src/crm/shop/logic';

const T0 = new Date(2026, 9, 12, 10, 0, 0).getTime(); // 12 Oct 2026, 10:00 local (IST)

function order(over: Partial<Order> = {}): Order {
  return {
    orderId: over.orderId ?? 'o1',
    orderNo: 1,
    memberName: 'Riya Sharma',
    lines: [{ productId: 'p1', optionId: null, name: 'Whey', qty: 1, unitPriceP: 289_900 }],
    totalP: 289_900,
    status: 'ordered',
    cancelledBy: null,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

const whey: Product = {
  productId: 'p1',
  name: 'Whey protein 1 kg',
  category: 'protein',
  description: '24 g protein a scoop.',
  priceP: 249_900,
  optionName: 'Flavour',
  options: [
    { id: 'choc', label: 'Chocolate', stock: 12, tint: '#7A4A2A', priceP: null },
    { id: 'str', label: 'Strawberry', stock: 0, tint: '#D9536F', priceP: null },
  ],
  stock: 12,
  active: true,
  artKind: 'tub',
  artTint: '#7A4A2A',
  sort: 1,
};

describe('order steps', () => {
  it('offers exactly the buttons the brief asks for', () => {
    expect(actionsFor('ordered')).toEqual(['ready', 'collected', 'cancel']);
    expect(actionsFor('ready')).toEqual(['collected', 'back', 'cancel']);
    expect(actionsFor('collected')).toEqual([]);
    expect(actionsFor('cancelled')).toEqual([]);
  });

  it('never shows a button the server would refuse (owner_set_order_status)', () => {
    const all: OrderStatus[] = ['ordered', 'ready', 'collected', 'cancelled'];
    for (const from of all) {
      for (const a of actionsFor(from)) expect(canMove(from, ACTION_TARGET[a])).toBe(true);
    }
    // The server's table, spelled out.
    expect(canMove('ordered', 'ready')).toBe(true);
    expect(canMove('ordered', 'ordered')).toBe(false);
    expect(canMove('ready', 'ordered')).toBe(true);
    expect(canMove('collected', 'ordered')).toBe(false);
    expect(canMove('cancelled', 'ready')).toBe(false);
  });

  it('counts and filters by status', () => {
    const list = [
      order({ orderId: 'a' }),
      order({ orderId: 'b', status: 'ready' }),
      order({ orderId: 'c', status: 'collected' }),
      order({ orderId: 'd', status: 'ordered' }),
    ];
    expect(countByStatus(list)).toEqual({ ordered: 2, ready: 1, collected: 1, cancelled: 0, all: 4 });
    expect(filterOrders(list, 'ordered').map((o) => o.orderId)).toEqual(['a', 'd']);
    expect(filterOrders(list, 'all')).toHaveLength(4);
  });
});

describe('new-order toast', () => {
  it('says nothing on the very first load, however many orders are waiting', () => {
    expect(newArrivals(null, [order(), order({ orderId: 'o2' })])).toEqual([]);
  });

  it('names the member and the total for one new order', () => {
    const seen = new Set(['o1']);
    const arrivals = newArrivals(seen, [order(), order({ orderId: 'o2', memberName: 'Riya Sharma', totalP: 289_900 })]);
    expect(arrivals.map((o) => o.orderId)).toEqual(['o2']);
    expect(arrivalMessage(arrivals)).toBe('New order from Riya — ₹2,899');
  });

  it('ignores an unseen order that is already past "new" and counts several at once', () => {
    const seen = new Set<string>();
    expect(newArrivals(seen, [order({ status: 'cancelled' })])).toEqual([]);
    expect(arrivalMessage([order(), order({ orderId: 'x' })])).toBe('2 new orders');
    expect(arrivalMessage([])).toBeNull();
  });
});

describe('money', () => {
  it('sums only collected orders changed today, in local time', () => {
    const yesterdayLate = new Date(2026, 9, 11, 23, 50).getTime();
    const list = [
      order({ orderId: 'a', status: 'collected', totalP: 289_900, updatedAt: T0 }),
      order({ orderId: 'b', status: 'collected', totalP: 6_000, updatedAt: T0 + 3_600_000 }),
      order({ orderId: 'c', status: 'collected', totalP: 99_900, updatedAt: yesterdayLate }),
      order({ orderId: 'd', status: 'ready', totalP: 50_000, updatedAt: T0 }),
      order({ orderId: 'e', status: 'cancelled', totalP: 50_000, updatedAt: T0 }),
    ];
    expect(collectedTodayP(list, T0)).toBe(295_900);
  });

  it('reads a rupee price into paise and refuses anything under ₹1 or over ₹1,00,000', () => {
    expect(parsePrice('2499')).toEqual({ ok: true, paise: 249_900 });
    expect(parsePrice('₹2,499')).toEqual({ ok: true, paise: 249_900 });
    expect(parsePrice('1,00,000')).toEqual({ ok: true, paise: 10_000_000 });
    expect(parsePrice('59.50')).toEqual({ ok: true, paise: 5_950 });
    expect(parsePrice('1')).toEqual({ ok: true, paise: 100 });
    expect(parsePrice('0.99').ok).toBe(false);
    expect(parsePrice('0').ok).toBe(false);
    expect(parsePrice('100001').ok).toBe(false);
    expect(parsePrice('').ok).toBe(false);
    expect(parsePrice('1e3').ok).toBe(false);
    expect(parsePrice('abc').ok).toBe(false);
  });

  it('shows "From" only when a choice has its own, different price', () => {
    expect(priceText(whey)).toBe('₹2,499');
    expect(
      priceText({ priceP: 249_900, options: [{ id: 'a', label: 'A', stock: 1, priceP: 199_900 }] }),
    ).toBe('From ₹1,999');
  });
});

describe('stock', () => {
  it('sums option stock the way the server does (negatives and fractions do not count)', () => {
    expect(optionStockSum([{ stock: 12 }, { stock: 8 }, { stock: 0 }])).toBe(20);
    expect(optionStockSum([{ stock: -3 }, { stock: 2.7 }])).toBe(2);
    expect(optionStockSum([])).toBe(0);
  });

  it('labels stock for the card', () => {
    expect(stockLabel(0)).toEqual({ text: 'Out of stock', tone: 'out' });
    expect(stockLabel(3)).toEqual({ text: 'Low: 3 left', tone: 'low' });
    expect(stockLabel(1)).toEqual({ text: 'Low: 1 left', tone: 'low' });
    expect(stockLabel(4)).toEqual({ text: '4 in stock', tone: 'ok' });
  });

  it('reads a stock count strictly', () => {
    expect(parseStock('12')).toBe(12);
    expect(parseStock('')).toBe(0);
    expect(parseStock('0x10')).toBeNull();
    expect(parseStock('-1')).toBeNull();
    expect(parseStock('1.5')).toBeNull();
    expect(parseStock('100001')).toBeNull();
  });

  it('+10 goes to the first sold-out choice and the product total follows', () => {
    const p = restockPayload(whey, 10);
    expect(p.options.map((o) => o.stock)).toEqual([12, 10]);
    expect(p.stock).toBe(22);
    const plain = restockPayload({ ...whey, options: [], optionName: null, stock: 5 }, 10);
    expect(plain.stock).toBe(15);
    expect(plain.options).toEqual([]);
  });
});

describe('product form', () => {
  it('round-trips a product through the form unchanged', () => {
    const v = validateDraft(draftFromProduct(whey));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.payload).toEqual(toPayload(whey));
  });

  it('keeps existing option ids (orders restock by them) and makes new ones', () => {
    const d = draftFromProduct(whey);
    d.options.push({ id: null, label: 'Cookies & Cream', stock: '5', price: '2,699', tint: null });
    const v = validateDraft(d, () => 0.5);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.payload.options.map((o) => o.id).slice(0, 2)).toEqual(['choc', 'str']);
    expect(v.payload.options[2].id).toMatch(/^cookies-cream-[0-9a-z]{3}$/);
    expect(v.payload.options[2].priceP).toBe(269_900);
    expect(v.payload.stock).toBe(17);
  });

  it('sends an empty option list and the typed stock when choices are off', () => {
    const d = { ...draftFromProduct(null), name: 'Gym towel', price: '299', stock: '30' };
    const v = validateDraft(d);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.payload).toMatchObject({ name: 'Gym towel', priceP: 29_900, stock: 30, options: [], optionName: null });
    expect(v.payload.productId).toBeUndefined();
  });

  it('says what is wrong in plain words', () => {
    const d = { ...draftFromProduct(null), name: '  ', price: '0.5', stock: 'lots' };
    const v = validateDraft(d);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.name).toBeTruthy();
    expect(v.errors.price).toBe('The price must be at least ₹1.');
    expect(v.errors.stock).toBeTruthy();
  });

  it('flags a blank or duplicate choice', () => {
    const d = draftFromProduct(whey);
    d.options[1].label = 'chocolate';
    d.options.push({ id: null, label: '', stock: '1', price: '', tint: null });
    const v = validateDraft(d);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(Object.keys(v.errors.optionRows ?? {})).toEqual(['1', '2']);
  });

  it('makes option ids that never collide with ones already taken', () => {
    const taken = new Set(['m-000']);
    let n = 0;
    const id = newOptionId('M', taken, () => (n++ === 0 ? 0 : 0.5));
    expect(id).not.toBe('m-000');
    expect(id.startsWith('m-')).toBe(true);
  });
});

describe('cloud rows', () => {
  it('maps a product row from the database', () => {
    const p = productFromRow({
      product_id: 'u1',
      name: 'Lifting gloves',
      category: 'gear',
      description: 'Padded palm.',
      price_p: 69_900,
      option_name: 'Size',
      options: [{ id: 'm', label: 'M', stock: 4 }],
      stock: 4,
      active: false,
      art_kind: 'gloves',
      art_tint: '#333A45',
      sort: 8,
    });
    expect(p).toMatchObject({ productId: 'u1', priceP: 69_900, active: false, artKind: 'gloves', optionName: 'Size' });
    expect(p.options[0]).toEqual({ id: 'm', label: 'M', stock: 4, priceP: null, tint: null });
  });

  it('maps an order row, including timestamps', () => {
    const o = orderFromRow({
      order_id: 'x',
      order_no: 12,
      member_name: 'Riya',
      lines: [{ productId: 'p', optionId: 'choc', name: 'Whey · Chocolate', qty: 2, unitPriceP: 249_900 }],
      total_p: 499_800,
      status: 'ready',
      cancelled_by: null,
      created_at: '2026-10-12T04:30:00+00:00',
      updated_at: '2026-10-12T04:35:00+00:00',
    });
    expect(o.orderNo).toBe(12);
    expect(o.status).toBe('ready');
    expect(o.lines[0]).toEqual({ productId: 'p', optionId: 'choc', name: 'Whey · Chocolate', qty: 2, unitPriceP: 249_900 });
    expect(o.createdAt).toBe(Date.parse('2026-10-12T04:30:00Z'));
  });
});

describe('error words', () => {
  it('maps every server code to plain English, never the raw code', () => {
    const cases: [unknown, string][] = [
      [{ message: 'BAD_KEY', code: 'P0001' }, 'BAD_KEY'],
      [{ message: 'GONE' }, 'GONE'],
      [{ message: 'BAD_STEP' }, 'BAD_STEP'],
      [{ message: 'EMPTY' }, 'EMPTY'],
      [{ message: 'BAD_OPTIONS' }, 'BAD_OPTIONS'],
      [{ message: 'BUSY' }, 'BUSY'],
      [new Error('TypeError: Failed to fetch'), 'OFFLINE'],
      [new Error('timed out'), 'OFFLINE'],
      [{ message: 'new row for relation "shop_products" violates check constraint' }, 'INVALID'],
      [{ message: 'something odd' }, 'UNKNOWN'],
    ];
    for (const [err, code] of cases) {
      expect(errorCode(err)).toBe(code);
      const words = errorWords(err);
      expect(words).not.toMatch(/BAD_|GONE|BUSY|EMPTY|constraint|P0001/);
      expect(words.length).toBeGreaterThan(10);
    }
  });

  it('does not mistake a word inside another word for a code', () => {
    expect(errorCode({ message: 'GONE_FISHING' })).toBe('UNKNOWN');
  });
});

describe('time ago', () => {
  it('reads like a person would say it', () => {
    expect(timeAgo(T0 - 10_000, T0)).toBe('just now');
    expect(timeAgo(T0 - 2 * 60_000, T0)).toBe('2 min ago');
    expect(timeAgo(T0 - 3 * 3_600_000, T0)).toBe('3 hours ago');
    expect(timeAgo(new Date(2026, 9, 11, 21, 0).getTime(), T0)).toBe('yesterday');
    expect(timeAgo(new Date(2026, 9, 7, 9, 0).getTime(), T0)).toBe('5 days ago');
    expect(timeAgo(0, T0)).toBe('');
  });
});

describe('stored cloud gym', () => {
  it('writes, reads back and clears the owner key', () => {
    const s = memoryStore();
    expect(readCloudGym(s)).toBeNull();
    const gym = { gymId: 'g', ownerKey: 'a'.repeat(48), joinCode: 'AB12CD', name: 'Iron Temple Fitness', demo: true };
    writeCloudGym(gym, s);
    expect(readCloudGym(s)).toEqual(gym);
    clearCloudGym(s);
    expect(readCloudGym(s)).toBeNull();
  });

  it('treats a damaged entry as no gym rather than crashing', () => {
    const s = memoryStore();
    s.setItem(CLOUD_GYM_KEY, '{not json');
    expect(readCloudGym(s)).toBeNull();
    s.setItem(CLOUD_GYM_KEY, JSON.stringify({ gymId: 'g', ownerKey: 'short' }));
    expect(readCloudGym(s)).toBeNull();
  });
});
