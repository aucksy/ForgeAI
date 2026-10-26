/**
 * R-133: "Show my name on my gym's leaderboard" is a choice made for one gym: joining another gym,
 * leaving, or being let go starts it off again; and a backup neither carries it nor restores it.
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
vi.mock('@/theme/logoPrefetch', () => ({ prefetchGymLogo: () => undefined }));

const LINK = { memberKey: 'k'.repeat(48), memberId: 'm1', gymId: 'g1', gymName: 'Iron Temple Fitness', joinCode: 'IRON01', name: 'Asha' };
vi.mock('@/shop/gymApi', () => ({
  apiJoin: async () => ({ ok: true, data: LINK }),
  apiProducts: async () => ({ ok: false, error: { kind: 'offline' } }),
  apiOrders: async () => ({ ok: false, error: { kind: 'offline' } }),
  apiLeaveQuietly: async () => true,
  apiMe: async () => ({ ok: false, error: { kind: 'BAD_KEY' } }),
}));

import { SETTINGS_KEYS } from '@/backup/backupFormat';
import { FIELDS_LEFT_OUT } from '@/backup/backupCoverage';
import { joinGym, leaveGym, refreshGymNow } from '@/shop/gymActions';
import { useGymShop } from '@/shop/gymStore';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

const nameOn = () => usePhonePrefs.setState({ showNameOnBoard: true, boardNamePending: true });

describe('the name switch is per gym', () => {
  beforeEach(() => {
    mem.clear();
    useGymShop.getState().unlink(null);
    usePhonePrefs.setState({ showNameOnBoard: false, boardNamePending: false });
  });

  it('off by default', () => {
    expect(usePhonePrefs.getState().showNameOnBoard).toBe(false);
    expect(usePhonePrefs.getState().boardNamePending).toBe(false);
  });

  it('Leave puts it off, and forgets a change the old gym never heard', async () => {
    useGymShop.getState().setLink(LINK);
    nameOn();
    await leaveGym();
    expect(usePhonePrefs.getState().showNameOnBoard).toBe(false);
    expect(usePhonePrefs.getState().boardNamePending).toBe(false);
  });

  it('joining a gym starts it off, even if it was on', async () => {
    nameOn();
    expect(await joinGym('IRON01', 'Asha')).toBeNull();
    expect(usePhonePrefs.getState().showNameOnBoard).toBe(false);
    expect(usePhonePrefs.getState().boardNamePending).toBe(false);
  });

  it('a gym that no longer knows this phone puts it off too', async () => {
    useGymShop.getState().setLink(LINK);
    nameOn();
    await refreshGymNow();
    expect(useGymShop.getState().link).toBeNull();
    expect(usePhonePrefs.getState().showNameOnBoard).toBe(false);
  });
});

describe('the backup', () => {
  it('does not carry the name switch or its pending mark; both are left out on purpose, with a reason', () => {
    expect(SETTINGS_KEYS['forgeai-phone-prefs']).not.toContain('showNameOnBoard');
    expect(SETTINGS_KEYS['forgeai-phone-prefs']).not.toContain('boardNamePending');
    const left = FIELDS_LEFT_OUT['forgeai-phone-prefs'] ?? {};
    expect(left.showNameOnBoard).toBe('a privacy choice made per gym; asked again after a restore');
    expect(left.boardNamePending?.length).toBeGreaterThan(5);
  });
});
