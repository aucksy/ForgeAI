/**
 * R-495 (owner, 14 Nov 2026): the gym's own logo top-left in the admin panel, next to the gym's name, on every page
 * and for every role (owner, desk, trainer). The logo is the one the owner saves in Branding (owner_gym's `brand`,
 * 0005); nothing new on the server. No logo: the header looks as it did (just the name), never an empty box.
 *
 * This file is PURE (no React, no network) so the choice is unit-tested (test/crm/headerLogo.test.ts):
 *  - `headerLogo` decides what the header draws from the gym's brand;
 *  - `createLogoStore` keeps the latest logo per gym, so a Save in Branding redraws the header at once (no reload),
 *    and remembers it on this device so the logo is there on the next open, before the server answers.
 */

import type { GymBrand } from '@forgeai/theme';

import type { KeyValueStore } from '../data/local';

/** The member app's own dark screen colour: the tile behind a logo when the gym picked no background. */
export const LOGO_TILE_DEFAULT = '#0A0A0C';

/** What the header draws for the logo; null draws nothing (the gym's name stays alone, as before). */
export interface HeaderLogo {
  src: string;
  /** The gym's name, for screen readers. */
  alt: string;
  /**
   * The small tile behind the logo: the gym's own background colour (what members see the logo on in the app), so
   * a white logo stays visible on the light look and a black one on the dark look.
   */
  tile: string;
}

/** The logo part of a gym's brand, as this header needs it (and as the store keeps it). */
export type LogoBrand = Pick<GymBrand, 'logoUrl' | 'bg'>;

/** What the header shows for this gym. PURE. */
export function headerLogo(gymName: string, brand: LogoBrand | null | undefined): HeaderLogo | null {
  const src = brand?.logoUrl?.trim();
  if (!src || !/^(https:\/\/|blob:|data:image\/)/.test(src)) return null;
  return { src, alt: gymName.trim() || 'Gym logo', tile: brand?.bg ?? LOGO_TILE_DEFAULT };
}

/** Where this device remembers each gym's logo link (only the public link and the tile colour; never the picture). */
export const LOGO_STORE_KEY = 'forgeai.headerLogo.v1';

export interface LogoStore {
  /** The gym's logo as last known: undefined when this device never heard, null when the gym has none. */
  get(gymId: string): LogoBrand | null | undefined;
  /** The gym's logo changed (loaded, saved or removed in Branding): every header redraws. */
  set(gymId: string, brand: LogoBrand | null): void;
  /** For React's useSyncExternalStore. */
  subscribe(listener: () => void): () => void;
}

function readSaved(storage: KeyValueStore | null): Map<string, LogoBrand | null> {
  const map = new Map<string, LogoBrand | null>();
  if (!storage) return map;
  try {
    const raw = storage.getItem(LOGO_STORE_KEY);
    const v = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    for (const [gymId, b] of Object.entries(v)) {
      if (b === null) map.set(gymId, null);
      else if (b && typeof b === 'object') {
        const o = b as Record<string, unknown>;
        map.set(gymId, {
          logoUrl: typeof o.logoUrl === 'string' ? o.logoUrl : null,
          bg: typeof o.bg === 'string' ? o.bg : null,
        });
      }
    }
  } catch {
    // quiet: a damaged entry only costs the first moment of the logo: the server's answer replaces it.
  }
  return map;
}

/**
 * A store of each gym's logo. `storage` is localStorage in the browser (null for none: the demo gym, a test).
 * Setting the same logo again tells nobody, so a refresh never redraws the header for nothing.
 */
export function createLogoStore(storage: KeyValueStore | null): LogoStore {
  const logos = readSaved(storage);
  const listeners = new Set<() => void>();
  return {
    get: (gymId) => logos.get(gymId),
    set(gymId, brand) {
      const next: LogoBrand | null = brand ? { logoUrl: brand.logoUrl ?? null, bg: brand.bg ?? null } : null;
      const was = logos.get(gymId);
      if (was !== undefined && (was === null ? next === null : next !== null && was.logoUrl === next.logoUrl && was.bg === next.bg)) return;
      logos.set(gymId, next);
      if (storage) {
        try {
          storage.setItem(LOGO_STORE_KEY, JSON.stringify(Object.fromEntries(logos)));
        } catch {
          // quiet: a full or blocked storage: the logo still shows now, it just loads again next time.
        }
      }
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
