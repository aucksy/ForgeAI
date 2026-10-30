import { describe, expect, it } from 'vitest';

import { GYM_SECTION_LABELS, gymSectionShown, gymSections } from '../../src/shop/gymTab';

describe('the Gym tab has its own tabs (R-225)', () => {
  it('Shop first and opened first when the shop is on, then My gym, then Leaderboard', () => {
    expect(gymSections(true).map((s) => GYM_SECTION_LABELS[s])).toEqual(['Shop', 'My gym', 'Leaderboard']);
    expect(gymSectionShown(null, true)).toBe('shop');
  });
  it('no shop: My gym opens first and Shop is not offered', () => {
    expect(gymSections(false)).toEqual(['gym', 'board']);
    expect(gymSectionShown(null, false)).toBe('gym');
    expect(gymSectionShown('shop', false)).toBe('gym');
  });
  it("the member's pick holds", () => {
    expect(gymSectionShown('board', true)).toBe('board');
    expect(gymSectionShown('gym', false)).toBe('gym');
  });
});
