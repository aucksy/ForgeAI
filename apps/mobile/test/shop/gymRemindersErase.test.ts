/**
 * R-86: Erase all data forgets the gym reminders' kept answers (and cancels them on Android).
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
import { GYM_REMINDER_STORAGE_KEYS, setGymNotificationsForTest } from '@/shop/gymReminders';

describe('Erase all data and the gym reminders', () => {
  it('removes every gym reminder key and cancels the set ones', async () => {
    const ids = new Set(['forgeai-gym-2026-10-30', 'forgeai-reminder-w0']);
    setGymNotificationsForTest({
      getAllScheduledNotificationsAsync: async () => [...ids].map((identifier) => ({ identifier })),
      cancelScheduledNotificationAsync: async (id: string) => void ids.delete(id),
    });
    for (const k of GYM_REMINDER_STORAGE_KEYS) mem.set(k, '{"x":1}');
    const failed = await eraseDeviceData();
    expect(failed).not.toContain('gym-shop');
    for (const k of GYM_REMINDER_STORAGE_KEYS) expect(mem.has(k)).toBe(false);
    expect([...ids]).toEqual(['forgeai-reminder-w0']);
  });
});
