import { describe, expect, it } from 'vitest';

import { FEATURES, linkedDraft, profileParts } from '@/lib/features';

describe('feature switch (owner decision D4 = A)', () => {
  it('hides the coach, nutrition and gym sync from members', () => {
    expect(FEATURES).toEqual({ coach: false, nutrition: false, gymSync: false });
  });

  it('Profile hides AI keys, voice, coach notes and gym sync with the switch off', () => {
    expect(profileParts(FEATURES)).toEqual([]);
    expect(profileParts({ coach: true, nutrition: false, gymSync: true })).toEqual([
      'aiCoach', 'voice', 'coachNotes', 'gymSync',
    ]);
  });
});

describe('SH-01: a coach link only fills the message box', () => {
  it('returns the trimmed text to place, never null for real text', () => {
    expect(linkedDraft('  Bench press 300 kg for 10 ')).toBe('Bench press 300 kg for 10');
    expect(linkedDraft(['first', 'second'])).toBe('first');
  });
  it('ignores blank or missing prompts', () => {
    expect(linkedDraft(undefined)).toBeNull();
    expect(linkedDraft('   ')).toBeNull();
    expect(linkedDraft([])).toBeNull();
  });
  it('caps a very long linked text', () => {
    expect(linkedDraft('x'.repeat(2000))?.length).toBe(500);
  });
});
