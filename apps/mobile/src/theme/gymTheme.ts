/**
 * Gym branding (Level 1): the whole app takes the joined gym's look; Leave gym brings ForgeAI's
 * back. The gym shop's saved link (shop/gymStore.ts → link.brand, from the join and member_me)
 * says which look is wanted; this keeps the app showing it:
 *
 *  - apply: write the palette into the theme tokens (theme/brandTokens.ts), save the look where
 *    the next launch can read it before anything loads (theme/themeMirror.ts), and bump `epoch` —
 *    the root layout is keyed on it, so every screen re-draws from the new token values;
 *  - opening: after a join, and on every launch while in a branded gym, the gym's logo shows
 *    full-screen for about a second (components/BrandOpening.tsx);
 *  - when: at launch and on a join / leave / erase at once; a look the OWNER changed while the
 *    member is using the app is applied at once only while the logo is on screen (it hides the
 *    re-draw), otherwise it is saved and shown from the next launch — a re-draw resets the
 *    screens, and it must never land in the middle of a workout.
 */
import { create } from 'zustand';

import { isBranded, sameBrand, type HeadingStyle } from '@forgeai/theme';

import { useGymShop } from '@/shop/gymStore';
import type { GymLink } from '@/shop/types';

import { applyBrandToTokens } from './brandTokens';
import { bootMirror } from './bootTheme';
import { writeMirror, type ThemeMirror } from './themeMirror';
import { color } from './tokens';

/** What the branded opening draws (taken when the look is applied, so it never reads stale tokens). */
export interface Opening {
  /** Changes on every opening (its own key: a new one restarts the animation). */
  id: number;
  gymName: string;
  logoUrl: string | null;
  heading: HeadingStyle;
  bg: string;
  ink: string;
}

export interface GymThemeState {
  /** Bumped whenever the tokens change: the root layout's key. */
  epoch: number;
  /** The gym shop's saved link has been read (or waited for long enough). */
  ready: boolean;
  opening: Opening | null;
}

export const useGymTheme = create<GymThemeState>(() => ({ epoch: 0, ready: false, opening: null }));

/** What the tokens show now. */
let shown: ThemeMirror | null = null;
let started = false;
let openings = 0;

function mirrorOf(link: GymLink | null): ThemeMirror | null {
  return link ? { gymId: link.gymId, gymName: link.gymName, brand: link.brand ?? null } : null;
}

function openingFor(m: ThemeMirror): Opening {
  openings += 1;
  return {
    id: openings,
    gymName: m.gymName,
    logoUrl: m.brand?.logoUrl ?? null,
    heading: m.brand?.heading ?? 'normal',
    bg: color.bg,
    ink: color.ink,
  };
}

/** Write the look into the tokens and the mirror, and re-draw the app (with the opening if asked). */
function show(target: ThemeMirror | null, withOpening: boolean): void {
  applyBrandToTokens(target?.brand ?? null);
  shown = target;
  writeMirror(target);
  const current = useGymTheme.getState().opening;
  let opening: Opening | null = null;
  if (target && isBranded(target.brand)) {
    if (withOpening) opening = openingFor(target);
    // The logo is already up: same animation (same id), the new look behind it.
    else if (current) opening = { ...openingFor(target), id: current.id };
  }
  useGymTheme.setState((s) => ({ epoch: s.epoch + 1, opening }));
}

/**
 * Bring the app's look in line with the gym shop's link. `launch`: the app is starting (nothing is
 * on screen yet, so any change is applied, and a branded gym gets its opening). PURE apart from
 * the token writes and the store; exported for tests.
 */
export function reconcileGymTheme(launch: boolean): void {
  const target = mirrorOf(useGymShop.getState().link);
  const gymChanged = (shown?.gymId ?? null) !== (target?.gymId ?? null);
  const lookChanged = !sameBrand(shown?.brand ?? null, target?.brand ?? null);
  if (!lookChanged) {
    // Same look (or a gym without one): nothing to re-draw; keep the name and gym current.
    if (gymChanged || target?.gymName !== shown?.gymName) {
      shown = target;
      writeMirror(target);
    }
    return;
  }
  const openingUp = useGymTheme.getState().opening != null;
  if (launch || gymChanged || openingUp) {
    show(target, launch || gymChanged);
    return;
  }
  // The owner changed the look while the member is using the app: from the next launch.
  writeMirror(target);
}

/** Start once, at app start (root layout). The tokens already hold the look the app booted in. */
export function startGymTheme(): void {
  if (started) return;
  started = true;
  shown = bootMirror();
  if (shown && isBranded(shown.brand)) useGymTheme.setState({ opening: openingFor(shown) });
  const onHydrated = () => {
    reconcileGymTheme(true);
    useGymTheme.setState({ ready: true });
    useGymShop.subscribe((s, prev) => {
      if (s.link !== prev.link) reconcileGymTheme(false);
    });
  };
  if (useGymShop.persist.hasHydrated()) onHydrated();
  else {
    const unsub = useGymShop.persist.onFinishHydration(() => {
      unsub();
      onHydrated();
    });
    // Phone storage that never answers must not hold the app on a blank screen: start in the
    // look the app booted in, and catch up if the shop's link arrives later.
    setTimeout(() => useGymTheme.setState({ ready: true }), 1500);
  }
}

/** The opening finished (or was tapped away). */
export function dismissOpening(): void {
  useGymTheme.setState({ opening: null });
}

/** Tests only: forget what was shown. */
export function resetGymThemeForTests(boot: ThemeMirror | null = null): void {
  shown = boot;
  started = false;
  openings = 0;
  useGymTheme.setState({ epoch: 0, ready: false, opening: null });
}
