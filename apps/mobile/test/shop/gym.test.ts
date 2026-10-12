/**
 * S2 — the gym's real shop, the pure half (src/shop/gym.ts). The row fixtures are copies of what
 * the live server sent for the test gym (code FORGE1) on 12 Oct 2026, so the mapping is held to
 * the real shapes, not to a guess.
 */
import { describe, expect, it } from 'vitest';

import {
  onlyLeftText,
  stockLeftForKey,
  canCancelGymOrder,
  cancelErrorText,
  classifyRpcError,
  findLandedOrder,
  cleanGymBlob,
  cleanJoinCode,
  cleanMemberName,
  gymPayText,
  gymStatusBadge,
  gymStatusText,
  joinErrorText,
  lineKeyNamed,
  linkFromJoin,
  orderFromRow,
  orderLinesFor,
  orderPlacedText,
  ordersFromRows,
  photoUrlOf,
  placeFailure,
  productFromRow,
  productsFromRows,
  refreshErrorText,
  upsertOrder,
  visibleFlash,
} from '@/shop/gym';
import { addToBag, lineKey, priceBag } from '@/shop/money';
import type { BagLine, GymOrder } from '@/shop/types';

const WHEY_ROW = {
  product_id: '2ad4882a-994a-4c52-9467-a6158c8b797f',
  gym_id: '72d67a54-71bc-4b3c-be5e-df4d49c96bcf',
  name: 'Whey protein 1 kg',
  category: 'protein',
  description: '24 g protein a scoop. Mixes in water or milk.',
  price_p: 249900,
  option_name: 'Flavour',
  options: [
    { id: 'choc', tint: '#7A4A2A', label: 'Chocolate', stock: 12 },
    { id: 'van', tint: '#E9D8A6', label: 'Vanilla', stock: 8 },
    { id: 'str', tint: '#D9536F', label: 'Strawberry', stock: 0 },
  ],
  stock: 20,
  active: true,
  art_kind: 'tub',
  art_tint: '#7A4A2A',
  sort: 1,
  created_at: '2026-10-11T19:39:14.388922+00:00',
  updated_at: '2026-10-11T19:39:14.388922+00:00',
};

const SHAKER_ROW = {
  product_id: '39c1e4cc-eda8-4cef-ac68-f05fd4875755',
  gym_id: '72d67a54-71bc-4b3c-be5e-df4d49c96bcf',
  name: 'Shaker bottle 700 ml',
  category: 'gear',
  description: 'Leak-proof lid, mixing ball.',
  price_p: 39900,
  option_name: null,
  options: [],
  stock: 25,
  active: true,
  art_kind: 'shaker',
  art_tint: '#E8661F',
  sort: 7,
  created_at: '2026-10-11T19:39:14.388922+00:00',
  updated_at: '2026-10-11T19:39:14.388922+00:00',
};

const ORDER_ROW = {
  order_id: 'c5ea1d26-00dc-4be7-84e4-29de2beee953',
  gym_id: '72d67a54-71bc-4b3c-be5e-df4d49c96bcf',
  member_id: '0c3da4e8-3bfe-49f8-a6b8-e9e6116a5120',
  member_name: 'Smoke Test',
  order_no: 1,
  lines: [{ qty: 1, name: 'Shaker bottle 700 ml', optionId: null, productId: '39c1e4cc-eda8-4cef-ac68-f05fd4875755', unitPriceP: 39900 }],
  total_p: 39900,
  status: 'ordered',
  cancelled_by: null,
  created_at: '2026-10-11T19:51:09.585269+00:00',
  updated_at: '2026-10-11T19:51:09.585269+00:00',
};

const JOIN = {
  name: 'Smoke Test',
  gymId: '72d67a54-71bc-4b3c-be5e-df4d49c96bcf',
  gymName: 'ForgeAI Test Gym',
  joinCode: 'FORGE1',
  memberId: '0c3da4e8-3bfe-49f8-a6b8-e9e6116a5120',
  memberKey: '5badd76034e8ceaf0c1be1fbaaddb1a5d5c5ff352970eee6',
};

describe('the join code', () => {
  it('is capitals, letters and digits only, at most 6', () => {
    expect(cleanJoinCode('forge1')).toBe('FORGE1');
    expect(cleanJoinCode(' fo-rg e1 ')).toBe('FORGE1');
    expect(cleanJoinCode('FORGE12345')).toBe('FORGE1');
    expect(cleanJoinCode('')).toBe('');
    expect(cleanJoinCode('₹@#')).toBe('');
  });

  it('a name is tidied and kept within the server limit', () => {
    expect(cleanMemberName('  QA   Member ')).toBe('QA Member');
    expect(cleanMemberName('   ')).toBe('');
    expect(cleanMemberName('x'.repeat(90))).toHaveLength(60);
  });

  it('the join answer becomes the link; anything missing is no link', () => {
    expect(linkFromJoin(JOIN)).toEqual(JOIN);
    expect(linkFromJoin({ ...JOIN, memberKey: '' })).toBeNull();
    expect(linkFromJoin(null)).toBeNull();
    expect(linkFromJoin('junk')).toBeNull();
  });
});

describe('server rows → the app shapes', () => {
  it('a product with options maps snake_case onto the S1 Product', () => {
    expect(productFromRow(WHEY_ROW)).toEqual({
      id: WHEY_ROW.product_id,
      name: 'Whey protein 1 kg',
      category: 'protein',
      description: '24 g protein a scoop. Mixes in water or milk.',
      priceP: 249900,
      optionName: 'Flavour',
      options: [
        { id: 'choc', label: 'Chocolate', stock: 12, tint: '#7A4A2A' },
        { id: 'van', label: 'Vanilla', stock: 8, tint: '#E9D8A6' },
        { id: 'str', label: 'Strawberry', stock: 0, tint: '#D9536F' },
      ],
      stock: 20,
      active: true,
      art: { kind: 'tub', tint: '#7A4A2A' },
    });
  });

  it('a plain product has no option name and keeps its own stock', () => {
    const p = productFromRow(SHAKER_ROW)!;
    expect(p.optionName).toBeUndefined();
    expect(p.options).toEqual([]);
    expect(p.stock).toBe(25);
    expect(p.art).toEqual({ kind: 'shaker', tint: '#E8661F' });
  });

  it('an option with its own price keeps it; the stock follows the options', () => {
    const p = productFromRow({ ...WHEY_ROW, stock: 999, options: [{ id: 'a', label: 'Big', stock: 3, priceP: 299900 }, { id: 'b', label: 'Small', stock: '2' }] })!;
    expect(p.options[0].priceP).toBe(299900);
    expect(p.options[1].stock).toBe(2);
    expect(p.stock).toBe(5);
  });

  it('odd values fall back instead of breaking the shop', () => {
    const p = productFromRow({ ...SHAKER_ROW, category: 'snacks', art_kind: 'rocket', art_tint: 'orange', description: null, stock: -4 })!;
    expect(p.category).toBe('gear');
    expect(p.art).toEqual({ kind: 'tub', tint: '#E8661F' });
    expect(p.description).toBe('');
    expect(p.stock).toBe(0);
    // Damaged options are dropped, a repeated id keeps its first.
    const q = productFromRow({ ...WHEY_ROW, options: [{ id: 'a', label: 'A', stock: 1 }, { id: 'a', label: 'A2', stock: 1 }, { label: 'no id' }, 'junk'] })!;
    expect(q.options.map((o) => o.label)).toEqual(['A']);
  });

  it('a row with no id, no name or no price is not a product', () => {
    expect(productFromRow({ ...SHAKER_ROW, product_id: null })).toBeNull();
    expect(productFromRow({ ...SHAKER_ROW, name: '  ' })).toBeNull();
    expect(productFromRow({ ...SHAKER_ROW, price_p: 0 })).toBeNull();
    expect(productFromRow(42)).toBeNull();
  });

  it('the list keeps the server order and drops unusable or inactive rows', () => {
    const list = productsFromRows([WHEY_ROW, { junk: true }, { ...SHAKER_ROW, product_id: 'off', active: false }, SHAKER_ROW]);
    expect(list.map((p) => p.name)).toEqual(['Whey protein 1 kg', 'Shaker bottle 700 ml']);
    expect(productsFromRows(null)).toEqual([]);
  });

  it('an order row becomes the order view', () => {
    expect(orderFromRow(ORDER_ROW)).toEqual({
      id: ORDER_ROW.order_id,
      orderNo: 1,
      createdAt: ORDER_ROW.created_at,
      updatedAt: ORDER_ROW.updated_at,
      lines: [{ productId: SHAKER_ROW.product_id, optionId: null, name: 'Shaker bottle 700 ml', qty: 1, unitPriceP: 39900 }],
      totalP: 39900,
      status: 'ordered',
      cancelledBy: null,
    });
    expect(orderFromRow({ ...ORDER_ROW, status: 'cancelled', cancelled_by: 'gym' })?.cancelledBy).toBe('gym');
    // "cancelled_by" means nothing on a live order.
    expect(orderFromRow({ ...ORDER_ROW, cancelled_by: 'gym' })?.cancelledBy).toBeNull();
    expect(orderFromRow({ ...ORDER_ROW, order_id: undefined })).toBeNull();
  });

  it('orders come newest first, and one order replaces its old copy', () => {
    const older = { ...ORDER_ROW, order_id: 'o1', order_no: 1, created_at: '2026-10-11T10:00:00Z' };
    const newer = { ...ORDER_ROW, order_id: 'o2', order_no: 2, created_at: '2026-10-12T10:00:00Z' };
    const list = ordersFromRows([older, newer, 'junk']);
    expect(list.map((o) => o.orderNo)).toEqual([2, 1]);
    const ready = { ...list[1], status: 'ready' as const };
    const next = upsertOrder(list, ready);
    expect(next).toHaveLength(2);
    expect(next[1].status).toBe('ready');
  });
});

describe('product photos (0004_product_photos.sql)', () => {
  const PHOTO = 'https://hdxzqbdiokjklnypfisq.supabase.co/storage/v1/object/public/product-photos/' + 'a'.repeat(48) + '/shaker.jpg';

  it('an https photo link becomes imageUrl', () => {
    expect(productFromRow({ ...SHAKER_ROW, image_url: PHOTO })?.imageUrl).toBe(PHOTO);
  });

  it('no photo, or anything but an https link, is no photo (the drawing shows)', () => {
    for (const bad of [null, undefined, '', 42, 'http://example.com/a.jpg', 'javascript:alert(1)', 'file:///sdcard/x.jpg', 'data:image/png;base64,AAAA', 'https://', 'https://host/a b.jpg', 'https://x.supabase.co/' + 'a'.repeat(400)]) {
      const p = productFromRow({ ...SHAKER_ROW, image_url: bad })!;
      expect(p).not.toBeNull();
      expect(p.imageUrl).toBeUndefined();
      expect('imageUrl' in p).toBe(false);
    }
    expect(photoUrlOf('  ' + PHOTO + ' ')).toBe(PHOTO);
  });

  it('a list saved before photos loads, and a saved photo survives a restart', () => {
    const old = productsFromRows([SHAKER_ROW]).map((p) => JSON.parse(JSON.stringify(p)));
    expect(old[0].imageUrl).toBeUndefined();
    const kept = cleanGymBlob({ link: JOIN, products: old, productsAt: null, orders: [], bag: [] });
    expect(kept.products).toHaveLength(1);
    expect(kept.products[0].imageUrl).toBeUndefined();
    const withPhoto = productsFromRows([{ ...SHAKER_ROW, image_url: PHOTO }]);
    const back = cleanGymBlob(JSON.parse(JSON.stringify({ link: JOIN, products: withPhoto, productsAt: null, orders: [], bag: [] })));
    expect(back.products[0].imageUrl).toBe(PHOTO);
    // A damaged saved link is dropped, the product stays.
    const bent = cleanGymBlob({ link: JOIN, products: [{ ...old[0], imageUrl: 'http://x.y/z.jpg' }], productsAt: null, orders: [], bag: [] });
    expect(bent.products[0].imageUrl).toBeUndefined();
  });
});

describe('errors → words', () => {
  it('reads the server codes the way the live server sends them', () => {
    expect(classifyRpcError({ code: 'P0001', details: null, hint: null, message: 'INVALID_CODE' }, 400)).toEqual({ kind: 'INVALID_CODE' });
    expect(classifyRpcError({ message: 'SOLD_OUT:Whey protein 1 kg · Strawberry' }, 400)).toEqual({ kind: 'SOLD_OUT', name: 'Whey protein 1 kg · Strawberry' });
    expect(classifyRpcError({ message: 'GONE' }, 400)).toEqual({ kind: 'GONE' });
    expect(classifyRpcError({ message: 'BAD_KEY' }, 400)).toEqual({ kind: 'BAD_KEY' });
    expect(classifyRpcError({ message: 'TOO_LATE' }, 400)).toEqual({ kind: 'TOO_LATE' });
    expect(classifyRpcError({ message: 'BUSY' }, 400)).toEqual({ kind: 'BUSY' });
    expect(classifyRpcError({ message: 'EMPTY' }, 400)).toEqual({ kind: 'EMPTY' });
  });

  it('no internet, and the app giving up waiting, are told apart from the server', () => {
    // Node's and React Native's fetch failures, as the client wraps them (status 0).
    expect(classifyRpcError({ message: 'TypeError: fetch failed', hint: '', code: '' }, 0)).toEqual({ kind: 'offline' });
    expect(classifyRpcError({ message: 'TypeError: Network request failed' }, 0)).toEqual({ kind: 'offline' });
    expect(classifyRpcError({ message: 'AbortError: This operation was aborted', hint: 'Request was aborted (timeout or manual cancellation)' }, 0)).toEqual({ kind: 'timeout' });
    expect(classifyRpcError({ message: 'permission denied for function' }, 401)).toEqual({ kind: 'other' });
    expect(classifyRpcError(undefined)).toEqual({ kind: 'other' });
  });

  it('a failed join is said in words', () => {
    expect(joinErrorText({ kind: 'INVALID_CODE' })).toBe("That code didn't match a gym. Check it with the front desk.");
    expect(joinErrorText({ kind: 'offline' })).toBe("No internet. Try again when you're online.");
    expect(joinErrorText({ kind: 'other' })).toMatch(/Try again/);
  });

  it('a failed refresh says the last list is showing when there is one', () => {
    expect(refreshErrorText({ kind: 'offline' }, true)).toBe("Couldn't refresh — showing the last list.");
    expect(refreshErrorText({ kind: 'offline' }, false)).toBe("No internet. Try again when you're online.");
  });

  it('a cancel that came too late says why', () => {
    expect(cancelErrorText({ kind: 'TOO_LATE' })).toMatch(/can no longer be cancelled here/);
  });
});

describe('the bag against the live list', () => {
  const whey = productFromRow(WHEY_ROW)!;
  const shaker = productFromRow(SHAKER_ROW)!;
  const live = [whey, shaker];

  it('sold-out options cannot go in the bag', () => {
    expect(addToBag([], live, whey.id, 'str', 1).added).toBe(0);
    expect(addToBag([], live, whey.id, 'choc', 2).added).toBe(2);
    expect(addToBag([], live, shaker.id, null, 1).added).toBe(1);
  });

  it('only what can be ordered now is sent, each cut to the stock left', () => {
    const bag: BagLine[] = [
      { productId: shaker.id, optionId: null, qty: 2 },
      { productId: whey.id, optionId: 'van', qty: 9 }, // 8 left
      { productId: whey.id, optionId: 'str', qty: 1 }, // sold out
      { productId: 'gone-product', optionId: null, qty: 1 }, // no longer sold
    ];
    expect(orderLinesFor(bag, live)).toEqual([
      { productId: shaker.id, optionId: null, qty: 2 },
      { productId: whey.id, optionId: 'van', qty: 8 },
    ]);
    const priced = priceBag(bag, live);
    expect(priced.lines.map((l) => l.available)).toEqual([true, true, false, false]);
    expect(priced.totalP).toBe(2 * 39900 + 8 * 249900);
  });

  it('an empty or all-gone bag sends nothing', () => {
    expect(orderLinesFor([], live)).toEqual([]);
    expect(orderLinesFor([{ productId: 'x', optionId: null, qty: 1 }], live)).toEqual([]);
  });

  it('SOLD_OUT names the line to take out of the bag, option included', () => {
    const bag: BagLine[] = [
      { productId: shaker.id, optionId: null, qty: 1 },
      { productId: whey.id, optionId: 'choc', qty: 1 },
    ];
    expect(lineKeyNamed(bag, live, 'Whey protein 1 kg · Chocolate')).toBe(lineKey(whey.id, 'choc'));
    expect(lineKeyNamed(bag, live, 'shaker bottle 700 ml')).toBe(lineKey(shaker.id, null));
    expect(lineKeyNamed(bag, live, 'Something else')).toBeNull();
    const f = placeFailure({ kind: 'SOLD_OUT', name: 'Whey protein 1 kg · Chocolate' }, bag, live);
    expect(f).toEqual({ message: "Whey protein 1 kg · Chocolate just sold out. It's out of your bag now.", removeKey: lineKey(whey.id, 'choc'), refresh: true });
  });

  it('GONE refreshes the shop; no internet keeps the bag and says so', () => {
    expect(placeFailure({ kind: 'GONE' }, [], live)).toEqual({ message: 'Something in your bag is no longer sold. We refreshed the shop.', removeKey: null, refresh: true });
    const off = placeFailure({ kind: 'offline' }, [], live);
    expect(off.removeKey).toBeNull();
    expect(off.refresh).toBe(false);
    expect(off.message).toMatch(/No internet\. Your bag is kept/);
  });
});

describe('an order call the app stopped waiting for', () => {
  const sent = [{ productId: SHAKER_ROW.product_id, optionId: null, qty: 1 }];
  const old = orderFromRow({ ...ORDER_ROW, order_id: 'old' })!;
  const landed = orderFromRow({ ...ORDER_ROW, order_id: 'new', order_no: 2 })!;

  it('finds the new Ordered order with exactly the sent lines', () => {
    expect(findLandedOrder(['old'], [landed, old], sent)?.id).toBe('new');
  });

  it('finds nothing when no new order matches (the call really failed)', () => {
    expect(findLandedOrder(['old'], [old], sent)).toBeNull();
    expect(findLandedOrder(['old'], [landed], [{ ...sent[0], qty: 2 }])).toBeNull();
    expect(findLandedOrder(['old'], [{ ...landed, status: 'cancelled' }], sent)).toBeNull();
    expect(findLandedOrder(['old', 'new'], [landed], sent)).toBeNull();
  });
});

describe('order words', () => {
  const o = (status: GymOrder['status'], cancelledBy: GymOrder['cancelledBy'] = null) => ({ status, cancelledBy });

  it('each status in a sentence that adds to the pill', () => {
    expect(gymStatusText(o('ordered'))).toBe('The gym is getting it ready');
    expect(gymStatusText(o('ready'))).toBe('Collect it at the desk');
    expect(gymStatusText(o('collected'))).toBeNull();
    expect(gymStatusText(o('cancelled', 'member'))).toBe('You cancelled this order');
    expect(gymStatusText(o('cancelled', 'gym'))).toBe('The gym cancelled this order');
    expect(gymStatusBadge(o('ready'))).toBe('Ready');
  });

  it('the sentence never repeats the pill word (the owner saw "Ordered" twice on one card)', () => {
    for (const status of ['ordered', 'ready', 'collected', 'cancelled'] as const) {
      for (const by of ['member', 'gym', null] as const) {
        const pill = gymStatusBadge(o(status, by)).toLowerCase();
        const line = (gymStatusText(o(status, by)) ?? '').toLowerCase();
        // "Ordered — the gym is…", "Cancelled by you": the pill's word again at the head. (Who
        // cancelled is new information, so "You cancelled this order" is fine.)
        expect(line.startsWith(pill), `${status}/${by}: "${line}"`).toBe(false);
      }
    }
  });

  it('the pay line shows only while the order is still to be collected', () => {
    expect(gymPayText(o('ordered'))).toBe('Pay at the desk when you collect it.');
    expect(gymPayText(o('ready'))).toBe('Pay when you collect it.');
    expect(gymPayText(o('collected'))).toBeNull();
    expect(gymPayText(o('cancelled'))).toBeNull();
  });

  it('the green "placed" line goes once its order is no longer Ordered', () => {
    const flash = { orderId: 'a', text: orderPlacedText(3) };
    expect(visibleFlash(flash, [{ id: 'a', status: 'ordered' }])).toBe(flash.text);
    expect(visibleFlash(flash, [{ id: 'a', status: 'cancelled' }])).toBeNull();
    expect(visibleFlash(flash, [{ id: 'a', status: 'ready' }])).toBeNull();
    expect(visibleFlash(flash, [{ id: 'b', status: 'ordered' }])).toBeNull();
    expect(visibleFlash(null, [{ id: 'a', status: 'ordered' }])).toBeNull();
  });

  it('the member cancels only while Ordered', () => {
    expect(canCancelGymOrder(o('ordered'))).toBe(true);
    expect(canCancelGymOrder(o('ready'))).toBe(false);
    expect(canCancelGymOrder(o('collected'))).toBe(false);
    expect(canCancelGymOrder(o('cancelled'))).toBe(false);
  });

  it('the placed line says to pay at the desk', () => {
    expect(orderPlacedText(12)).toBe('Order 12 placed. Pay at the desk when you collect it.');
  });
});

describe('what the phone kept', () => {
  it('a good blob comes back whole', () => {
    const products = productsFromRows([WHEY_ROW, SHAKER_ROW]);
    const orders = ordersFromRows([ORDER_ROW]);
    const bag: BagLine[] = [{ productId: SHAKER_ROW.product_id, optionId: null, qty: 1 }];
    const blob = { link: JOIN, products, productsAt: '2026-10-12T09:00:00Z', orders, bag };
    // Through JSON, as AsyncStorage keeps it.
    expect(cleanGymBlob(JSON.parse(JSON.stringify(blob)))).toEqual(blob);
  });

  it('a damaged blob never crashes, and keeps what is still good', () => {
    for (const junk of [null, undefined, 42, 'x', [], { link: 'x' }, { link: { memberKey: 1 } }]) {
      expect(cleanGymBlob(junk)).toEqual({ link: null, products: [], productsAt: null, orders: [], bag: [] });
    }
    const half = cleanGymBlob({
      link: JOIN,
      products: [{ id: 'p', name: 'Towel', priceP: 29900, art: { kind: 'towel', tint: '#2F7D6D' }, options: 'junk' }, { id: 'bad' }, null],
      productsAt: 7,
      orders: [{ id: 'o' }, 'junk'],
      bag: [{ productId: 'p', optionId: null, qty: 1 }, { productId: 'p', qty: 1 }, { productId: 'q', optionId: null, qty: 0 }],
    });
    expect(half.link).toEqual(JOIN);
    expect(half.products.map((p) => p.name)).toEqual(['Towel']);
    expect(half.products[0].options).toEqual([]);
    expect(half.productsAt).toBeNull();
    expect(half.orders).toEqual([]);
    expect(half.bag).toEqual([{ productId: 'p', optionId: null, qty: 1 }]);
  });

  it('no link means nothing else is kept', () => {
    expect(cleanGymBlob({ link: null, products: productsFromRows([SHAKER_ROW]), bag: [{ productId: 'p', optionId: null, qty: 1 }] }).products).toEqual([]);
  });
});

describe('order caps (0003)', () => {
  it('maps TOO_MANY and TOO_BIG to words and keeps the bag', () => {
    expect(classifyRpcError({ message: 'TOO_MANY' })).toEqual({ kind: 'TOO_MANY' });
    expect(classifyRpcError({ message: 'TOO_BIG' })).toEqual({ kind: 'TOO_BIG' });
    const many = placeFailure({ kind: 'TOO_MANY' }, [], []);
    expect(many.message).toMatch(/last hour/);
    expect(many.removeKey).toBeNull();
    expect(placeFailure({ kind: 'TOO_BIG' }, [], []).message).toMatch(/too big/);
  });
});

describe('sold out vs fewer left (review)', () => {
  const plain = { id: 'p1', name: 'Gym towel', category: 'gear', description: '', priceP: 29900, options: [], stock: 2, active: true, art: { kind: 'towel', tint: '#2F7D6D' } } as const;
  const opt = { ...plain, id: 'p2', name: 'Gloves', stock: 1, options: [{ id: 'm', label: 'M', stock: 1 }, { id: 'l', label: 'L', stock: 0 }] } as const;
  const bag = [{ productId: 'p1', optionId: null, qty: 3 }, { productId: 'p2', optionId: 'm', qty: 2 }, { productId: 'p2', optionId: 'l', qty: 1 }];
  it('counts what is still for sale for a bag line', () => {
    const products = [plain, opt] as never;
    expect(stockLeftForKey(bag, products, 'p1::')).toBe(2);
    expect(stockLeftForKey(bag, products, 'p2::m')).toBe(1);
    expect(stockLeftForKey(bag, products, 'p2::l')).toBe(0);
    expect(stockLeftForKey(bag, products, 'nope::')).toBe(0);
    expect(stockLeftForKey(bag, [{ ...plain, active: false }] as never, 'p1::')).toBe(0);
  });
  it('says how many are left', () => {
    expect(onlyLeftText('Gym towel', 2)).toBe('Only 2 of Gym towel left now. Tap Place order again to get those 2.');
    expect(onlyLeftText('Gym towel', 1)).toMatch(/to get it\.$/);
  });
});
