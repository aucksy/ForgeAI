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
