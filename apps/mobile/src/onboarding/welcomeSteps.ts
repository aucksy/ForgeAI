/**
 * The welcome in 3 calm steps (Audit Phase 7, owner decision D12 = A). PURE.
 *
 *   1. Your name (and, optionally, a mobile number)
 *   2. kg or lb
 *   3. Your goal and experience → Start training
 *
 * Each step checks only its own answers, so "Next" never complains about a question the
 * member has not seen yet. The last step runs the full `validateOnboarding`.
 */
import type { UnitSystem } from '@/types/models';

import { checkName, EXPERIENCE_MESSAGE, GOAL_MESSAGE, parsePhone, type OnboardingDraft } from './form';

export const WELCOME_STEP_COUNT = 3;
export type WelcomeStep = 0 | 1 | 2;

/** Every answer the welcome can point at when something is missing. */
export type WelcomeField = 'name' | 'phone' | 'units' | 'goal' | 'experience';

export const UNITS_MESSAGE = 'Choose kg or lb.';

export interface WelcomeProblem {
  field: WelcomeField;
  message: string;
}

/** The first problem on this step, top to bottom, or null when "Next" may go on. */
export function stepProblem(step: WelcomeStep, draft: OnboardingDraft, units: UnitSystem | null): WelcomeProblem | null {
  if (step === 0) {
    const name = checkName(draft.name);
    if (!name.ok) return { field: 'name', message: name.message };
    const phone = parsePhone(draft.phone);
    if (!phone.ok) return { field: 'phone', message: phone.message };
    return null;
  }
  if (step === 1) {
    return units == null ? { field: 'units', message: UNITS_MESSAGE } : null;
  }
  if (draft.goal == null) return { field: 'goal', message: GOAL_MESSAGE };
  if (draft.experience == null) return { field: 'experience', message: EXPERIENCE_MESSAGE };
  return null;
}

/** Which step asks for this answer (a final check that fails sends the member back there). */
export function stepOf(field: string): WelcomeStep {
  if (field === 'units') return 1;
  if (field === 'goal' || field === 'experience') return 2;
  return 0; // name, phone — and the optional extras, which the welcome no longer shows
}

/** The field on screen to point at for a final-check failure (the hidden extras map to the name). */
export function welcomeFieldOf(field: string): WelcomeField {
  return field === 'phone' || field === 'units' || field === 'goal' || field === 'experience' ? field : 'name';
}

export function nextStep(step: WelcomeStep): WelcomeStep {
  return step >= 2 ? 2 : ((step + 1) as WelcomeStep);
}

/** Android back on step 2 or 3 goes one step back; on step 1 it leaves (returns null). */
export function previousStep(step: WelcomeStep): WelcomeStep | null {
  return step <= 0 ? null : ((step - 1) as WelcomeStep);
}

/** "Step 2 of 3" — said by screen readers and shown over the heading. */
export function stepLabel(step: WelcomeStep): string {
  return `Step ${step + 1} of ${WELCOME_STEP_COUNT}`;
}
