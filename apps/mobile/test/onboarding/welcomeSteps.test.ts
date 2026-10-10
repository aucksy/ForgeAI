/**
 * Audit Phase 7 (D12 = A): the welcome in 3 calm steps — name → kg or lb → goal and
 * experience. Each step checks only its own answers; the number never blocks the start.
 */
import { describe, expect, it } from 'vitest';

import { validateOnboarding, welcomeDraft, type OnboardingDraft } from '@/onboarding/form';
import {
  nextStep,
  previousStep,
  stepLabel,
  stepOf,
  stepProblem,
  UNITS_MESSAGE,
  WELCOME_STEP_COUNT,
  welcomeFieldOf,
} from '@/onboarding/welcomeSteps';

const d = (p: Partial<OnboardingDraft> = {}): OnboardingDraft => ({ ...welcomeDraft(), ...p });

describe('step 1: your name (and an optional number)', () => {
  it('a name is enough to go on — the number may stay blank (SH-10)', () => {
    expect(stepProblem(0, d({ name: 'Aisha' }), null)).toBeNull();
  });

  it('a missing name points at the name field with a plain line', () => {
    expect(stepProblem(0, d(), null)).toEqual({ field: 'name', message: 'Your name, please.' });
    expect(stepProblem(0, d({ name: '   ' }), null)?.field).toBe('name');
  });

  it('the name is checked before the number (top to bottom)', () => {
    expect(stepProblem(0, d({ phone: 'abc' }), null)?.field).toBe('name');
  });

  it('a number that is there must look like one — any country', () => {
    expect(stepProblem(0, d({ name: 'Sam', phone: '+1 415 555 0123' }), null)).toBeNull();
    expect(stepProblem(0, d({ name: 'Sam', phone: '07700 900123' }), null)).toBeNull();
    expect(stepProblem(0, d({ name: 'Sam', phone: '12' }), null)).toEqual({
      field: 'phone',
      message: 'Enter 7 to 15 digits, or leave it blank.',
    });
  });

  it('never complains about a later step', () => {
    // Goal and experience are still unpicked here, and no unit is chosen.
    expect(stepProblem(0, d({ name: 'Sam' }), null)).toBeNull();
  });
});

describe('step 2: kg or lb', () => {
  it('waits for a pick — nothing is chosen for the member', () => {
    expect(stepProblem(1, d({ name: 'Sam' }), null)).toEqual({ field: 'units', message: UNITS_MESSAGE });
  });
  it('either unit goes on', () => {
    expect(stepProblem(1, d(), 'metric')).toBeNull();
    expect(stepProblem(1, d(), 'imperial')).toBeNull();
  });
});

describe('step 3: goal and experience', () => {
  it('asks for the goal first, then the experience', () => {
    expect(stepProblem(2, d(), 'metric')).toEqual({ field: 'goal', message: 'Choose a goal.' });
    expect(stepProblem(2, d({ goal: 'strength' }), 'metric')).toEqual({ field: 'experience', message: 'Choose your experience.' });
    expect(stepProblem(2, d({ goal: 'strength', experience: 'advanced' }), 'metric')).toBeNull();
  });

  it('a full pass of the three steps validates and saves no number', () => {
    const draft = d({ name: ' Sam  Lee ', goal: 'fat_loss', experience: 'intermediate' });
    expect(stepProblem(0, draft, null)).toBeNull();
    expect(stepProblem(1, draft, 'imperial')).toBeNull();
    expect(stepProblem(2, draft, 'imperial')).toBeNull();
    const r = validateOnboarding(draft, 'imperial');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ name: 'Sam Lee', phoneE164: null, goal: 'fat_loss', experience: 'intermediate' });
  });
});

describe('moving between steps', () => {
  it('three steps, labelled for screen readers', () => {
    expect(WELCOME_STEP_COUNT).toBe(3);
    expect(stepLabel(0)).toBe('Step 1 of 3');
    expect(stepLabel(2)).toBe('Step 3 of 3');
  });

  it('Next stops at the last step; Back stops at the first (then Android leaves)', () => {
    expect(nextStep(0)).toBe(1);
    expect(nextStep(1)).toBe(2);
    expect(nextStep(2)).toBe(2);
    expect(previousStep(2)).toBe(1);
    expect(previousStep(1)).toBe(0);
    expect(previousStep(0)).toBeNull();
  });

  it('a final check that fails goes back to the step that asks for that answer', () => {
    expect(stepOf('name')).toBe(0);
    expect(stepOf('phone')).toBe(0);
    expect(stepOf('units')).toBe(1);
    expect(stepOf('goal')).toBe(2);
    expect(stepOf('experience')).toBe(2);
    // The optional extras are not on the welcome any more; they fall back to the first step.
    expect(stepOf('age')).toBe(0);
    expect(welcomeFieldOf('age')).toBe('name');
    expect(welcomeFieldOf('phone')).toBe('phone');
  });
});
