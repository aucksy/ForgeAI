/**
 * S2 — the gym shop's store on the phone (src/shop/gymStore.ts): the link and bag survive in
 * phone storage, the bag works against the gym's own list, and unlink forgets everything.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));

import { productsFromRows } from '@/shop/gym';
import { GYM_SHOP_STORAGE_KEY, shopModeOf, useGymShop } from '@/shop/gymStore';

const LINK = { memberKey: 'k'.repeat(48), memberId: 'm1', gymId: 'g1', gymName: 'Iron Temple Fitness', joinCode: 'IRON01', name: 'Asha' };
const LIST = productsFromRows([
  { product_id: 'shaker', name: 'Shaker bottle 700 ml', category: 'gear', price_p: 39900, options: [], stock: 2, active: true, art_kind: 'shaker', art_tint: '#E8661F' },
]);

describe('gym shop store', () => {
  beforeEach(() => {
    useGymShop.getState().unlink(null);
    mem.clear();
  });

  it('joins, takes the list, and fills the bag only within stock', () => {
    useGymShop.getState().setLink(LINK);
    expect(shopModeOf(useGymShop.getState())).toBe('gym');
    expect(useGymShop.getState().add('shaker', null, 1)).toBe(0); // no list yet: nothing to add
    useGymShop.getState().setProducts(LIST, '2026-10-12T09:00:00Z');
    expect(useGymShop.getState().add('shaker', null, 5)).toBe(2);
    expect(useGymShop.getState().bag).toEqual([{ productId: 'shaker', optionId: null, qty: 2 }]);
  });

  it('keeps the key, list and bag in phone storage (not the sample flag)', async () => {
    useGymShop.getState().setLink(LINK);
    useGymShop.getState().setProducts(LIST, '2026-10-12T09:00:00Z');
    useGymShop.getState().add('shaker', null, 1);
    useGymShop.getState().setSampleOpen(true);
    await new Promise((r) => setTimeout(r, 0));
    const saved = JSON.parse(mem.get(GYM_SHOP_STORAGE_KEY) ?? '{}');
    expect(saved.state.link).toEqual(LINK);
    expect(saved.state.bag).toEqual([{ productId: 'shaker', optionId: null, qty: 1 }]);
    expect(saved.state.products).toHaveLength(1);
    expect(saved.state.sampleOpen).toBeUndefined();
  });

  it('reads a saved blob back, and a damaged one as nothing', async () => {
    mem.set(GYM_SHOP_STORAGE_KEY, JSON.stringify({ state: { link: LINK, products: LIST, productsAt: 'x', orders: [], bag: [] }, version: 1 }));
    await useGymShop.persist.rehydrate();
    expect(useGymShop.getState().link).toEqual(LINK);
    expect(useGymShop.getState().products).toEqual(LIST);
    mem.set(GYM_SHOP_STORAGE_KEY, JSON.stringify({ state: { link: { memberKey: 7 }, products: 'junk', bag: [null] }, version: 1 }));
    await useGymShop.persist.rehydrate();
    expect(useGymShop.getState().link).toBeNull();
    expect(useGymShop.getState().products).toEqual([]);
    mem.set(GYM_SHOP_STORAGE_KEY, '{not json');
    await useGymShop.persist.rehydrate();
    expect(useGymShop.getState().link).toBeNull();
  });

  it('unlink forgets the gym, its lists and the bag, with a note for the join card', () => {
    useGymShop.getState().setLink(LINK);
    useGymShop.getState().setProducts(LIST, '2026-10-12T09:00:00Z');
    useGymShop.getState().add('shaker', null, 1);
    useGymShop.getState().unlink('This phone is no longer joined to the gym. Join again with its code.');
    const s = useGymShop.getState();
    expect(s.link).toBeNull();
    expect(s.products).toEqual([]);
    expect(s.bag).toEqual([]);
    expect(s.notice).toMatch(/no longer joined/);
    expect(shopModeOf(s)).toBe('sample');
  });
});
