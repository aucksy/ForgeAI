/**
 * Gym branding: the gym's look as this phone last showed it, kept where it can be read
 * SYNCHRONOUSLY while the app is still loading (expo-sqlite's key-value store), so the very first
 * frame — and every colour a file copies when it first loads, frozen files included — is already
 * the gym's (theme/bootTheme.ts). The gym shop's own saved copy (AsyncStorage) is the source of
 * truth; theme/gymTheme.ts keeps this mirror in step with it.
 */
import Storage from 'expo-sqlite/kv-store';

import { parseGymBrand, type GymBrand } from '@forgeai/theme';

export const THEME_MIRROR_KEY = 'forgeai-gym-theme';

export interface ThemeMirror {
  gymId: string;
  gymName: string;
  brand: GymBrand | null;
}

/** A saved mirror, cleaned; null when there is none or it is damaged. PURE. */
export function cleanMirror(raw: unknown): ThemeMirror | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.gymId !== 'string' || !r.gymId || typeof r.gymName !== 'string' || !r.gymName) return null;
  return { gymId: r.gymId, gymName: r.gymName, brand: parseGymBrand(r.brand) };
}

/** Never throws: no mirror is ForgeAI's look. */
export function readMirrorSync(): ThemeMirror | null {
  try {
    const s = Storage.getItemSync(THEME_MIRROR_KEY);
    return s ? cleanMirror(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

/** Never throws: a failed write only means the next launch starts in the last saved look. */
export function writeMirror(m: ThemeMirror | null): void {
  try {
    if (m) Storage.setItemSync(THEME_MIRROR_KEY, JSON.stringify(m));
    else Storage.removeItemSync(THEME_MIRROR_KEY);
  } catch {
    // ignore
  }
}
