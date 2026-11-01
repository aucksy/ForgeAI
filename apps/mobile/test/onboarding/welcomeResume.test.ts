import { describe, expect, it } from 'vitest';

import { welcomeDraft } from '@/onboarding/form';
import { parseResume, resumeText } from '@/onboarding/welcomeResume';

describe('R-267: setup answers survive the app closing', () => {
  it('nothing typed and still on step 1: nothing is kept', () => {
    expect(resumeText({ step: 0, units: null, draft: welcomeDraft() })).toBeNull();
  });
  it('answers come back exactly', () => {
    const draft = { ...welcomeDraft(), name: 'Asha', goal: 'strength' as const, experience: 'intermediate' as const };
    const text = resumeText({ step: 2, units: 'metric', draft });
    expect(parseResume(text)).toEqual({ step: 2, units: 'metric', draft });
  });
  it('a broken or foreign mark starts clean', () => {
    expect(parseResume('{oops')).toBeNull();
    expect(parseResume('')).toBeNull();
    expect(parseResume(JSON.stringify({ step: 7, draft: {} }))).toBeNull();
  });
  it('unknown goal, level or units are dropped, never guessed', () => {
    const r = parseResume(JSON.stringify({ step: 1, units: 'cubits', draft: { name: 'A', goal: 'fly', experience: 'god' } }));
    expect(r?.units).toBeNull();
    expect(r?.draft.goal).toBeNull();
    expect(r?.draft.experience).toBeNull();
    expect(r?.draft.name).toBe('A');
  });
});
