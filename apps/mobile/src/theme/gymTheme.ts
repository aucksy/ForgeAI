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
 *  - when: at launch, and on the member's OWN join / Leave / erase, at once. A change the member
 *    did not make — the owner changed the look, or the gym no longer knows this phone (left on
 *    another phone, removed) — is applied at once only while the logo is on screen (it hides the
 *    re-draw); otherwise it is saved (the next launch starts in it) and WAITS for a safe moment:
 *    the app coming back to the foreground with no workout open (`showWaitingLook`), the gym's
 *    logo opening covering the re-draw. A re-draw resets the screens — a running hold timer, an
 *    open sheet — so it never lands in the middle of a workout.
 *  - `look`: the gym (name, logo, heading) the tokens are painted for. The header mark
 *    (components/GymBrandMark.tsx) draws from it, so the logo and name switch together with the
 *    colours, never before them.
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
  /** The gym whose look the tokens hold now (null = ForgeAI's). */
  look: ThemeMirror | null;
}

export const useGymTheme = create<GymThemeState>(() => ({ epoch: 0, ready: false, opening: null, look: null }));

/** What the tokens show now. */
let shown: ThemeMirror | null = null;
let started = false;
/** The gym shop's saved link has been read (before that, "no link" means "not known yet"). */
let linkRead = false;
let openings = 0;
/** "A workout is open now" — set by the root layout (theme code does not load the workout store). */
let workoutOpen: () => boolean = () => false;

function mirrorOf(link: GymLink | null): ThemeMirror | null {
  return link ? { gymId: link.gymId, gymName: link.gymName, brand: link.brand ?? null } : null;
}

function setShown(m: ThemeMirror | null): void {
  shown = m;
  useGymTheme.setState({ look: m });
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
  writeMirror(target);
  const current = useGymTheme.getState().opening;
  let opening: Opening | null = null;
  if (target && isBranded(target.brand)) {
    if (withOpening) opening = openingFor(target);
    // The logo is already up: same animation (same id), the new look behind it.
    else if (current) opening = { ...openingFor(target), id: current.id };
  }
  shown = target;
  useGymTheme.setState((s) => ({ epoch: s.epoch + 1, opening, look: target }));
}

/** The link's look differs from what the tokens hold. */
function lookDiffers(target: ThemeMirror | null): boolean {
  return !sameBrand(shown?.brand ?? null, target?.brand ?? null);
}

/**
 * The gym no longer knows this phone (left on another phone, removed by the gym): the shop
 * unlinked it with words for the join card (shop/gymActions.ts → unlink(UNLINKED_TEXT)). The
 * member's own Leave and an erase unlink without words.
 */
function unlinkedByGym(): boolean {
  const s = useGymShop.getState();
  return s.link == null && s.notice != null;
}

/**
 * Bring the app's look in line with the gym shop's link. `launch`: the app is starting (nothing is
 * on screen yet, so any change is applied, and a branded gym gets its opening). PURE apart from
 * the token writes and the stores; exported for tests.
 */
export function reconcileGymTheme(launch: boolean): void {
  const target = mirrorOf(useGymShop.getState().link);
  const gymChanged = (shown?.gymId ?? null) !== (target?.gymId ?? null);
  if (!lookDiffers(target)) {
    // Same look (or a gym without one): nothing to re-draw; keep the name and gym current.
    if (gymChanged || target?.gymName !== shown?.gymName) {
      setShown(target);
      writeMirror(target);
    }
    return;
  }
  const openingUp = useGymTheme.getState().opening != null;
  // The member's own join, Leave or erase: at once (they are in the Shop or Settings, not lifting).
  const ownMove = gymChanged && !(target == null && unlinkedByGym());
  if (launch || ownMove || openingUp) {
    show(target, launch || (ownMove && target != null));
    return;
  }
  // Not the member's doing (the owner changed the look; the gym dropped this phone): the next
  // launch starts in it, and it waits for the next safe moment (showWaitingLook).
  writeMirror(target);
}

/**
 * The app came back to the foreground: show a look that is waiting (see reconcileGymTheme), unless
 * a workout is open — then it keeps waiting (the next foreground, or the next launch, which starts
 * in it). A gym's look comes in under its logo opening; ForgeAI's look simply re-draws as the app
 * comes back. Returns whether it re-drew. Exported for tests.
 */
export function showWaitingLook(): boolean {
  if (!linkRead) return false;
  const target = mirrorOf(useGymShop.getState().link);
  if (!lookDiffers(target)) {
    if ((shown?.gymId ?? null) !== (target?.gymId ?? null) || target?.gymName !== shown?.gymName) {
      setShown(target);
      writeMirror(target);
    }
    return false;
  }
  if (workoutOpen()) return false;
  show(target, true);
  return true;
}

/** The root layout tells the theme how to see an open workout (never re-draw during one). */
export function setWorkoutCheck(check: () => boolean): void {
  workoutOpen = check;
}

/** Start once, at app start (root layout). The tokens already hold the look the app booted in. */
export function startGymTheme(): void {
  if (started) return;
  started = true;
  setShown(bootMirror());
  if (shown && isBranded(shown.brand)) useGymTheme.setState({ opening: openingFor(shown) });
  const onHydrated = () => {
    linkRead = true;
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
  linkRead = true;
  openings = 0;
  workoutOpen = () => false;
  useGymTheme.setState({ epoch: 0, ready: false, opening: null, look: boot });
}
