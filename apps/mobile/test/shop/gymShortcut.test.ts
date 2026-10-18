import { describe, expect, it } from 'vitest';

import { gymShortcutPlan, gymShortcutWords, SHORTCUT_PLAIN_BG, shortcutChanged, shortcutOffText } from '@/shop/gymShortcut';

const brand = { accent: '#FFD400', bg: '#101010', logoUrl: 'https://x.supabase.co/storage/v1/object/public/gym-logos/g/1.png', heading: 'bold', updatedAt: null } as const;

describe('gym home-screen shortcut (OWNER-INBOX #11)', () => {
  it('is drawn from the gym name, logo and background tone', () => {
    expect(gymShortcutPlan({ gymName: "RAM'S FITNESS", brand: brand as never })).toEqual({ name: "RAM'S FITNESS", logoUrl: brand.logoUrl, bg: '#101010' });
  });
  it('no gym, no logo, or a logo that is not https: nothing to offer', () => {
    expect(gymShortcutPlan(null)).toBeNull();
    expect(gymShortcutPlan({ gymName: 'G', brand: null })).toBeNull();
    expect(gymShortcutPlan({ gymName: 'G', brand: { ...brand, logoUrl: null } as never })).toBeNull();
    expect(gymShortcutPlan({ gymName: 'G', brand: { ...brand, logoUrl: 'http://x/1.png' } as never })).toBeNull();
  });
  it('a missing or odd background tone falls back to white', () => {
    expect(gymShortcutPlan({ gymName: 'G', brand: { ...brand, bg: null } as never })?.bg).toBe(SHORTCUT_PLAIN_BG);
    expect(gymShortcutPlan({ gymName: 'G', brand: { ...brand, bg: 'red' } as never })?.bg).toBe(SHORTCUT_PLAIN_BG);
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
    expect(shortcutOffText('G')).toBe('You left G. Open ForgeAI from its own icon.');
  });
});
