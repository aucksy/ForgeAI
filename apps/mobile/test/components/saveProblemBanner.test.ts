/**
 * UAT U-M5: the "Couldn't save" banner floats over every screen's top bar until a save works. It
 * has no buttons of its own, so it must never take a tap meant for the button under it (the
 * workout's "Minimise", a back arrow): neither its frame nor the card itself catches touches.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, '../../src/components/SaveProblemBanner.tsx'), 'utf8');

describe('U-M5: the save-problem banner lets taps through', () => {
  it('the frame passes touches to the screen and the card catches none', () => {
    expect(src).toMatch(/<View\s+pointerEvents="box-none"/);
    expect(src).toMatch(/<Animated\.View\s+pointerEvents="none"/);
  });

  it('it has nothing to press', () => {
    expect(src).not.toMatch(/Pressable|Touchable|onPress/);
  });
});
