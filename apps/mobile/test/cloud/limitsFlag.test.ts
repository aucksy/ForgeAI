/**
 * The free part of MettleUp Plus where it counts (F56, R-461; src/cloud/limitsFlag.ts) on a REAL database:
 * while the plan is switched off nothing is refused; on the free part the 8th own exercise and charts older
 * than 3 months are refused; the free month, a gym, staff and a purchase open everything; routines are never
 * limited any more (tracker #43's routine limit is gone).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemberAccess } from '@forgeai/theme';
import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

const h = vi.hoisted(() => ({ access: { all: true, why: 'off' } as MemberAccess, store: new Map<string, string>() }));

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

vi.mock('@/plan/memberPlanStore', () => ({ memberAccessNow: () => h.access }));
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

const FREE: MemberAccess = { all: false, why: 'free', trialEndedOn: '2026-12-01', gymEnded: null };

async function member(): Promise<typeof import('@/cloud/limitsFlag')> {
  await bootRealApp();
  await (await import('@/onboarding/db/dataActions')).completeOnboarding(MEMBER);
  return import('@/cloud/limitsFlag');
}

async function makeOwn(n: number): Promise<void> {
  const { createCustomExercise } = await import('@/tracker/db/customExercise');
  for (let i = 0; i < n; i++) {
    await createCustomExercise(
      { name: `My Move ${Math.random().toString(36).slice(2, 8)}`, logType: 'weight_reps', muscles: { primary: ['chest'], secondary: [] }, equipment: 'other', isCompound: false, incrementKg: 2.5, countsBodyweight: false },
      { uri: null, type: null },
    );
  }
}

beforeEach(() => {
  vi.resetModules();
  h.access = { all: true, why: 'off' };
});

describe('the free part on the phone', () => {
  it('switched off: ten own exercises and all-time charts, nothing refused', async () => {
    const f = await member();
    await makeOwn(10);
    expect(await f.reachedLimit('customExercises')).toBe(false);
    expect(await f.chartAllowed(null)).toBe(true);
  });

  it('the free part: 7 own exercises fit, the 8th is refused; library rows never count', async () => {
    h.access = FREE;
    const f = await member();
    await makeOwn(6);
    expect(await f.reachedLimit('customExercises')).toBe(false);
    await makeOwn(1);
    expect(await f.reachedLimit('customExercises')).toBe(true);
  });

  it('the free part: charts of 3 months fit; a year and all time do not', async () => {
    h.access = FREE;
    const f = await member();
    expect(await f.chartAllowed(1)).toBe(true);
    expect(await f.chartAllowed(3)).toBe(true);
    expect(await f.chartAllowed(12)).toBe(false);
    expect(await f.chartAllowed(null)).toBe(false);
  });

  it('the free month, a gym, staff and a purchase open everything', async () => {
    const f = await member();
    await makeOwn(9);
    for (const a of [
      { all: true, why: 'trial', daysLeft: 3, lastDay: '2026-12-01' },
      { all: true, why: 'gym', gymName: 'Iron Temple', endedOn: null, graceEndsOn: null },
      { all: true, why: 'staff', gymName: 'Iron Temple' },
      { all: true, why: 'bought', option: 'yearly' },
    ] as MemberAccess[]) {
      h.access = a;
      expect(await f.reachedLimit('customExercises')).toBe(false);
      expect(await f.chartAllowed(null)).toBe(true);
    }
  });
});
