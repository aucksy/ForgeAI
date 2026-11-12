/**
 * F56 MettleUp Plus, the gym owner's switch (R-461): reading the server's answer, the default (ON, owner's "A"),
 * the words, and the card staying hidden until the server has 0070.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.fn();
vi.mock('../../src/crm/shop/api', () => ({ call: (...a: unknown[]) => callMock(...a) }));
vi.mock('../../src/lib/demoLock', () => ({ isDemoLocked: () => false }));

import { GYM_LOCK_AFTER_END_DEFAULT, GYM_UNLOCK_GRACE_DAYS } from '@forgeai/theme';
import { PLUS_LOCK_WORDS, plusLockChangedLine, plusLockFrom } from '../../src/crm/logic/plusLock';
import { getPlusLock, plusLockServer, resetPlusLockServerForTest, savePlusLock } from '../../src/crm/shop/plusLockApi';

beforeEach(() => {
  callMock.mockReset();
  resetPlusLockServerForTest();
});
afterEach(() => vi.restoreAllMocks());

describe('plusLockFrom', () => {
  it('reads a full answer', () => {
    expect(plusLockFrom({ ok: true, lockAfterEnd: false, canEdit: true, updatedAt: 1762905600000, updatedByName: ' Asha ' })).toEqual({
      lockAfterEnd: false,
      canEdit: true,
      updatedAt: 1762905600000,
      updatedByName: 'Asha',
    });
  });

  it('a missing or odd answer is the default (ON) and read-only', () => {
    expect(GYM_LOCK_AFTER_END_DEFAULT).toBe(true);
    for (const raw of [null, undefined, 'x', {}, { lockAfterEnd: 'false', canEdit: 'true', updatedAt: -1, updatedByName: '  ' }]) {
      expect(plusLockFrom(raw)).toEqual({ lockAfterEnd: true, canEdit: false, updatedAt: null, updatedByName: null });
    }
  });
});

describe('the words', () => {
  it('say the grace days and never say the data locks', () => {
    expect(PLUS_LOCK_WORDS.switchHint).toContain(`${GYM_UNLOCK_GRACE_DAYS} more days`);
    expect(PLUS_LOCK_WORDS.switchHint).toContain('never lose their workouts');
    expect(PLUS_LOCK_WORDS.savedOn).toContain(`${GYM_UNLOCK_GRACE_DAYS} days`);
    for (const v of Object.values(PLUS_LOCK_WORDS)) expect(v).not.toMatch(/\bOK\b/);
  });

  it('the last-changed line', () => {
    const day = () => '12 Nov 2026';
    expect(plusLockChangedLine(plusLockFrom({}), day)).toBeNull();
    expect(plusLockChangedLine(plusLockFrom({ updatedAt: 5, updatedByName: 'Asha' }), day)).toBe('Last changed by Asha on 12 Nov 2026.');
    expect(plusLockChangedLine(plusLockFrom({ updatedAt: 5 }), day)).toBe('Last changed on 12 Nov 2026.');
  });
});

describe('the calls', () => {
  it('reads and saves with the key', async () => {
    callMock.mockResolvedValueOnce({ ok: true, lockAfterEnd: true, canEdit: true });
    expect(await getPlusLock('k1')).toMatchObject({ lockAfterEnd: true, canEdit: true });
    expect(callMock).toHaveBeenLastCalledWith('owner_plus_lock', { p_key: 'k1' });
    expect(plusLockServer()).toBe('yes');

    callMock.mockResolvedValueOnce({ ok: true, lockAfterEnd: false, canEdit: true, updatedAt: 9, updatedByName: 'Owner' });
    expect(await savePlusLock('k1', false)).toMatchObject({ lockAfterEnd: false, updatedByName: 'Owner' });
    expect(callMock).toHaveBeenLastCalledWith('owner_save_plus_lock', { p_key: 'k1', p_on: false });
  });

  it('a server without 0070 hides the card, remembered, with no second call', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    callMock.mockRejectedValueOnce({ code: 'PGRST202', message: 'Could not find the function public.owner_plus_lock' });
    expect(await getPlusLock('k1')).toBe('missing');
    expect(plusLockServer()).toBe('no');
    expect(await getPlusLock('k1')).toBe('missing');
    expect(callMock).toHaveBeenCalledTimes(1);
  });

  it('no internet is not remembered', async () => {
    callMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    await expect(getPlusLock('k1')).rejects.toThrow('Failed to fetch');
    expect(plusLockServer()).toBe('unknown');
  });
});
