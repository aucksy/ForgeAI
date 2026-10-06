/**
 * The bundled exercise library (Phase 2). The entries live in `catalogData.ts` (generated
 * from the source dataset); this module indexes them and answers lookups.
 */
import { CATALOG } from './catalogData';
import type { CatalogEntry } from './types';

export { CATALOG };

/** Bump when entries are added or their linking aliases change: installs re-sync once. */
export const CATALOG_VERSION = 1;

const BY_KEY = new Map<string, CatalogEntry>(CATALOG.map((e) => [e.key, e]));

export function catalogEntry(key: string | null | undefined): CatalogEntry | null {
  if (!key) return null;
  return BY_KEY.get(key) ?? null;
}

/** lowercase, trim, collapse internal whitespace (the frozen exerciseRepo's rule). */
export function normName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

const BY_NAME = (() => {
  const m = new Map<string, CatalogEntry>();
  // Names first, so an entry's own name always beats another entry's link name.
  for (const e of CATALOG) {
    const k = normName(e.name);
    if (!m.has(k)) m.set(k, e);
  }
  for (const e of CATALOG) {
    for (const n of e.linkNames ?? []) {
      const k = normName(n);
      if (!m.has(k)) m.set(k, e);
    }
  }
  return m;
})();

/**
 * The entry this exact name means: its own name or one of its link names (ignoring case
 * and spaces). Search aliases never link — "row" must not swallow a custom exercise.
 */
export function catalogEntryByName(name: string): CatalogEntry | null {
  return BY_NAME.get(normName(name)) ?? null;
}
