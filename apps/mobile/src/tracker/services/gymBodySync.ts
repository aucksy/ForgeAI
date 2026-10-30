/**
 * Measurements the gym's trainer took and the gym's diet plans (R-120, 24 Oct 2026): asked from the
 * gym and kept on the phone, the way the gym's workout plans "appear by themselves"
 * (gymPlansSync.ts). Asked when the Body page or the Gym tab opens, at most every 10 minutes (a pull
 * to refresh or the diet page can ask sooner). Kept in AsyncStorage, so both still show offline after
 * the first answer. Offline, an older server (no 0035) or a "see the desk" answer change nothing.
 * Rules (who wins on a day, what stays after leaving): shop/gymBody.ts. Never throws.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { hasFeature } from '@forgeai/theme';

import { apiGymDiets, apiGymMeasures } from '@/shop/gymApi';
import {
  parseGymDietsCopy,
  parseGymMeasuresStore,
  withGymAnswer,
  type GymDietsCopy,
  type GymMeasuresStore,
  type GymProblem,
} from '@/shop/gymBody';
import type { GymLink } from '@/shop/types';

/** The gym's measurements, by gym (kept after leaving the gym). Erase all data removes it. */
export const GYM_MEASURES_KEY = 'forgeai-gym-measures';
/** The gym's diet plans (the last answer). Leaving the gym or Erase all data removes it. */
export const GYM_DIETS_KEY = 'forgeai-gym-diets';
/** At most this often (ms) on its own. */
export const GYM_BODY_EVERY_MS = 10 * 60 * 1000;

const lastAsked = new Map<string, { key: string; at: number }>();

function due(what: string, link: GymLink, now: number, force?: boolean): boolean {
  const last = lastAsked.get(what);
  if (!force && last?.key === link.memberKey && now - last.at < GYM_BODY_EVERY_MS) return false;
  lastAsked.set(what, { key: link.memberKey, at: now });
  return true;
}

function quietFail(what: string, r: { ok: false } & ({ missing: true } | { error: { kind: string } })): void {
  if ('missing' in r) return;
  if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn(`[ForgeErr] gym ${what}`, r.error);
}

// ------------------------------------------------------------------ measurements

export async function readGymMeasures(): Promise<GymMeasuresStore> {
  try {
    return parseGymMeasuresStore(await AsyncStorage.getItem(GYM_MEASURES_KEY));
  } catch (e) {
    console.warn('[ForgeErr] gym measurements: reading the kept copy', e);
    return {};
  }
}

/** Ask the gym and keep its answer. True when the kept copy changed. */
export async function syncGymMeasures(link: GymLink | null, opts: { force?: boolean; now?: number } = {}): Promise<boolean> {
  if (!link) return false;
  // T66: body measurements from the trainer are Pro (always allowed while PLAN_GATE_ON is off).
  if (!hasFeature(link, 'trainerPlans')) return false;
  const now = opts.now ?? Date.now();
  if (!due('measures', link, now, opts.force)) return false;
  try {
    const r = await apiGymMeasures(link.memberKey);
    if (!r.ok) {
      quietFail('measurements', r);
      return false;
    }
    if (!r.data.ok) return false;
    const before = await readGymMeasures();
    const old = before[r.data.gymId];
    const next = withGymAnswer(before, r.data, now);
    const changed = !old || old.gymName !== r.data.gymName || JSON.stringify(old.days) !== JSON.stringify(r.data.days);
    await AsyncStorage.setItem(GYM_MEASURES_KEY, JSON.stringify(next));
    return changed;
  } catch (e) {
    console.warn('[ForgeErr] gym measurements: saving', e);
    return false;
  }
}

// ------------------------------------------------------------------ diet plans

/** The kept diet plans of this gym, or null (none kept, or another gym's). */
export async function readGymDiets(link: GymLink | null): Promise<GymDietsCopy | null> {
  if (!link) return null;
  try {
    const c = parseGymDietsCopy(await AsyncStorage.getItem(GYM_DIETS_KEY));
    return c && c.gymId === link.gymId ? c : null;
  } catch (e) {
    console.warn('[ForgeErr] gym diet plans: reading the kept copy', e);
    return null;
  }
}

export type DietSync =
  /** The gym answered: its plans now (possibly none). */
  | { kind: 'fresh'; copy: GymDietsCopy }
  /** The gym needs one check-in at the desk first (or the like). */
  | { kind: 'problem'; problem: GymProblem }
  /** Not asked (too soon), offline, or the server has no diet plans yet: keep showing the kept copy. */
  | { kind: 'kept' };

/** Ask the gym for its diet plans and keep them. */
export async function syncGymDiets(link: GymLink | null, opts: { force?: boolean; now?: number } = {}): Promise<DietSync> {
  if (!link) return { kind: 'kept' };
  // T66: diet plans from the trainer are Pro (always allowed while PLAN_GATE_ON is off).
  if (!hasFeature(link, 'trainerPlans')) return { kind: 'kept' };
  const now = opts.now ?? Date.now();
  if (!due('diets', link, now, opts.force)) return { kind: 'kept' };
  try {
    const r = await apiGymDiets(link.memberKey);
    if (!r.ok) {
      quietFail('diet plans', r);
      return { kind: 'kept' };
    }
    if (!r.data.ok) return { kind: 'problem', problem: r.data.problem };
    const copy: GymDietsCopy = { gymId: r.data.gymId, gymName: r.data.gymName, plans: r.data.plans, at: now };
    await AsyncStorage.setItem(GYM_DIETS_KEY, JSON.stringify(copy));
    return { kind: 'fresh', copy };
  } catch (e) {
    console.warn('[ForgeErr] gym diet plans: saving', e);
    return { kind: 'kept' };
  }
}

/** Leaving the gym: its diet plans go (the measurements stay: they are about the member's own body). */
export async function forgetGymDiets(): Promise<void> {
  lastAsked.delete('diets');
  await AsyncStorage.removeItem(GYM_DIETS_KEY);
}

/** Tests only. */
export function resetGymBodySyncForTests(): void {
  lastAsked.clear();
}
