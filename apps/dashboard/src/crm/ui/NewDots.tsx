/**
 * F198 "new-feature dots" (R-389): the page side of logic/newDots.ts. One provider in the app shell
 * knows which new features are still unseen on this device; the menu, the bottom bar, More and Settings
 * ask it whether a link of theirs leads to one, and the page heading shows a dot on the feature's page.
 *
 * Opening the feature's page marks it seen at once (the menu and row dots go), but the heading dot stays
 * for that visit, so the owner sees where it is. Next visit (another page, then back, or a reload) it is gone.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { cleanPath, dotFeatures, featuresAt, readSeen, saveSeen, unseen, type NewFeature } from '../logic/newDots';
import { browserStore } from '../logic/whatsNew';
import { NewDot, PageMarkContext } from './kit';
import { useRoute } from './router';

const LitContext = createContext<readonly NewFeature[]>([]);

/** The new features this device has not opened yet (empty when dots are off). */
export function useNewFeatures(): readonly NewFeature[] {
  return useContext(LitContext);
}

/**
 * `enabled`: dots are for the gym's owner on the real, online gym (the features are the owner's pages);
 * never the demo gym or the front desk.
 */
export function NewDotsProvider({
  enabled,
  since,
  menuPaths,
  children,
}: {
  enabled: boolean;
  /** The person's full menu: a feature on a page they do not have never takes a dot slot (13 Nov 2026). */
  menuPaths?: readonly string[];
  /** When the gym was set up (epoch ms): features from before then are not new to it (R-446). */
  since?: number | null;
  children: ReactNode;
}) {
  const path = cleanPath(useRoute().path);
  const store = useMemo(() => browserStore(), []);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => readSeen(store));
  // The page this visit marked seen, so its heading keeps the dot until the person moves on.
  const [kept, setKept] = useState<{ path: string; on: boolean }>({ path, on: false });
  if (kept.path !== path) setKept({ path, on: false });

  // Read once per page: the clock only matters to the day.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [path]);
  const menuKey = menuPaths ? menuPaths.join('|') : '';
  const lit = useMemo(
    () => (enabled ? unseen(dotFeatures(now, undefined, undefined, since, menuKey ? menuKey.split('|') : null), seen) : []),
    [enabled, now, seen, since, menuKey],
  );
  const here = featuresAt(lit, path);
  const hereKeys = here.map((f) => f.key).join(',');

  useEffect(() => {
    if (!hereKeys) return;
    setKept({ path, on: true });
    setSeen((prev) => {
      const next = new Set(prev);
      for (const k of hereKeys.split(',')) next.add(k);
      saveSeen(store, next);
      return next;
    });
  }, [hereKeys, path, store]);

  const mark = here.length > 0 || (kept.path === path && kept.on) ? <NewDot /> : null;
  return (
    <LitContext.Provider value={lit}>
      <PageMarkContext.Provider value={mark}>{children}</PageMarkContext.Provider>
    </LitContext.Provider>
  );
}
