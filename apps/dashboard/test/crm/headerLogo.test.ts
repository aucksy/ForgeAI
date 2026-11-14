// R-495 (owner, 14 Nov 2026): the gym's own logo top-left in the admin panel (src/crm/brand/headerLogo.ts).
import { describe, expect, it } from 'vitest';

import { LOGO_STORE_KEY, LOGO_TILE_DEFAULT, createLogoStore, headerLogo } from '../../src/crm/brand/headerLogo';

const LOGO = 'https://hdxzqbdiokjklnypfisq.supabase.co/storage/v1/object/public/gym-logos/' + 'ab'.repeat(24) + '/logo-1.png';
const NEW_LOGO = LOGO.replace('logo-1', 'logo-2');

function memory(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
}

describe('what the header shows', () => {
  it('a gym with a logo: the logo, named after the gym, on the gym’s own background colour', () => {
    expect(headerLogo('Shakti Gym', { logoUrl: LOGO, bg: '#101820' })).toEqual({ src: LOGO, alt: 'Shakti Gym', tile: '#101820' });
    // No background picked: the member app's own dark colour, what members see the logo on.
    expect(headerLogo('Shakti Gym', { logoUrl: LOGO, bg: null })?.tile).toBe(LOGO_TILE_DEFAULT);
  });

  it('no logo: nothing (the name alone, as before), never an empty box', () => {
    expect(headerLogo('Shakti Gym', null)).toBeNull();
    expect(headerLogo('Shakti Gym', undefined)).toBeNull();
    expect(headerLogo('Shakti Gym', { logoUrl: null, bg: '#101820' })).toBeNull();
    expect(headerLogo('Shakti Gym', { logoUrl: '   ', bg: null })).toBeNull();
    // Not a picture link (an old or broken value): nothing, rather than a broken-picture icon.
    expect(headerLogo('Shakti Gym', { logoUrl: 'javascript:alert(1)', bg: null })).toBeNull();
    expect(headerLogo('Shakti Gym', { logoUrl: 'http://example.com/a.png', bg: null })).toBeNull();
  });

  it('a gym with no name yet still gets words for screen readers', () => {
    expect(headerLogo('  ', { logoUrl: LOGO, bg: null })?.alt).toBe('Gym logo');
  });
});

describe('the logo changes without a reload', () => {
  it('a new logo saved in Branding reaches every header at once, and is remembered on this device', () => {
    const storage = memory();
    const store = createLogoStore(storage);
    let redraws = 0;
    const stop = store.subscribe(() => (redraws += 1));
    expect(store.get('g-1')).toBeUndefined();

    store.set('g-1', { logoUrl: LOGO, bg: null });
    expect(headerLogo('Shakti Gym', store.get('g-1'))?.src).toBe(LOGO);
    expect(redraws).toBe(1);

    // The owner changes the logo.
    store.set('g-1', { logoUrl: NEW_LOGO, bg: '#222222' });
    expect(headerLogo('Shakti Gym', store.get('g-1'))).toEqual({ src: NEW_LOGO, alt: 'Shakti Gym', tile: '#222222' });
    expect(redraws).toBe(2);

    // The same answer again (a refresh): no redraw for nothing.
    store.set('g-1', { logoUrl: NEW_LOGO, bg: '#222222' });
    expect(redraws).toBe(2);

    // Removed in Branding: the header goes back to the name alone.
    store.set('g-1', null);
    expect(headerLogo('Shakti Gym', store.get('g-1'))).toBeNull();
    expect(redraws).toBe(3);

    stop();
    store.set('g-1', { logoUrl: LOGO, bg: null });
    expect(redraws).toBe(3);

    // The next time the panel opens on this device, the logo is there before the server answers.
    const again = createLogoStore(storage);
    expect(again.get('g-1')).toEqual({ logoUrl: LOGO, bg: null });
    expect(JSON.parse(storage.map.get(LOGO_STORE_KEY)!)).toEqual({ 'g-1': { logoUrl: LOGO, bg: null } });
  });

  it('each gym (branch) keeps its own logo', () => {
    const store = createLogoStore(null);
    store.set('g-1', { logoUrl: LOGO, bg: null });
    store.set('g-2', null);
    expect(store.get('g-1')?.logoUrl).toBe(LOGO);
    expect(store.get('g-2')).toBeNull();
  });

  it('damaged or blocked storage never breaks the header', () => {
    expect(createLogoStore(memory({ [LOGO_STORE_KEY]: '{not json' })).get('g-1')).toBeUndefined();
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    };
    const store = createLogoStore(blocked);
    expect(() => store.set('g-1', { logoUrl: LOGO, bg: null })).not.toThrow();
    expect(store.get('g-1')?.logoUrl).toBe(LOGO);
  });
});
