/**
 * Redesign R6: one page of Settings (Hevy's list of pages). The back arrow goes back to Settings
 * — or, opened cold with nothing behind it, to Settings itself.
 *
 * F198 "follow the dots" (R-389/R-390): opening a page marks the new features that live on it as seen on this
 * phone, so the dots on the way here (tab, Settings button, row) go at once. The page's own dot shows for this
 * visit only, so the member sees where the feature is: drawn by the page beside the feature's heading
 * (`useNewHere`, e.g. "Sleep and workouts" on Health apps). A page that IS the feature (Ask an AI) draws no
 * page dot: a dot in the title row's corner pointed at nothing (fresh-eyes review, 7 Nov 2026).
 */
import { usePathname, useRouter } from 'expo-router';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { markNewDotsSeen, useFeaturesAt } from '@/lib/newDotsStore';
import { space } from '@/theme/tokens';

/** This visit's page, when it opened with a new feature on it (null = nothing new here). */
const NewHere = createContext<`page:${string}` | null>(null);

/** For a page drawing its own dot: the dot's place while this visit shows it, else null. */
export function useNewHere(): `page:${string}` | null {
  return useContext(NewHere);
}

export function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const here = useFeaturesAt(path);
  // Kept for the whole visit: marking them seen takes them out of `here` at once.
  const [newHere, setNewHere] = useState(false);
  useEffect(() => {
    if (here.length === 0) return;
    setNewHere(true);
    markNewDotsSeen(here.map((f) => f.id));
  }, [here]);
  const spot = newHere ? (`page:${path}` as const) : null;
  return (
    <NewHere.Provider value={spot}>
      <Screen
        title={title}
        onBack={() => goBack(router, '/settings')}
      >
        <View style={{ gap: space.md }}>{children}</View>
      </Screen>
    </NewHere.Provider>
  );
}
