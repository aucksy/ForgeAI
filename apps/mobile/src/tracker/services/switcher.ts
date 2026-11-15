/**
 * Audit Phase 4 (point 6): the app a switcher picked on the welcome screen ("Coming from Hevy or
 * Strong?"). The welcome screen shows before the app's screens exist, so the choice is kept here
 * and Home opens the import once it first shows. PURE (this session only).
 */
export type SwitchApp = 'hevy' | 'strong';

let pending: SwitchApp | null = null;

/** Welcome: open the import for this app once the member is in (null = not now). */
export function choosePendingImport(app: SwitchApp | null): void {
  pending = app;
}

/** Home: the app chosen on the welcome screen, once. */
export function takePendingImport(): SwitchApp | null {
  const app = pending;
  pending = null;
  return app;
}

/**
 * R-598 (16 Nov 2026): the card's line under "Coming from Hevy or Strong?". PURE.
 * "Everything stays on this phone." is shown ONLY to a member who is not signed in to a MettleUp
 * account: a signed-in member's workouts are copied to the account (cloud/copySync.ts). The check is
 * the one the copy itself uses (startCloudCopy: an account build with a stored account), which the
 * app's screens read as `useAccount((s) => s.account != null)`. Owner rule: privacy words stay word
 * for word; they only show where they are true.
 */
export const SWITCHER_LOCAL_LINE = 'Everything stays on this phone.';

export function switcherLine({
  later,
  selected,
  signedIn,
}: {
  /** Welcome: the import opens after "Start training". */
  later: boolean;
  selected: SwitchApp | null;
  /** Signed in to a MettleUp account (or not known yet): the workouts are copied to it. */
  signedIn: boolean;
}): string {
  if (later) {
    return selected
      ? `Your ${selected === 'hevy' ? 'Hevy' : 'Strong'} workouts and routines come in right after you tap Start training.`
      : 'Bring your workouts, records and routines with you. Pick your app; it opens right after you start.';
  }
  const bring = 'Bring your workouts, records and routines with you.';
  return signedIn ? bring : `${bring} ${SWITCHER_LOCAL_LINE}`;
}
