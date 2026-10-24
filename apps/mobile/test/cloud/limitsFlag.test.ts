/**
 * The free plan's switch on the phone (tracker #43, src/cloud/limitsFlag.ts) on a REAL database:
 * off at launch whatever the member has; once the server says on, the 5th routine and the 8th own
 * exercise are refused for a member in no gym, never for a gym member; a check never waits on the
 * internet, and offline it keeps the last answer without asking again on every tap.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
  link: null as null | { gymId: string },
  answer: { ok: true, data: { on: false, routines: 4, customExercises: 7, chartMonths: 3 } } as unknown,
  calls: 0,
}));

// AsyncStorage and the file system share one stub module (vitest.config.ts): both shapes here.
vi.mock('@react-native-async-storage/async-storage', () => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: async () => ({ exists: false, size: 0 }),
  deleteAsync: async () => undefined,
  readDirectoryAsync: async () => [],
  default: {
    getItem: async (k: string) => h.store.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      h.store.set(k, v);
    },
    removeItem: async (k: string) => {
      h.store.delete(k);
    },
  },
}));
vi.mock('@/cloud/config', () => ({ isCloudConfigured: () => true, isAccountBuild: () => true, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PROXY_URL: '', SUPABASE_KEY: 'k', CONSENT_VERSION: 'x' }));
vi.mock('@/cloud/copyApi', () => ({
  apiAppLimits: async () => {
    h.calls++;
    return h.answer;
  },
}));
vi.mock('@/shop/gymStore', () => ({
  useGymShop: {
    getState: () => ({ link: h.link }),
    persist: { hasHydrated: () => true, onFinishHydration: () => () => undefined },
  },
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: {}, isErrorWithCode: () => false, statusCodes: {} }));

const MEMBER: OnboardingInput = {
  name: 'Free Member',
  phoneE164: null,
  goal: 'general',
  experience: 'beginner',
  age: 25,
  heightCm: 170,
  gymName: '',
  bodyWeightKg: null,
  targets: { calorieTarget: 2200, proteinTargetG: 110, carbsTargetG: 280, fatTargetG: 70 },
};

let phoneDb: RealDb;

async function member(routines: number): Promise<typeof import('@/cloud/limitsFlag')> {
  phoneDb = await bootRealApp();
  await (await import('@/onboarding/db/dataActions')).completeOnboarding(MEMBER);
  const { createRoutine } = await import('@/tracker/db/routineRepo');
  for (let i = 0; i < routines; i++) await createRoutine({ name: `Routine ${i + 1}`, dayType: 'full', folderId: null });
  return import('@/cloud/limitsFlag');
}

const ON = { ok: true, data: { on: true, routines: 4, customExercises: 7, chartMonths: 3 } };

beforeEach(() => {
  vi.resetModules();
  h.store.clear();
  h.link = null;
  h.calls = 0;
  h.answer = { ok: true, data: { on: false, routines: 4, customExercises: 7, chartMonths: 3 } };
});

describe('the free plan on the phone', () => {
  it('OFF at launch: ten routines, nothing refused', async () => {
    const f = await member(10);
    expect(await f.reachedLimit('routines')).toBe(false);
    await f.useFreeLimits.getState().refresh();
    expect(await f.reachedLimit('routines')).toBe(false);
    expect(await f.chartAllowed(null)).toBe(true);
  });

  it('switched on: the 5th routine is refused for a member in no gym, never for a gym member', async () => {
    h.answer = ON;
    const f = await member(4);
    // The first check never waits on the internet: the launch rules, and a read starts behind it.
    expect(await f.reachedLimit('routines')).toBe(false);
    await f.useFreeLimits.getState().refresh();
    expect(await f.reachedLimit('routines')).toBe(true);
    expect(await f.chartAllowed(3)).toBe(true);
    expect(await f.chartAllowed(12)).toBe(false);
    h.link = { gymId: 'g1' };
    expect(await f.reachedLimit('routines')).toBe(false);
    expect(await f.chartAllowed(null)).toBe(true);
  });

  it('three routines: a fourth is still allowed', async () => {
    h.answer = ON;
    const f = await member(3);
    await f.useFreeLimits.getState().refresh();
    expect(await f.reachedLimit('routines')).toBe(false);
  });

  it('own exercises count only the ones the member made, never the library', async () => {
    h.answer = ON;
    const f = await member(0);
    await f.useFreeLimits.getState().refresh();
    const { createCustomExercise } = await import('@/tracker/db/customExercise');
    for (let i = 0; i < 6; i++) {
      await createCustomExercise(
        { name: `My Move ${i}`, logType: 'weight_reps', muscles: { primary: ['chest'], secondary: [] }, equipment: 'other', isCompound: false, incrementKg: 2.5, countsBodyweight: false },
        { uri: null, type: null },
      );
    }
    expect(await f.reachedLimit('customExercises')).toBe(false);
    await createCustomExercise(
      { name: 'My Move 7', logType: 'weight_reps', muscles: { primary: ['chest'], secondary: [] }, equipment: 'other', isCompound: false, incrementKg: 2.5, countsBodyweight: false },
      { uri: null, type: null },
    );
    expect(await f.reachedLimit('customExercises')).toBe(true);
  });

  it('the answer is kept on the phone; offline the last one stays and is not asked again every tap', async () => {
    h.answer = ON;
    let f = await member(4);
    await f.useFreeLimits.getState().refresh();
    expect(h.store.get(f.LIMITS_STORAGE_KEY)).toContain('"on":true');

    // A restart: the kept answer is used at once.
    await bootRealApp({ db: phoneDb });
    f = await import('@/cloud/limitsFlag');
    expect(await f.reachedLimit('routines')).toBe(true);

    // Offline: the read fails; the kept answer stays, and the next check does not ask again.
    h.answer = { ok: false, failure: 'offline' };
    const t = Date.now() + 13 * 3600_000;
    await f.useFreeLimits.getState().refresh(t);
    expect(f.useFreeLimits.getState().limits.on).toBe(true);
    const calls = h.calls;
    await f.useFreeLimits.getState().current(t + 60_000);
    expect(h.calls).toBe(calls);
  });

  it('a server without 0032 (not ready) means off', async () => {
    h.answer = { ok: false, failure: 'not-ready' };
    const f = await member(9);
    await f.useFreeLimits.getState().refresh();
    expect(await f.reachedLimit('routines')).toBe(false);
  });
});
