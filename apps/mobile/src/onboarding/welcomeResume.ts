/**
 * R-267 UAT (1 Nov 2026): the 3 setup steps survive the app closing. Before, kg or lb was saved at
 * once but the name, phone, goal and experience lived only on screen: a member who switched apps to
 * find their gym code (and Android killed MettleUp) started again from the start view.
 * The answers are kept on this phone only (the app's own meta table), never sent anywhere, and the
 * mark is cleared when "Start training" saves the profile.
 */
import { getMeta, setMeta } from '@/db';
import type { UnitSystem } from '@/types/models';

import { welcomeDraft, type OnboardingDraft } from './form';
import type { WelcomeStep } from './welcomeSteps';

export const RESUME_KEY = 'welcome_resume';

export interface WelcomeResume {
  step: WelcomeStep;
  units: UnitSystem | null;
  draft: OnboardingDraft;
}

const GOALS = ['muscle', 'fat_loss', 'strength', 'general'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const STRING_FIELDS: (keyof OnboardingDraft)[] = ['name', 'phone', 'age', 'heightCm', 'bodyWeightKg', 'gymName'];

/** The stored text, or null when there is nothing worth resuming. PURE. */
export function resumeText(r: WelcomeResume): string | null {
  const d = r.draft;
  const any = r.step > 0 || r.units != null || d.goal != null || d.experience != null || STRING_FIELDS.some((k) => String(d[k] ?? '').trim() !== '');
  return any ? JSON.stringify(r) : null;
}

/** The stored text back as answers; anything broken or foreign is null (start clean). PURE. */
export function parseResume(raw: string | null | undefined): WelcomeResume | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null; // quiet: a broken mark only means the member starts the steps clean
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Partial<WelcomeResume>;
  const step = r.step === 0 || r.step === 1 || r.step === 2 ? r.step : null;
  if (step == null || !r.draft || typeof r.draft !== 'object') return null;
  const base = welcomeDraft();
  const draft: OnboardingDraft = { ...base };
  for (const k of STRING_FIELDS) {
    const v = (r.draft as unknown as Record<string, unknown>)[k];
    if (typeof v === 'string') (draft as unknown as Record<string, unknown>)[k] = v.slice(0, 200);
  }
  const g = (r.draft as Partial<OnboardingDraft>).goal;
  if (typeof g === 'string' && GOALS.includes(g)) draft.goal = g as OnboardingDraft['goal'];
  const x = (r.draft as Partial<OnboardingDraft>).experience;
  if (typeof x === 'string' && LEVELS.includes(x)) draft.experience = x as OnboardingDraft['experience'];
  const units = r.units === 'metric' || r.units === 'imperial' ? r.units : null;
  return { step, units, draft };
}

/** The saved answers, or null. Never throws. */
export async function readWelcomeResume(): Promise<WelcomeResume | null> {
  try {
    return parseResume(await getMeta(RESUME_KEY));
  } catch (e) {
    console.warn('[welcome] could not read the saved setup answers', e);
    return null;
  }
}

/** Keep the answers (or clear them when there is nothing). Never throws. */
export async function saveWelcomeResume(r: WelcomeResume | null): Promise<void> {
  try {
    await setMeta(RESUME_KEY, r ? resumeText(r) ?? '' : '');
  } catch (e) {
    console.warn('[welcome] could not keep the setup answers', e);
  }
}
