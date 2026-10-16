/**
 * Audit C6-2 (S2): Leave or Erase with no signal must not leave the member's mobile number on the
 * gym's server for good. The member key is kept on the phone (only the key) until the gym confirms
 * the leave, sent again on the next start, and the member is told plainly.
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
vi.mock('@/lib/keys', () => ({ setOpenAiKey: async () => {}, setAnthropicKey: async () => {}, setGroqKey: async () => {} }));
vi.mock('@/cloud/session', () => ({ signOutCloud: async () => {} }));
vi.mock('@/store/backupStore', () => ({ useBackup: { getState: () => ({ unlinkGoogle: async () => {} }) } }));
vi.mock('@/theme/logoPrefetch', () => ({ prefetchGymLogo: () => undefined }));

/** The gym's answer to member_leave: true = done, false = no answer (offline). */
let online = false;
let hang = false;
const leaves: string[] = [];
vi.mock('@/shop/gymApi', () => ({
  apiLeaveQuietly: async (key: string) => {
    leaves.push(key);
    if (hang) return new Promise<boolean>(() => undefined);
    return online;
  },
  apiMe: async () => ({ ok: false, error: { kind: 'offline' } }),
}));

import { eraseDeviceData, eraseGymNote } from '@/onboarding/eraseDevice';
import { leaveGym, refreshGymNow } from '@/shop/gymActions';
import { useGymShop } from '@/shop/gymStore';
import { LEAVE_PENDING_STORAGE_KEY } from '@/shop/pendingLeave';

const LINK = { memberKey: 'secret-key-1', memberId: 'm', gymId: 'g', gymName: 'Iron Temple Fitness', joinCode: 'IRON01', name: 'Asha' };

describe('C6-2: a leave the gym never heard is sent again', () => {
  beforeEach(() => {
    useGymShop.getState().unlink(null);
    mem.clear();
    leaves.length = 0;
    online = false;
    hang = false;
  });

  it('Leave offline: the key is kept, the member is told, and the next start sends it', async () => {
    useGymShop.getState().setLink(LINK);
    await leaveGym();
    expect(useGymShop.getState().link).toBeNull();
    expect(leaves).toEqual(['secret-key-1']);
    expect(JSON.parse(mem.get(LEAVE_PENDING_STORAGE_KEY) ?? '[]')).toEqual(['secret-key-1']);
    expect(useGymShop.getState().notice).toMatch(/Iron Temple Fitness/);
    expect(useGymShop.getState().notice).toMatch(/next time the app is online/);

    // Next start, still offline: kept.
    await refreshGymNow();
    await vi.waitFor(() => expect(leaves).toEqual(['secret-key-1', 'secret-key-1']));
    expect(mem.has(LEAVE_PENDING_STORAGE_KEY)).toBe(true);

    // Next start, online: sent and forgotten.
    online = true;
    await refreshGymNow();
    await vi.waitFor(() => expect(mem.has(LEAVE_PENDING_STORAGE_KEY)).toBe(false));
    expect(leaves).toHaveLength(3);
  });

  it('Leave online: nothing kept, no warning', async () => {
    online = true;
    useGymShop.getState().setLink(LINK);
    await leaveGym();
    expect(leaves).toEqual(['secret-key-1']);
    expect(mem.has(LEAVE_PENDING_STORAGE_KEY)).toBe(false);
    expect(useGymShop.getState().notice).toBeNull();
  });

  it('Erase offline: everything goes except the one key, which is sent on the next start', async () => {
    useGymShop.getState().setLink(LINK);
    const failed = await eraseDeviceData();
    expect(failed).not.toContain('gym-shop');
    expect(useGymShop.getState().link).toBeNull();
    expect(JSON.parse(mem.get(LEAVE_PENDING_STORAGE_KEY) ?? '[]')).toEqual(['secret-key-1']);
    online = true;
    await refreshGymNow();
    await vi.waitFor(() => expect(mem.has(LEAVE_PENDING_STORAGE_KEY)).toBe(false));
  });

  it('start-up never waits on a leave retry the gym does not answer', async () => {
    mem.set(LEAVE_PENDING_STORAGE_KEY, JSON.stringify(['secret-key-1']));
    hang = true;
    const done = await Promise.race([refreshGymNow().then(() => 'done'), new Promise((r) => setTimeout(() => r('waited'), 200))]);
    expect(done).toBe('done');
  });

  it('the Erase confirm says the gym is told, now or once online', () => {
    expect(eraseGymNote(null)).toBe('');
    expect(eraseGymNote('Iron Temple Fitness')).toMatch(/Iron Temple Fitness/);
    expect(eraseGymNote('Iron Temple Fitness')).toMatch(/online/);
  });
});
