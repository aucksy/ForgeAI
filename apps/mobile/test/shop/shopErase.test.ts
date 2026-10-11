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

import { eraseDeviceData } from '@/onboarding/eraseDevice';
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
});
