import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getDb } from '@/db';
import { addDays, todayISO } from '@/lib/date';
import { getMeasurements } from '@/tracker/db/measurementRepo';
import { fmtMeasure, MEASURE_LABEL, summarize } from '@/tracker/engine/measurements';
import type { MuscleSetsSlice } from '@/tracker/engine/volume';
import { countProgressPhotos } from '@/tracker/services/progressPhotos';
import { getRecordEvents, type RecordEventRow } from '@/tracker/services/recordsService';
import { getMuscleSetsBetween } from '@/tracker/services/volumeService';

/** Phase 3 parts of Progress that do not follow the 30/90/180-day range. */
export interface ProgressExtras {
  /** False until the first load finishes (cards wait instead of flashing "nothing yet"). */
  ready: boolean;
  /** Every record, newest first (Progress filters it to the range). */
  events: RecordEventRow[];
  /** Working sets per muscle, last 7 days (the body map). */
  weekMuscles: MuscleSetsSlice[];
  /** Workouts per month, 'YYYY-MM' → count (the reports card). */
  monthCounts: Map<string, number>;
  /** "Waist 81 cm" (or "Waist 31.9 in" under lb, miles — read on each focus), or null. */
  measureLine: string | null;
  photoCount: number;
  /** PG-23: the records or body-map read failed — show "Couldn't load", never "no records". */
  eventsFailed: boolean;
  musclesFailed: boolean;
  /** Read everything again (Try again). */
  retry: () => void;
}

const EMPTY: ProgressExtras = {
  ready: false,
  events: [],
  weekMuscles: [],
  monthCounts: new Map(),
  measureLine: null,
  photoCount: 0,
  eventsFailed: false,
  musclesFailed: false,
  retry: () => {},
};

async function monthCounts(): Promise<Map<string, number>> {
  const rows = await getDb().getAllAsync<{ ym: string; n: number }>(
    'SELECT substr(date_iso, 1, 7) AS ym, COUNT(*) AS n FROM workout_sessions GROUP BY ym',
  );
  return new Map(rows.map((r) => [r.ym, r.n]));
}

async function measureLine(): Promise<string | null> {
  const summary = summarize(await getMeasurements());
  const pick = summary.find((s) => s.kind === 'waist') ?? summary[0];
  return pick ? `${MEASURE_LABEL[pick.kind]} ${fmtMeasure(pick.kind, pick.latest)}` : null;
}

/**
 * Reloads every time Progress comes into view (a workout finished on another tab shows at
 * once). Each part fails on its own: a broken records or body-map read says so on that card
 * (with Try again), never "nothing yet"; the rest of the screen still shows.
 */
export function useProgressExtras(): ProgressExtras {
  const [extras, setExtras] = useState<Omit<ProgressExtras, 'retry'>>(EMPTY);
  const req = useRef(0);

  const load = useCallback(() => {
    const id = ++req.current;
    const today = todayISO();
    void Promise.all([
      getRecordEvents().catch(() => null),
      getMuscleSetsBetween(addDays(today, -6), today).catch(() => null),
      monthCounts().catch(() => new Map<string, number>()),
      measureLine().catch(() => null),
      countProgressPhotos().catch(() => 0),
    ]).then(([events, weekMuscles, counts, line, photos]) => {
      if (req.current !== id) return;
      setExtras({
        ready: true,
        events: events ?? [],
        weekMuscles: weekMuscles ?? [],
        monthCounts: counts,
        measureLine: line,
        photoCount: photos,
        eventsFailed: events == null,
        musclesFailed: weekMuscles == null,
      });
    });
  }, []);

  useFocusEffect(load);

  return { ...extras, retry: load };
}
