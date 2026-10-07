import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getDb } from '@/db';
import { addDays, todayISO } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { getMeasurements } from '@/tracker/db/measurementRepo';
import { MEASURE_LABEL, measureUnit, summarize } from '@/tracker/engine/measurements';
import type { MuscleSetsSlice } from '@/tracker/engine/volume';
import { countProgressPhotos } from '@/tracker/services/progressPhotos';
import { getRecordEvents, type RecordEventRow } from '@/tracker/services/recordsService';
import { getMuscleSetsBetween } from '@/tracker/services/volumeService';

/** Phase 3 parts of Progress that do not follow the 30/90/180-day range. */
export interface ProgressExtras {
  /** Every record, newest first (Progress filters it to the range). */
  events: RecordEventRow[];
  /** Working sets per muscle, last 7 days (the body map). */
  weekMuscles: MuscleSetsSlice[];
  /** Workouts per month, 'YYYY-MM' → count (the reports card). */
  monthCounts: Map<string, number>;
  /** "Waist 81 cm", or null. */
  measureLine: string | null;
  photoCount: number;
}

const EMPTY: ProgressExtras = { events: [], weekMuscles: [], monthCounts: new Map(), measureLine: null, photoCount: 0 };

async function monthCounts(): Promise<Map<string, number>> {
  const rows = await getDb().getAllAsync<{ ym: string; n: number }>(
    'SELECT substr(date_iso, 1, 7) AS ym, COUNT(*) AS n FROM workout_sessions GROUP BY ym',
  );
  return new Map(rows.map((r) => [r.ym, r.n]));
}

async function measureLine(): Promise<string | null> {
  const summary = summarize(await getMeasurements());
  const pick = summary.find((s) => s.kind === 'waist') ?? summary[0];
  return pick ? `${MEASURE_LABEL[pick.kind]} ${trimNum(pick.latest)} ${measureUnit(pick.kind)}` : null;
}

/**
 * Reloads every time Progress comes into view (a workout finished on another tab shows at
 * once). Each part fails on its own: a broken read leaves that card empty, never the screen.
 */
export function useProgressExtras(): ProgressExtras {
  const [extras, setExtras] = useState<ProgressExtras>(EMPTY);
  const req = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const id = ++req.current;
      const today = todayISO();
      void Promise.all([
        getRecordEvents().catch(() => [] as RecordEventRow[]),
        getMuscleSetsBetween(addDays(today, -6), today).catch(() => [] as MuscleSetsSlice[]),
        monthCounts().catch(() => new Map<string, number>()),
        measureLine().catch(() => null),
        countProgressPhotos().catch(() => 0),
      ]).then(([events, weekMuscles, counts, line, photos]) => {
        if (req.current !== id) return;
        setExtras({ events, weekMuscles, monthCounts: counts, measureLine: line, photoCount: photos });
      });
    }, []),
  );

  return extras;
}
