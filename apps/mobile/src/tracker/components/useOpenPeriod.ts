/**
 * F199 / R-403 (owner, 8 Nov 2026: "every chart behaves the same"): what the box over a picked
 * DAY or period opens, for the dated charts that are not the Profile chart (which keeps its own
 * copy, `HistoryChartCard`). A period with exactly one workout opens that workout; none, several,
 * or a failed read opens the list of that period's workouts ("/history?from&to"). The choice is the
 * pure `periodTarget`; this hook only reads the ids and moves. One page per tap: a second tap while
 * the ids are read is ignored.
 */
import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

import { tap } from '@/lib/haptics';

import { historyRangeParams, periodTarget } from '../lib/historyRange';
import { getWorkoutIdsBetween } from '../services/historyFeed';

/** `open(from, to?)`: a day (`to` left out) or a range, both 'YYYY-MM-DD', both included. */
export function useOpenPeriod(): (from: string, to?: string) => void {
  const router = useRouter();
  const opening = useRef(false);
  return useCallback(
    (from: string, to?: string): void => {
      if (opening.current) return;
      opening.current = true;
      tap();
      const range = historyRangeParams(from, to ?? from);
      void getWorkoutIdsBetween(range.from, range.to)
        .catch((e: unknown) => {
          console.warn('[chart] could not read the workouts of the picked point', e);
          return null;
        })
        .then((ids) => {
          const target = periodTarget(range, ids);
          if (target.pathname === '/session/[id]') router.push({ pathname: '/session/[id]', params: { id: target.params.id } });
          else router.push({ pathname: '/history', params: { ...target.params } });
        })
        .catch((e: unknown) => {
          console.warn('[chart] could not open the picked point', e);
        })
        .finally(() => {
          opening.current = false;
        });
    },
    [router],
  );
}
