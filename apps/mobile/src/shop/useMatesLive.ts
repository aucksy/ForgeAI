/**
 * Can this gym's server hold shared workouts (0040 live)? For the Settings switch "Let my gym mates
 * see my workouts" (R-164). Asks once if nothing has asked yet in this app session.
 */
import { useEffect, useSyncExternalStore } from 'react';

import { matesAreLive, onMatesLiveChange, readMateBoard } from './mateSync';
import type { GymLink } from './types';

export function useMatesLive(link: GymLink | null): boolean {
  const live = useSyncExternalStore(onMatesLiveChange, matesAreLive, matesAreLive);
  useEffect(() => {
    if (link && !matesAreLive()) void readMateBoard(link);
  }, [link]);
  return live;
}
