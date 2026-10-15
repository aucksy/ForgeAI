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
 *  - `previousFrom` (13 Oct 2026, Hevy's "Previous Workout Values" plus "Same folder"): which past
 *    workouts PREVIOUS, the Target and carried notes read (`tracker/db/historyScope.ts`). Any
 *    workout by default — what every install did before.
 *  - `shareSize` / `shareLook` (15 Oct 2026, Hevy's share backgrounds): the share picture's size
 *    (Post or Story) and background (Dark or See-through), as last picked on the share sheet.
 *    Post + Dark — the only picture before — the first time.
 *  - `weightJump` / `repRange` (Oct 2026, owner: "scientific Targets that follow two simple
 *    settings"): how much a Target adds when it is time to go up (Small ~2.5% · Standard ~5%,
 *    the default · Large ~10%) and which rep range routine rows with the default range use
 *    (Match my goal, the default · Strength · Muscle · Higher reps). The Target and the grey
 *    set hints follow both (`targetStore.ts` query, `coachTargets.ts` memo).
 *
 * New keys backfill to their default for pre-existing persisted blobs via zustand's
 * default shallow merge (persisted state lacks the key → default kept).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { BodyFigure } from '../catalog/bodyMapPaths';
import { isShareLook, isShareSize, type ShareLook, type ShareSize } from '../share/frame';
import { DEFAULT_JUMP, isWeightJump, type WeightJump } from '../engine/progression';
import { isRepRangeChoice, type RepRangeChoice } from '../engine/repRanges';
import { DEFAULT_METRIC, DEFAULT_RANGE, isChartMetric, isChartRange, type ChartMetric, type ChartRange } from '../engine/historyChart';

/** Where an exercise's past numbers come from in a workout: any workout, this routine, this folder. */
export type PreviousFrom = 'any' | 'routine' | 'folder';

/** A choice this version knows. PURE. */
export function isPreviousFrom(v: unknown): v is PreviousFrom {
  return v === 'any' || v === 'routine' || v === 'folder';
}

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
  /** Settings → Workouts → Previous values. */
  previousFrom: PreviousFrom;
  /** The share sheet's Size and Background choices. */
  shareSize: ShareSize;
  shareLook: ShareLook;
  /** Settings → Workouts → Weight jumps. */
  weightJump: WeightJump;
  /** Settings → Workouts → Rep range. */
  repRange: RepRangeChoice;
  setAdvancedSets: (value: boolean) => void;
  setCoachNotes: (value: boolean) => void;
  setSounds: (value: boolean) => void;
  setBodyFigure: (value: BodyFigure) => void;
  setWeeklyGoal: (value: number | null) => void;
  setChartMetric: (value: ChartMetric) => void;
  setChartRange: (value: ChartRange) => void;
  setPreviousFrom: (value: PreviousFrom) => void;
  setShareSize: (value: ShareSize) => void;
  setShareLook: (value: ShareLook) => void;
  setWeightJump: (value: WeightJump) => void;
  setRepRange: (value: RepRangeChoice) => void;
}

/** A goal the app accepts: a whole 1–7, else off. PURE. */
export function cleanWeeklyGoal(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 7 ? v : null;
}

/**
 * One tap of the weekly-goal stepper (Settings → Workouts): Off ↔ 1 … 7, never past either end.
 * Off counts as 0. PURE.
 */
export function stepWeeklyGoal(goal: number | null, by: 1 | -1): number | null {
  const now = cleanWeeklyGoal(goal) ?? 0;
  const next = Math.min(7, Math.max(0, now + by));
  return next === 0 ? null : next;
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
      previousFrom: 'any',
      shareSize: 'post',
      shareLook: 'dark',
      weightJump: DEFAULT_JUMP,
      repRange: 'goal',
      setAdvancedSets: (advancedSets) => set({ advancedSets }),
      setCoachNotes: (coachNotes) => set({ coachNotes }),
      setSounds: (sounds) => set({ sounds }),
      setBodyFigure: (bodyFigure) => set({ bodyFigure }),
      setWeeklyGoal: (value) => set({ weeklyGoal: cleanWeeklyGoal(value) }),
      setChartMetric: (value) => set({ chartMetric: isChartMetric(value) ? value : DEFAULT_METRIC }),
      setChartRange: (value) => set({ chartRange: isChartRange(value) ? value : DEFAULT_RANGE }),
      setPreviousFrom: (value) => set({ previousFrom: isPreviousFrom(value) ? value : 'any' }),
      setShareSize: (value) => set({ shareSize: isShareSize(value) ? value : 'post' }),
      setShareLook: (value) => set({ shareLook: isShareLook(value) ? value : 'dark' }),
      setWeightJump: (value) => set({ weightJump: isWeightJump(value) ? value : DEFAULT_JUMP }),
      setRepRange: (value) => set({ repRange: isRepRangeChoice(value) ? value : 'goal' }),
    }),
    {
      name: 'forgeai-tracker-prefs',
      storage: createJSONStorage(() => AsyncStorage),
      // A stored chip, range, Previous, share, weight-jump or rep-range choice this version does not
      // know falls back to the first-time one.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TrackerPrefsState>;
        return {
          ...current,
          ...p,
          chartMetric: isChartMetric(p.chartMetric) ? p.chartMetric : current.chartMetric,
          chartRange: isChartRange(p.chartRange) ? p.chartRange : current.chartRange,
          previousFrom: isPreviousFrom(p.previousFrom) ? p.previousFrom : current.previousFrom,
          shareSize: isShareSize(p.shareSize) ? p.shareSize : current.shareSize,
          shareLook: isShareLook(p.shareLook) ? p.shareLook : current.shareLook,
          weightJump: isWeightJump(p.weightJump) ? p.weightJump : current.weightJump,
          repRange: isRepRangeChoice(p.repRange) ? p.repRange : current.repRange,
        };
      },
    },
  ),
);
