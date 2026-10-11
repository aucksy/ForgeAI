import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));

import { cleanShopBlob, useShop } from '@/shop/shopStore';

describe('shop store', () => {
  beforeEach(() => {
    useShop.setState({ bag: [], orders: [] });
  });

  it('adds to the bag, places a demo order and empties the bag', () => {
    expect(useShop.getState().add('whey-1kg', 'chocolate', 2)).toBe(2);
    expect(useShop.getState().add('towel', null, 1)).toBe(1);
    const order = useShop.getState().placeOrder();
    expect(order?.demo).toBe(true);
    expect(order?.status).toBe('ordered');
    expect(order?.totalP).toBe(2 * 249900 + 29900);
    expect(useShop.getState().bag).toEqual([]);
    expect(useShop.getState().orders[0].id).toBe(order?.id);
  });

  it('will not add a sold-out product and places no empty order', () => {
    expect(useShop.getState().add('whey-isolate', 'chocolate', 1)).toBe(0);
    expect(useShop.getState().placeOrder()).toBeNull();
    expect(useShop.getState().orders).toEqual([]);
  });

  it('cancels an order', () => {
    useShop.getState().add('towel', null, 1);
    const o = useShop.getState().placeOrder();
    useShop.getState().cancelOrder(o!.id);
    expect(useShop.getState().orders[0].status).toBe('cancelled');
  });

  it('keeps the bag and orders in phone storage', async () => {
    useShop.getState().add('towel', null, 3);
    await new Promise((r) => setTimeout(r, 0));
    const saved = JSON.parse(mem.get('forgeai-shop') ?? '{}');
    expect(saved.state.bag).toEqual([{ productId: 'towel', optionId: null, qty: 3 }]);
  });

  it('drops damaged rows from storage', () => {
    expect(cleanShopBlob(null)).toEqual({ bag: [], orders: [] });
    expect(
      cleanShopBlob({
        bag: [{ productId: 'a', optionId: null, qty: 1 }, { productId: 'b', qty: 1 }, { productId: 'c', optionId: 'x', qty: 0 }, 'junk'],
        orders: [{ id: 'o', createdAt: 't', lines: [], totalP: 100 }, { id: 'bad' }],
      }),
    ).toEqual({ bag: [{ productId: 'a', optionId: null, qty: 1 }], orders: [{ id: 'o', createdAt: 't', lines: [], totalP: 100 }] });
  });
});
