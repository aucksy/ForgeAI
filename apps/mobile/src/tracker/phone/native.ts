/**
 * The native piece for "around the phone" (v0.27.0): `modules/forge-phone` (Kotlin) — Health
 * Connect and the home-screen widgets. Null on the web, in tests and on a build without it;
 * every caller then simply does nothing.
 */
import { Platform } from 'react-native';

export type GymShortcutResult = 'asked' | 'updated' | 'none' | 'unsupported' | 'no-logo' | 'failed';

export interface ForgePhone {
  healthStatus(): 'available' | 'update' | 'unavailable';
  healthGranted(): Promise<boolean>;
  healthRequest(): boolean;
  healthOpenSettings(): boolean;
  healthWrite(json: string): Promise<number>;
  healthDelete(id: string): Promise<boolean>;
  widgetSave(json: string): boolean;
  widgetCount(): number;
  widgetPin(kind: 'today' | 'week'): boolean;
  /** Audit Phase 9: the app icon's long-press shortcuts (JSON list of `AppShortcut`); absent on older builds. */
  shortcutsSave?(json: string): boolean;
  /**
   * 15 Oct 2026: the NEXT launch's start-up screen — plain (no ForgeAI logo) while in a branded gym.
   * Android 13+; absent on older builds.
   */
  splashPlain?(plain: boolean): 'set' | 'reset' | 'unsupported';
  /** OWNER-INBOX #11: Android can pin a shortcut on the home screen (8.0+, a launcher that allows it). */
  gymShortcutSupported?(): boolean;
  /**
   * Draws the gym's logo as a home-screen shortcut and asks Android to pin it, or redraws the pinned
   * one. ask=false only redraws a pinned one ('none' when there is none).
   */
  gymShortcutPin?(name: string, logoUrl: string, bg: string, ask: boolean): Promise<GymShortcutResult>;
  /** Left the gym: grey out the pinned shortcut with this line. */
  gymShortcutOff?(message: string): boolean;
  /** v0.28.0: an export shared to ForgeAI (copied into the app's cache), taken once. */
  takeSharedFile(): Promise<{ uri: string; name: string; type: string } | { error: 'too_big' | 'unreadable' } | null>;
  addListener(event: 'onSharedFile', cb: () => void): { remove: () => void };
}

let mod: ForgePhone | null | undefined;
export function phoneNative(): ForgePhone | null {
  if (mod !== undefined) return mod;
  mod = null;
  if (Platform.OS !== 'android') return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as { requireOptionalNativeModule: (n: string) => unknown };
    mod = (core.requireOptionalNativeModule('ForgePhone') as ForgePhone | null) ?? null;
  } catch {
    mod = null;
  }
  return mod;
}
