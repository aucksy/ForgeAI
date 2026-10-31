import { describe, expect, it } from 'vitest';

import { GYM_SECTION_LABELS, gymSectionShown, gymSections } from '../../src/shop/gymTab';

describe('the Gym tab has its own tabs (R-225)', () => {
  it('Shop first and opened first when the shop is on, then My gym, then Ranking', () => {
    expect(gymSections(true).map((s) => GYM_SECTION_LABELS[s])).toEqual(['Shop', 'My gym', 'Ranking']);
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

describe('a reminder or a What\'s new button opens one part of the Gym tab', () => {
  it('each request counts, so the same part asked twice still moves the tab', async () => {
    const { requestGymSection, useGymSectionRequest } = await import('@/shop/gymSectionRequest');
    const n = useGymSectionRequest.getState().n;
    requestGymSection('gym');
    requestGymSection('gym');
    expect(useGymSectionRequest.getState()).toEqual({ want: 'gym', n: n + 2 });
    requestGymSection('board');
    expect(useGymSectionRequest.getState().want).toBe('board');
  });

  it('every What\'s new button to a gym page names its part; the plain "Open the Gym tab" news does not', async () => {
    const { WHATS_NEW_LOG } = await import('@/lib/whatsNew');
    const lines = WHATS_NEW_LOG.flatMap((e) => e.lines).filter((l) => l.go?.href === '/shop');
    const words = (s: string) => lines.find((l) => l.text.includes(s))?.go?.section;
    expect(words('a leaderboard of your gym')).toBe('board');
    expect(words('pause or renew your membership')).toBe('gym');
    expect(words('New "My membership" page')).toBe('gym');
    expect(words('The Gym tab now has 3 parts')).toBeUndefined();
  });
});
