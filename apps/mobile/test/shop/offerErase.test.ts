/**
 * #49 step 2: Erase all data forgets the workout offer's consent record, a pending "Leave the
 * offer" and the kept card (the gym's own member_leave leaves its offers on the server).
 */
import { describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));
vi.mock('@/lib/keys', () => ({ setOpenAiKey: async () => {}, setAnthropicKey: async () => {}, setGroqKey: async () => {} }));
vi.mock('@/cloud/session', () => ({ signOutCloud: async () => {} }));
vi.mock('@/store/backupStore', () => ({ useBackup: { getState: () => ({ unlinkGoogle: async () => {} }) } }));
vi.mock('@/shop/gymApi', () => ({ apiLeaveQuietly: async () => true }));

import { eraseDeviceData } from '@/onboarding/eraseDevice';
import { OFFER_STORAGE_KEYS } from '@/shop/offer';

describe('Erase all data and the workout offer', () => {
  it('removes every offer key', async () => {
    for (const k of OFFER_STORAGE_KEYS) mem.set(k, '{"x":1}');
    const failed = await eraseDeviceData();
    expect(failed).not.toContain('gym-shop');
    for (const k of OFFER_STORAGE_KEYS) expect(mem.has(k)).toBe(false);
  });
});
