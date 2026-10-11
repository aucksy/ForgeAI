/**
 * Redesign R4: which folders on the Workout tab the member opened or shut (persisted, like the
 * tracker prefs). Only the member's own choices are kept — a folder never touched follows the
 * default of `isFolderOpen` (the Up next folder open, the rest shut).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { cleanOpenMap, prunedOpenMap } from '../lib/workoutTab';

interface FolderOpenState {
  open: Record<string, boolean>;
  setOpen: (folderId: string, value: boolean) => void;
  /** Forget folders that no longer exist. */
  prune: (folderIds: readonly string[]) => void;
}

export const useFolderOpen = create<FolderOpenState>()(
  persist(
    (set, get) => ({
      open: {},
      setOpen: (folderId, value) => set({ open: cleanOpenMap({ ...get().open, [folderId]: value }) }),
      prune: (folderIds) => {
        const next = prunedOpenMap(get().open, folderIds);
        if (Object.keys(next).length !== Object.keys(get().open).length) set({ open: next });
      },
    }),
    {
      name: 'forgeai-folder-open',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ open: s.open }),
      merge: (persisted, current) => ({ ...current, open: cleanOpenMap((persisted as { open?: unknown } | null)?.open) }),
    },
  ),
);
