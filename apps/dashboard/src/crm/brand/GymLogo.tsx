/**
 * R-495: the gym's logo in the panel's header (the side menu on a computer, the top bar on a phone), for every role.
 * The rules are in headerLogo.ts; this file only loads the logo once per sign-in and draws it.
 *
 * Desk staff and trainers get the logo too: owner_gym accepts any signed-in person's key (_owner_gym, 0010).
 * Branding tells `gymLogos` when the owner saves or removes a logo, so the header changes at once, with no reload.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { isDemoLocked } from '../../lib/demoLock';
import type { KeyValueStore } from '../data/local';
import * as api from '../shop/api';
import { useShop } from '../shop/ShopProvider';
import { color } from '../ui/kit';
import { createLogoStore, headerLogo, type LogoBrand } from './headerLogo';

/** localStorage, asked at each use: the demo's lock (R-119) is set after this file loads, and the demo never touches it. */
function browserStorage(): KeyValueStore | null {
  const real = (): Storage | null => {
    try {
      return typeof localStorage !== 'undefined' && !isDemoLocked() ? localStorage : null;
    } catch {
      // quiet: a private window may refuse storage; the logo then just loads from the server each time.
      return null;
    }
  };
  return {
    getItem: (k) => real()?.getItem(k) ?? null,
    setItem: (k, v) => real()?.setItem(k, v),
    removeItem: (k) => real()?.removeItem(k),
  };
}

/** Every gym's logo as this browser knows it; Branding calls `gymLogos.set` after a Save. */
export const gymLogos = createLogoStore(browserStorage());

/** The open gym's logo brand (null: none, or not known yet). Loads it once per sign-in. */
function useGymLogoBrand(): LogoBrand | null {
  const { cloud } = useShop();
  const gymId = cloud?.gymId ?? null;
  const key = cloud?.ownerKey ?? null;
  const brand = useSyncExternalStore(
    gymLogos.subscribe,
    () => (gymId ? gymLogos.get(gymId) ?? null : null),
    () => null,
  );
  useEffect(() => {
    if (!gymId || !key) return undefined;
    let live = true;
    api
      .ownerGym(key)
      .then((g) => {
        if (live) gymLogos.set(gymId, g.brand ?? null);
      })
      // Offline or a slow server: the logo this device remembers stays (or just the name, as before).
      .catch((e: unknown) => console.warn('header: the gym logo did not load, showing the name only', e));
    return () => {
      live = false;
    };
  }, [gymId, key]);
  return brand;
}

/**
 * The logo, about the height of the gym's name beside it, never stretched. Nothing at all when the gym has no logo
 * or the picture fails to load (a broken-picture icon would look worse than the name alone).
 */
export function GymLogo({ gymName, size = 28 }: { gymName: string; size?: number }) {
  const logo = headerLogo(gymName, useGymLogoBrand());
  const [failed, setFailed] = useState<string | null>(null);
  if (!logo || failed === logo.src) return null;
  const pad = 3;
  return (
    <span
      data-testid="header-logo"
      style={{
        flexShrink: 0,
        display: 'inline-grid',
        placeItems: 'center',
        height: size,
        minWidth: size,
        maxWidth: size * 2.2,
        padding: `0 ${pad}px`,
        boxSizing: 'border-box',
        borderRadius: 6,
        background: logo.tile,
        border: `1px solid ${color.border}`,
      }}
    >
      <img
        src={logo.src}
        alt={logo.alt}
        onError={() => setFailed(logo.src)}
        style={{
          display: 'block',
          height: size - 2 * pad - 2,
          width: 'auto',
          maxWidth: size * 2.2 - 2 * pad - 2,
          objectFit: 'contain',
        }}
      />
    </span>
  );
}
