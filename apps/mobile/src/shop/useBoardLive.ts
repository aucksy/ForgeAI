/**
 * Has the gym's leaderboard answered in this app session (leaderboardSync.ts boardIsLive)? For the
 * Settings row and page "What my gym can see". Asks once if nothing has asked yet, so opening
 * Settings first still finds out.
 */
import { useEffect, useSyncExternalStore } from 'react';

import { boardIsLive, ensureBoardRead, onBoardLiveChange } from './leaderboardSync';
import type { GymLink } from './types';

export function useBoardLive(link: GymLink | null): boolean {
  const live = useSyncExternalStore(onBoardLiveChange, boardIsLive, boardIsLive);
  useEffect(() => {
    if (link) void ensureBoardRead(link).catch((e: unknown) => console.warn('[board] first read', e));
  }, [link]);
  return live;
}
