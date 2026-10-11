import { describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));
// The other erase steps are not under test here; keep them light.
vi.mock('@/lib/keys', () => ({ setOpenAiKey: async () => {}, setAnthropicKey: async () => {}, setGroqKey: async () => {} }));
vi.mock('@/cloud/session', () => ({ signOutCloud: async () => {} }));
vi.mock('@/store/backupStore', () => ({ useBackup: { getState: () => ({ unlinkGoogle: async () => {} }) } }));
// S2: the gym's server is told the key is retired — never really called from a unit test.
const leave = vi.fn(async (_key: string) => {});
vi.mock('@/shop/gymApi', () => ({ apiLeaveQuietly: (key: string) => leave(key) }));

import { eraseDeviceData } from '@/onboarding/eraseDevice';
import { GYM_SHOP_STORAGE_KEY, useGymShop } from '@/shop/gymStore';
import { useShop } from '@/shop/shopStore';

describe('Erase all data', () => {
  it('empties the bag and the orders', async () => {
    useShop.getState().add('towel', null, 1);
    useShop.getState().placeOrder();
    useShop.getState().add('shaker', 'black', 2);
    expect(useShop.getState().orders).toHaveLength(1);

    const failed = await eraseDeviceData();

    expect(failed).not.toContain('shop');
    expect(useShop.getState().bag).toEqual([]);
    expect(useShop.getState().orders).toEqual([]);
    expect(mem.has('forgeai-shop')).toBe(false);
  });

  it('forgets the gym shop (key, list, bag) and retires the key on the server', async () => {
    useGymShop.getState().setLink({ memberKey: 'secret-key', memberId: 'm', gymId: 'g', gymName: 'Iron Temple Fitness', joinCode: 'IRON01', name: 'Asha' });
    useGymShop.getState().setBag([{ productId: 'p', optionId: null, qty: 1 }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(mem.has(GYM_SHOP_STORAGE_KEY)).toBe(true);

    const failed = await eraseDeviceData();

    expect(failed).not.toContain('gym-shop');
    expect(useGymShop.getState().link).toBeNull();
    expect(useGymShop.getState().bag).toEqual([]);
    expect(mem.has(GYM_SHOP_STORAGE_KEY)).toBe(false);
    expect(leave).toHaveBeenCalledWith('secret-key');
  });
});
