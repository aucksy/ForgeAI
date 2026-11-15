/**
 * R-598 (16 Nov 2026): the Workout tab's "Coming from Hevy or Strong?" card says "Everything stays on
 * this phone." ONLY to a member who is not signed in; a signed-in member's workouts are copied to the
 * MettleUp account, so for them the card leaves the sentence out (the words themselves are unchanged).
 */
import { describe, expect, it } from 'vitest';

import { SWITCHER_LOCAL_LINE, switcherLine } from '@/tracker/services/switcher';

describe('the import card line (R-598)', () => {
  it('keeps the privacy sentence word for word', () => {
    expect(SWITCHER_LOCAL_LINE).toBe('Everything stays on this phone.');
  });

  it('signed out: the sentence is shown', () => {
    expect(switcherLine({ later: false, selected: null, signedIn: false })).toBe(
      'Bring your workouts, records and routines with you. Everything stays on this phone.',
    );
  });

  it('signed in: the sentence is not shown, and the card still reads as one whole line', () => {
    const line = switcherLine({ later: false, selected: null, signedIn: true });
    expect(line).toBe('Bring your workouts, records and routines with you.');
    expect(line).not.toContain('stays on this phone');
  });

  it('the welcome screen words are unchanged either way', () => {
    for (const signedIn of [true, false]) {
      expect(switcherLine({ later: true, selected: null, signedIn })).toBe(
        'Bring your workouts, records and routines with you. Pick your app; it opens right after you start.',
      );
      expect(switcherLine({ later: true, selected: 'strong', signedIn })).toBe(
        'Your Strong workouts and routines come in right after you tap Start training.',
      );
    }
  });
});
