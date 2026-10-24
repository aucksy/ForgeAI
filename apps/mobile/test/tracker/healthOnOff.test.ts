/**
 * Owner, 24 Oct 2026: Health Connect "was just on and off". Two ways the row lied:
 *  1. Health Connect has a switch for each kind of data. With workouts allowed and calories not,
 *     the old check (both or nothing) said Off / "Connect" while Health Connect listed ForgeAI as
 *     allowed — and every send failed, so nothing arrived either.
 *  2. Any error asking Health Connect read as "not allowed": the row flipped to Off, then back
 *     to On at the next look.
 * Each test below fails on the code before the fix.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  status: 'available' as 'available' | 'update' | 'unavailable',
  access: { exercise: true, calories: true } as { exercise: boolean; calories: boolean } | null,
  accessFails: 0,
  hasAccessFn: true,
  granted: true,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));
vi.mock('@/onboarding/db/dataActions', () => ({ isDemoData: async () => false }));
vi.mock('@/db', () => ({ getDb: () => ({ getAllAsync: async () => [], getFirstAsync: async () => null }) }));
vi.mock('@/tracker/phone/native', () => ({
  phoneNative: () => ({
    healthStatus: () => h.status,
    healthGranted: async () => h.granted,
    ...(h.hasAccessFn
      ? {
          healthAccess: async () => {
            if (h.accessFails > 0) {
              h.accessFails -= 1;
              throw new Error('Health Connect busy');
            }
            return h.access;
          },
        }
      : {}),
  }),
}));

import { healthCheck, healthCheckFrom, healthState, pastSendAsk, type HealthCheck } from '@/tracker/phone/healthConnect';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

const both = { exercise: true, calories: true };
const on: HealthCheck = { state: 'on', calories: true };

describe('healthCheckFrom (pure)', () => {
  it('workouts allowed, calories refused: still on (before: Off, as if nothing was allowed)', () => {
    expect(healthCheckFrom({ status: 'available', access: { exercise: true, calories: false }, sending: true }, null)).toEqual({ state: 'on', calories: false });
    expect(healthCheckFrom({ status: 'available', access: { exercise: true, calories: false }, sending: false }, null)).toEqual({ state: 'allowed', calories: false });
  });
  it('workouts not allowed: off, whatever calories say', () => {
    expect(healthCheckFrom({ status: 'available', access: { exercise: false, calories: true }, sending: true }, on).state).toBe('off');
    expect(healthCheckFrom({ status: 'available', access: { exercise: false, calories: false }, sending: true }, on).state).toBe('off');
  });
  it('both allowed: on when sending is chosen, "Turn on" when it is not', () => {
    expect(healthCheckFrom({ status: 'available', access: both, sending: true }, null)).toEqual({ state: 'on', calories: true });
    expect(healthCheckFrom({ status: 'available', access: both, sending: false }, null).state).toBe('allowed');
  });
  it('a passing error keeps what the row showed: never flips On to Off by itself', () => {
    expect(healthCheckFrom({ status: 'available', access: 'error', sending: true }, on)).toBe(on);
    const allowed: HealthCheck = { state: 'allowed', calories: false };
    expect(healthCheckFrom({ status: 'available', access: 'error', sending: true }, allowed)).toBe(allowed);
  });
  it('an error on the very first look (nothing to keep) says Off, not On', () => {
    expect(healthCheckFrom({ status: 'available', access: 'error', sending: true }, null).state).toBe('off');
    expect(healthCheckFrom({ status: 'available', access: 'error', sending: true }, { state: 'update', calories: false }).state).toBe('off');
  });
  it('Health Connect missing or old wins over everything', () => {
    expect(healthCheckFrom({ status: 'update' }, on).state).toBe('update');
    expect(healthCheckFrom({ status: 'unavailable' }, on).state).toBe('unavailable');
    expect(healthCheckFrom({ status: 'none' }, on).state).toBe('none');
  });
});

describe('healthCheck (what Settings shows)', () => {
  beforeEach(async () => {
    h.status = 'available';
    h.access = { ...both };
    h.accessFails = 0;
    h.hasAccessFn = true;
    h.granted = true;
    usePhonePrefs.setState({ healthConnect: true });
    // Start each test from a known last look.
    await healthCheck();
  });

  it('calories switched off in Health Connect: On, without calories', async () => {
    h.access = { exercise: true, calories: false };
    expect(await healthCheck()).toEqual({ state: 'on', calories: false });
    expect(await healthState()).toBe('on');
  });

  it('Health Connect busy for one look: the row stays On (before: Off, then On again)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.accessFails = 1;
    expect(await healthState()).toBe('on');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('access really taken away in Health Connect: Off at the next look', async () => {
    h.access = { exercise: false, calories: false };
    expect(await healthState()).toBe('off');
  });

  it('access back (allowed in Health Connect itself): On again, with the choice kept', async () => {
    h.access = { exercise: false, calories: false };
    await healthCheck();
    h.access = { ...both };
    expect(await healthState()).toBe('on');
    expect(usePhonePrefs.getState().healthConnect).toBe(true);
  });

  it('an older build without the per-switch check still works (both or nothing)', async () => {
    h.hasAccessFn = false;
    h.granted = false;
    expect(await healthState()).toBe('off');
    h.granted = true;
    expect(await healthCheck()).toEqual({ state: 'on', calories: true });
  });
});

describe('pastSendAsk with calories refused', () => {
  it('does not promise calories it cannot send', () => {
    const s = { count: 3, firstISO: '2026-10-01', lastISO: '2026-10-20', demo: false };
    const yes = pastSendAsk(s, '2026-10-24');
    const no = pastSendAsk(s, '2026-10-24', false);
    expect('body' in yes && yes.body).toContain('calories');
    expect('body' in no && no.body).not.toContain('calories');
    expect('body' in no && no.body).toContain('each with its time.');
  });
});
