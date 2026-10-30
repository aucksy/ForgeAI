/**
 * A request from outside the Gym tab to open one of its parts (R-225 review): a gym reminder
 * tap and a What's new button ask for "My gym" or "Leaderboard", not the Shop the tab opens on.
 * `n` counts requests, so asking for the same part twice still moves the tab.
 */
import { create } from 'zustand';

import type { GymSection } from './gymTab';

type GymSectionRequest = { want: GymSection | null; n: number };

export const useGymSectionRequest = create<GymSectionRequest>(() => ({ want: null, n: 0 }));

export function requestGymSection(section: GymSection): void {
  useGymSectionRequest.setState((s) => ({ want: section, n: s.n + 1 }));
}
