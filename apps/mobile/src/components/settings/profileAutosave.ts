/**
 * Profile saves as you go (Audit Phase 7, SH-16) — the PURE parts.
 *
 * Before: every edit on the Profile card waited for a "Save profile" button, and leaving the
 * tab threw the edits away without a word. Now each answer is checked on its own and saved a
 * moment after the member stops typing (or at once for a tap, or when the box loses focus).
 *
 *  - `checkProfileField` turns one box's text into what to write, "nothing changed", or the
 *    short line to show under that box (never a pop-up).
 *  - `createDebouncer` waits for a pause per field, can be flushed (blur, leaving the app) and
 *    cancelled (the card going away after an erase).
 */
import { checkName, GYM_NAME_MAX, parsePhone } from '@/onboarding/form';
import type { UnitSystem } from '@/lib/units';
import type { UserProfile } from '@/types/models';

import { parseProfileExtras } from './profileFields';

export type TargetKey = 'calorieTarget' | 'proteinTargetG' | 'carbsTargetG' | 'fatTargetG';
export type ProfileTextField = 'name' | 'phone' | 'gymName' | 'age' | 'height' | TargetKey;

export const TARGET_RULES: Readonly<Record<TargetKey, { label: string; unit: string; min: number; max: number }>> = {
  calorieTarget: { label: 'Calories', unit: 'kcal', min: 800, max: 8000 },
  proteinTargetG: { label: 'Protein', unit: 'g', min: 20, max: 500 },
  carbsTargetG: { label: 'Carbs', unit: 'g', min: 0, max: 1200 },
  fatTargetG: { label: 'Fat', unit: 'g', min: 0, max: 400 },
};

/** What one save writes: profile columns, the number (null = remove it), or both. */
export interface ProfileWrite {
  profile?: Partial<Omit<UserProfile, 'id'>>;
  phone?: string | null;
}

export type FieldCheck =
  | { kind: 'write'; write: ProfileWrite }
  | { kind: 'same' }
  | { kind: 'invalid'; message: string };

export interface CheckContext {
  profile: Pick<UserProfile, 'name' | 'gymName' | 'age' | 'heightCm' | TargetKey>;
  /** The number on record now (null = none). */
  savedPhone: string | null;
  units: UnitSystem;
}

/** One box's text → what to save. "same" when it matches what is stored (nothing to write). */
export function checkProfileField(field: ProfileTextField, text: string, ctx: CheckContext): FieldCheck {
  const { profile } = ctx;
  switch (field) {
    case 'name': {
      const r = checkName(text);
      if (!r.ok) return { kind: 'invalid', message: r.message };
      return r.name === profile.name ? { kind: 'same' } : { kind: 'write', write: { profile: { name: r.name } } };
    }
    case 'phone': {
      const r = parsePhone(text);
      if (!r.ok) return { kind: 'invalid', message: r.message };
      return r.phone === ctx.savedPhone ? { kind: 'same' } : { kind: 'write', write: { phone: r.phone } };
    }
    case 'gymName': {
      const gym = text.trim().replace(/\s+/g, ' ');
      if (gym.length > GYM_NAME_MAX) return { kind: 'invalid', message: `Keep the gym name under ${GYM_NAME_MAX} characters.` };
      return gym === profile.gymName ? { kind: 'same' } : { kind: 'write', write: { profile: { gymName: gym } } };
    }
    case 'age': {
      const r = parseProfileExtras(text, '', ctx.units);
      if (!r.ok) return { kind: 'invalid', message: r.message };
      return r.age === profile.age ? { kind: 'same' } : { kind: 'write', write: { profile: { age: r.age } } };
    }
    case 'height': {
      const r = parseProfileExtras('', text, ctx.units);
      if (!r.ok) return { kind: 'invalid', message: r.message };
      return r.heightCm === profile.heightCm ? { kind: 'same' } : { kind: 'write', write: { profile: { heightCm: r.heightCm } } };
    }
    default: {
      const rule = TARGET_RULES[field];
      const raw = text.trim();
      const n = Number(raw);
      if (raw.length === 0 || !/^\d+$/.test(raw) || n < rule.min || n > rule.max) {
        return { kind: 'invalid', message: `Enter a whole number between ${rule.min} and ${rule.max} ${rule.unit}.` };
      }
      if (n === profile[field]) return { kind: 'same' };
      const patch: Partial<Omit<UserProfile, 'id'>> = {};
      patch[field] = n;
      return { kind: 'write', write: { profile: patch } };
    }
  }
}

export interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface Debouncer<K extends string> {
  /** (Re)start this field's wait; `run(key)` fires after `delayMs` of quiet. */
  schedule: (key: K) => void;
  /** Run now whatever is waiting (all fields, or just one). Resolves when those runs finish. */
  flush: (key?: K) => Promise<void>;
  /** Forget one field's wait, without running it (the box was just saved another way). */
  drop: (key: K) => void;
  /** Forget everything waiting, without running it. */
  cancel: () => void;
  pending: () => K[];
}

/** One timer per field, so typing in Age never delays the save of Name. */
export function createDebouncer<K extends string>(
  run: (key: K) => Promise<void> | void,
  delayMs: number,
  timers: Timers = realTimers,
): Debouncer<K> {
  const waiting = new Map<K, unknown>();
  const fire = async (key: K): Promise<void> => {
    const h = waiting.get(key);
    if (h === undefined) return;
    timers.clear(h);
    waiting.delete(key);
    await run(key);
  };
  return {
    schedule: (key) => {
      const h = waiting.get(key);
      if (h !== undefined) timers.clear(h);
      waiting.set(
        key,
        timers.set(() => void fire(key), delayMs),
      );
    },
    flush: async (key) => {
      const keys = key ? (waiting.has(key) ? [key] : []) : [...waiting.keys()];
      for (const k of keys) await fire(k);
    },
    drop: (key) => {
      const h = waiting.get(key);
      if (h === undefined) return;
      timers.clear(h);
      waiting.delete(key);
    },
    cancel: () => {
      for (const h of waiting.values()) timers.clear(h);
      waiting.clear();
    },
    pending: () => [...waiting.keys()],
  };
}

/** A chip on the card (goal, experience): saved at once on a tap. */
export type ChipKey = 'goal' | 'experience';
export type ChipChange = { [K in ChipKey]: { key: K; value: UserProfile[K] } }[ChipKey];

/** The profile columns one chip change writes. PURE. */
export function chipPatch(change: ChipChange): Partial<Omit<UserProfile, 'id'>> {
  return change.key === 'goal' ? { goal: change.value } : { experience: change.value };
}

/**
 * What "Try again" re-runs after a failed save (review fix: a failed chip used to be forgotten,
 * so "Try again" did nothing): the boxes whose save failed, and the last failed change of each
 * chip — a newer tap on the same chip replaces it. A save that works takes its own entry off.
 */
export interface RetryList {
  fields: readonly ProfileTextField[];
  chips: readonly ChipChange[];
}

export const NO_RETRY: RetryList = { fields: [], chips: [] };

export type SaveTarget = { field: ProfileTextField } | { chip: ChipChange };

/** A save failed: remember it for "Try again". PURE. */
export function saveFailed(list: RetryList, t: SaveTarget): RetryList {
  if ('field' in t) return list.fields.includes(t.field) ? list : { ...list, fields: [...list.fields, t.field] };
  return { ...list, chips: [...list.chips.filter((c) => c.key !== t.chip.key), t.chip] };
}

/** A save worked (or there was nothing left to save): forget that entry. PURE. */
export function saveWorked(list: RetryList, t: SaveTarget): RetryList {
  if ('field' in t) return list.fields.includes(t.field) ? { ...list, fields: list.fields.filter((f) => f !== t.field) } : list;
  return list.chips.some((c) => c.key === t.chip.key) ? { ...list, chips: list.chips.filter((c) => c.key !== t.chip.key) } : list;
}

/** How long the member must pause before a typed answer saves. */
export const AUTOSAVE_DELAY_MS = 800;
/** How long the quiet "Saved" line stays. */
export const SAVED_SHOWN_MS = 2500;
