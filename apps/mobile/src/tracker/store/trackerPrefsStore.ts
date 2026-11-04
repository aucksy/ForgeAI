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
 *  - `previousFrom` (13 Oct 2026, Hevy's "Previous Workout Values"): which past workouts PREVIOUS,
 *    the Target and carried notes read (`tracker/db/historyScope.ts`). Any workout by default.
 *    R-61 (owner, 22 Oct 2026: "it should be even global"): every saved choice went back to Any
 *    workout once (`version` 1), and "Same folder" is retired (a stored one reads as Any workout).
 *  - `shareSize` / `shareLook` (15 Oct 2026, Hevy's share backgrounds): the share picture's size
 *    (Post or Story) and background (Dark or See-through), as last picked on the share sheet.
 *    Post + Dark — the only picture before — the first time.
 *  - `shareGym` (F146, 4 Nov 2026): the gym's name and logo on share pictures — Show (default) or
 *    Hide, as last picked on the share sheet. Asked only of a member in a gym.
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
import { DEFAULT_JUMP, DEFAULT_STUCK, isStuckChoice, isWeightJump, type StuckChoice, type WeightJump } from '../engine/progression';
import { isRepRangeChoice, type RepRangeChoice } from '../engine/repRanges';
import { DEFAULT_REST_SOUND, isRestSoundId, type RestSoundId } from '../services/restSounds';
import { DEFAULT_METRIC, DEFAULT_RANGE, isChartMetric, isChartRange, type ChartMetric, type ChartRange } from '../engine/historyChart';
import { cleanInUseChoices } from '../lib/inUse';

/** Where an exercise's past numbers come from in a workout: any workout, this routine, this folder. */
export type PreviousFrom = 'any' | 'routine' | 'folder';

/** A choice this version knows. PURE. */
export function isPreviousFrom(v: unknown): v is PreviousFrom {
  return v === 'any' || v === 'routine' || v === 'folder';
}

/** R-61: the setting as it applies now — "Same folder" is retired and reads as Any workout. PURE. */
export function shownPreviousFrom(v: unknown): PreviousFrom {
  return v === 'routine' ? 'routine' : 'any';
}

/** R-61: a saved settings blob from before version 1 starts "Previous values" on Any workout. PURE. */
export function migratePrefs(persisted: unknown, version: number): Record<string, unknown> {
  const p = persisted != null && typeof persisted === 'object' ? { ...(persisted as Record<string, unknown>) } : {};
  if (version < 1) p.previousFrom = 'any';
  // R-304 (owner, 3 Nov 2026): "Show In use after sets" is now the master switch and the equipment
  // decides per exercise, so it starts ON once for every install (it was off by default before, so a
  // saved "off" almost always meant "never touched").
  if (version < 2) p.inUseAfterSet = true;
  return p;
}

export interface TrackerPrefsState {
  advancedSets: boolean;
  coachNotes: boolean;
  sounds: boolean;
  /** R-55: Settings → Workouts → Rest-over sound (the ForgeAI chime unless picked). */
  restSound: RestSoundId;
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
  /**
   * R-136 (owner, 26 Oct 2026; built 28 Oct): under "Same routine", body-weight moves (push-ups,
   * air squats, pull-ups...) still read EVERY workout for PREVIOUS and the Target, empty workouts
   * included (`historyScope.scopeFor`). On by default; Settings → Workouts → Previous values.
   */
  bodyWeightAnyWorkout: boolean;
  /** The share sheet's Size and Background choices. */
  shareSize: ShareSize;
  shareLook: ShareLook;
  /** F146: the gym's name and logo on share pictures (true = Show). */
  shareGym: boolean;
  /** Settings → Workouts → Weight jumps. */
  weightJump: WeightJump;
  /** Settings → Workouts → Rep range. */
  repRange: RepRangeChoice;
  /**
   * R-70 (owner, 22 Oct 2026): "In use" fills the screen by itself the moment a set's rest starts,
   * so people nearby see the machine is taken while the member walks away.
   * R-304 (owner, 3 Nov 2026): now the MASTER switch, ON by default: off = never by itself; on = each
   * exercise decides (`inUseByExercise`, else `inUseDefault` by equipment, lib/inUse.ts).
   */
  inUseAfterSet: boolean;
  /**
   * R-304 (owner, 3 Nov 2026: "the member's own switch per exercise wins and is remembered"): the
   * member's own In use choice per exercise id (the tick on the In use screen). Missing = the
   * equipment default.
   */
  inUseByExercise: Record<string, boolean>;
  /** R-308 (owner, 3 Nov 2026): Settings → More workout choices → "When I'm stuck at a weight". */
  stuckChoice: StuckChoice;
  /**
   * R-308: per exercise id, the day the member tapped "Try" on a step-back offer (today's Target is
   * the lighter one) or "Stay" (no new offer until 4 more stuck workouts from that day).
   */
  stepBackByExercise: Record<string, StepBackChoice>;
  setAdvancedSets: (value: boolean) => void;
  setCoachNotes: (value: boolean) => void;
  setSounds: (value: boolean) => void;
  setRestSound: (value: RestSoundId) => void;
  setBodyFigure: (value: BodyFigure) => void;
  setWeeklyGoal: (value: number | null) => void;
  setChartMetric: (value: ChartMetric) => void;
  setChartRange: (value: ChartRange) => void;
  setPreviousFrom: (value: PreviousFrom) => void;
  setBodyWeightAnyWorkout: (value: boolean) => void;
  setShareSize: (value: ShareSize) => void;
  setShareLook: (value: ShareLook) => void;
  setShareGym: (value: boolean) => void;
  setWeightJump: (value: WeightJump) => void;
  setInUseAfterSet: (value: boolean) => void;
  setInUseFor: (exerciseId: string, on: boolean) => void;
  setRepRange: (value: RepRangeChoice) => void;
  setStuckChoice: (value: StuckChoice) => void;
  /** R-308: "Try 40 kg" (tried) or "Stay at 45 kg" (declined), on `dateISO`. */
  setStepBack: (exerciseId: string, kind: 'tried' | 'declined', dateISO: string) => void;
}

/** R-308: what the member said to a step-back offer, by day (YYYY-MM-DD). */
export interface StepBackChoice {
  triedISO?: string;
  declinedISO?: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** R-308: a stored step-back map, keeping only well-formed days. PURE. */
export function cleanStepBackChoices(v: unknown): Record<string, StepBackChoice> {
  if (v == null || typeof v !== 'object') return {};
  const out: Record<string, StepBackChoice> = {};
  for (const [id, c] of Object.entries(v as Record<string, unknown>)) {
    if (!id || c == null || typeof c !== 'object') continue;
    const { triedISO, declinedISO } = c as Record<string, unknown>;
    const one: StepBackChoice = {};
    if (typeof triedISO === 'string' && ISO_DAY.test(triedISO)) one.triedISO = triedISO;
    if (typeof declinedISO === 'string' && ISO_DAY.test(declinedISO)) one.declinedISO = declinedISO;
    if (one.triedISO || one.declinedISO) out[id] = one;
  }
  return out;
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
      restSound: DEFAULT_REST_SOUND,
      bodyFigure: 'male',
      weeklyGoal: null,
      chartMetric: DEFAULT_METRIC,
      chartRange: DEFAULT_RANGE,
      previousFrom: 'any',
      bodyWeightAnyWorkout: true,
      shareSize: 'post',
      shareLook: 'dark',
      shareGym: true,
      weightJump: DEFAULT_JUMP,
      repRange: 'goal',
      inUseAfterSet: true,
      inUseByExercise: {},
      stuckChoice: DEFAULT_STUCK,
      stepBackByExercise: {},
      setAdvancedSets: (advancedSets) => set({ advancedSets }),
      setCoachNotes: (coachNotes) => set({ coachNotes }),
      setSounds: (sounds) => set({ sounds }),
      setRestSound: (value) => set({ restSound: isRestSoundId(value) ? value : DEFAULT_REST_SOUND }),
      setBodyFigure: (bodyFigure) => set({ bodyFigure }),
      setWeeklyGoal: (value) => set({ weeklyGoal: cleanWeeklyGoal(value) }),
      setChartMetric: (value) => set({ chartMetric: isChartMetric(value) ? value : DEFAULT_METRIC }),
      setChartRange: (value) => set({ chartRange: isChartRange(value) ? value : DEFAULT_RANGE }),
      setPreviousFrom: (value) => set({ previousFrom: isPreviousFrom(value) ? value : 'any' }),
      setBodyWeightAnyWorkout: (value) => set({ bodyWeightAnyWorkout: value !== false }),
      setShareSize: (value) => set({ shareSize: isShareSize(value) ? value : 'post' }),
      setShareLook: (value) => set({ shareLook: isShareLook(value) ? value : 'dark' }),
      setShareGym: (value) => set({ shareGym: value !== false }),
      setWeightJump: (value) => set({ weightJump: isWeightJump(value) ? value : DEFAULT_JUMP }),
      setRepRange: (value) => set({ repRange: isRepRangeChoice(value) ? value : 'goal' }),
      setInUseAfterSet: (inUseAfterSet) => set({ inUseAfterSet: inUseAfterSet === true }),
      setStuckChoice: (value) => set({ stuckChoice: isStuckChoice(value) ? value : DEFAULT_STUCK }),
      setStepBack: (exerciseId, kind, dateISO) => {
        if (!exerciseId || !ISO_DAY.test(dateISO)) return;
        // Tried today replaces a decline; a decline replaces today's try.
        set((s) => ({ stepBackByExercise: { ...s.stepBackByExercise, [exerciseId]: kind === 'tried' ? { triedISO: dateISO } : { declinedISO: dateISO } } }));
      },
      setInUseFor: (exerciseId, on) => {
        if (!exerciseId) return;
        set((s) => ({ inUseByExercise: { ...s.inUseByExercise, [exerciseId]: on === true } }));
      },
    }),
    {
      name: 'forgeai-tracker-prefs',
      storage: createJSONStorage(() => AsyncStorage),
      // R-61: version 1 = "Previous values" starts again on Any workout once, for every install.
      // R-304: version 2 = "Show In use after sets" (now the master switch) starts on once.
      version: 2,
      migrate: (persisted, version) => migratePrefs(persisted, version) as unknown as TrackerPrefsState,
      // A stored chip, range, Previous, share, weight-jump or rep-range choice this version does not
      // know falls back to the first-time one.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TrackerPrefsState>;
        return {
          ...current,
          ...p,
          chartMetric: isChartMetric(p.chartMetric) ? p.chartMetric : current.chartMetric,
          chartRange: isChartRange(p.chartRange) ? p.chartRange : current.chartRange,
          previousFrom: isPreviousFrom(p.previousFrom) ? shownPreviousFrom(p.previousFrom) : current.previousFrom,
          shareSize: isShareSize(p.shareSize) ? p.shareSize : current.shareSize,
          shareLook: isShareLook(p.shareLook) ? p.shareLook : current.shareLook,
          shareGym: typeof p.shareGym === 'boolean' ? p.shareGym : current.shareGym,
          weightJump: isWeightJump(p.weightJump) ? p.weightJump : current.weightJump,
          repRange: isRepRangeChoice(p.repRange) ? p.repRange : current.repRange,
          restSound: isRestSoundId(p.restSound) ? p.restSound : current.restSound,
          inUseAfterSet: typeof p.inUseAfterSet === 'boolean' ? p.inUseAfterSet : current.inUseAfterSet,
          inUseByExercise: cleanInUseChoices(p.inUseByExercise),
          stuckChoice: isStuckChoice(p.stuckChoice) ? p.stuckChoice : current.stuckChoice,
          stepBackByExercise: cleanStepBackChoices(p.stepBackByExercise),
          bodyWeightAnyWorkout: typeof p.bodyWeightAnyWorkout === 'boolean' ? p.bodyWeightAnyWorkout : current.bodyWeightAnyWorkout,
        };
      },
    },
  ),
);
