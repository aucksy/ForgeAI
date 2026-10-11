/**
 * Tracker UI preferences (persisted, AsyncStorage). Separate from the frozen
 * ai-owned `settingsStore`.
 *  - `advancedSets`: opt-in RPE (shown as "Track RPE" in Profile). Since Phase 1 the
 *    set TYPE (warm-up / drop / failure) is chosen by tapping the set number for
 *    everyone, as in Hevy; this switch now only adds the RPE column. Key name kept
 *    so existing installs keep their choice.
 *  - `coachNotes` (Phase C2): opt-in AI-enhanced post-workout note via Groq. Off
 *    by default so a keyless / offline / "just the tracker" user never waits on a
 *    network call — the deterministic engine note always shows regardless.
 *  - `sounds` (Phase 1): rest-over bell and new-record chime. On by default.
 *  - `bodyFigure` (v0.25.1): the figure the body map and the share picture draw — male or
 *    female, chosen in Profile. The profile has no sex field, so it starts on the male
 *    figure every install had before.
 *
 * New keys backfill to their default for pre-existing persisted blobs via zustand's
 * default shallow merge (persisted state lacks the key → default kept).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { BodyFigure } from '../catalog/bodyMapPaths';
import { DEFAULT_METRIC, DEFAULT_RANGE, isChartMetric, isChartRange, type ChartMetric, type ChartRange } from '../engine/historyChart';

export interface TrackerPrefsState {
  advancedSets: boolean;
  coachNotes: boolean;
  sounds: boolean;
  bodyFigure: BodyFigure;
  /**
   * Audit Phase 9 (#4): the member's own workouts-a-week goal (1–7), or null (off: the week
   * cards compare with the usual week, and the This week widget with the plan's days).
   */
  weeklyGoal: number | null;
  /**
   * Redesign R2: the Profile chart's chip and range — Kg lifted over the last 12 weeks the first
   * time, then the member's last choice.
   */
  chartMetric: ChartMetric;
  chartRange: ChartRange;
  setAdvancedSets: (value: boolean) => void;
  setCoachNotes: (value: boolean) => void;
  setSounds: (value: boolean) => void;
  setBodyFigure: (value: BodyFigure) => void;
  setWeeklyGoal: (value: number | null) => void;
  setChartMetric: (value: ChartMetric) => void;
  setChartRange: (value: ChartRange) => void;
}

/** A goal the app accepts: a whole 1–7, else off. PURE. */
export function cleanWeeklyGoal(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 7 ? v : null;
}

export const useTrackerPrefs = create<TrackerPrefsState>()(
  persist(
    (set) => ({
      advancedSets: false,
      coachNotes: false,
      sounds: true,
      bodyFigure: 'male',
      weeklyGoal: null,
      chartMetric: DEFAULT_METRIC,
      chartRange: DEFAULT_RANGE,
      setAdvancedSets: (advancedSets) => set({ advancedSets }),
      setCoachNotes: (coachNotes) => set({ coachNotes }),
      setSounds: (sounds) => set({ sounds }),
      setBodyFigure: (bodyFigure) => set({ bodyFigure }),
      setWeeklyGoal: (value) => set({ weeklyGoal: cleanWeeklyGoal(value) }),
      setChartMetric: (value) => set({ chartMetric: isChartMetric(value) ? value : DEFAULT_METRIC }),
      setChartRange: (value) => set({ chartRange: isChartRange(value) ? value : DEFAULT_RANGE }),
    }),
    {
      name: 'forgeai-tracker-prefs',
      storage: createJSONStorage(() => AsyncStorage),
      // A stored chip or range this version does not know falls back to the first-time choice.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TrackerPrefsState>;
        return {
          ...current,
          ...p,
          chartMetric: isChartMetric(p.chartMetric) ? p.chartMetric : current.chartMetric,
          chartRange: isChartRange(p.chartRange) ? p.chartRange : current.chartRange,
        };
      },
    },
  ),
);
