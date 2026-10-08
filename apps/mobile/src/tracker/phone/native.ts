/**
 * The native piece for "around the phone" (v0.27.0): `modules/forge-phone` (Kotlin) — Health
 * Connect and the home-screen widgets. Null on the web, in tests and on a build without it;
 * every caller then simply does nothing.
 */
import { Platform } from 'react-native';

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
