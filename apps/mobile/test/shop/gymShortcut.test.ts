import { describe, expect, it } from 'vitest';

import { gymShortcutPlan, gymShortcutWords, needsArtRedraw, SHORTCUT_ART_VERSION, shortcutChanged, shortcutColours, shortcutOffText } from '@/shop/gymShortcut';

const brand = { accent: '#FFD400', bg: '#101010', logoUrl: 'https://x.supabase.co/storage/v1/object/public/gym-logos/g/1.png', heading: 'bold', updatedAt: null } as const;

describe('gym home-screen shortcut (OWNER-INBOX #11)', () => {
  it('is drawn from the gym name, logo and the gym colours (brand colour, then background tone)', () => {
    expect(gymShortcutPlan({ gymName: "RAM'S FITNESS", brand: brand as never })).toEqual({ name: "RAM'S FITNESS", logoUrl: brand.logoUrl, bg: '#FFD400,#101010' });
  });
  it('no gym, no logo, or a logo that is not https: nothing to offer', () => {
    expect(gymShortcutPlan(null)).toBeNull();
    expect(gymShortcutPlan({ gymName: 'G', brand: null })).toBeNull();
    expect(gymShortcutPlan({ gymName: 'G', brand: { ...brand, logoUrl: null } as never })).toBeNull();
    expect(gymShortcutPlan({ gymName: 'G', brand: { ...brand, logoUrl: 'http://x/1.png' } as never })).toBeNull();
  });
  it('T74: a missing or odd colour is left out (the phone then picks a neutral dark or white)', () => {
    expect(gymShortcutPlan({ gymName: 'G', brand: { ...brand, bg: null } as never })?.bg).toBe('#FFD400');
    expect(gymShortcutPlan({ gymName: 'G', brand: { ...brand, bg: 'red' } as never })?.bg).toBe('#FFD400');
    expect(shortcutColours({ accent: null, bg: null })).toBe('');
    expect(shortcutColours(null)).toBe('');
  });
  it('T74: a shortcut pinned by an older app is redrawn once with the new art', () => {
    expect(needsArtRedraw(null, true)).toBe(true);
    expect(needsArtRedraw('1', true)).toBe(true);
    expect(needsArtRedraw(SHORTCUT_ART_VERSION, true)).toBe(false);
    expect(needsArtRedraw(null, false)).toBe(false);
  });
  it('redraws only when the picture or name changed', () => {
    const a = gymShortcutPlan({ gymName: 'G', brand: brand as never });
    expect(shortcutChanged(a, { ...a! })).toBe(false);
    expect(shortcutChanged(a, { ...a!, logoUrl: brand.logoUrl.replace('1.png', '2.png') })).toBe(true);
    expect(shortcutChanged(a, { ...a!, name: 'H' })).toBe(true);
    expect(shortcutChanged(null, a)).toBe(true);
    expect(shortcutChanged(null, null)).toBe(false);
  });
  it('says what happened in plain words; nothing while Android asks', () => {
    expect(gymShortcutWords('asked', 'G')).toBeNull();
    expect(gymShortcutWords('updated', 'G')).toMatch(/already on your home screen/);
    expect(gymShortcutWords('unsupported', 'G')).toBe("This phone's home screen doesn't take shortcuts.");
    expect(gymShortcutWords('no-logo', 'G')).toMatch(/Couldn't get G's logo/);
    expect(gymShortcutWords('failed', 'G')).toBe("Couldn't add it. Try again.");
    expect(shortcutOffText('G')).toBe('You left G. Open MettleUp from its own icon.');
  });
});
