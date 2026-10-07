/**
 * The plan builder's answers and the plan it made (Phase 4). In memory only: shared by the
 * builder screen and its "leave out" picker; nothing is written until the member follows
 * the plan.
 */
import { create } from 'zustand';

import type { Goal, UserProfile } from '@/types/models';

import { buildPlan, swapInPlan, type BuilderInput, type BuiltPlan } from '../plans/builder';
import { EASY_WEEKS_DEFAULT } from '../plans/easyWeek';
import type { SoreArea } from '../plans/fit';

export interface PlanBuilderState {
  input: BuilderInput;
  easyWeeks: boolean;
  /** The plan made from the answers, once "Build my plan" was tapped. */
  plan: BuiltPlan | null;
  /** Names of the exercises in `input.avoid`, for the chips. */
  avoidNames: Record<string, string>;
  start: (from: { goal: Goal | null; level: UserProfile['experience'] | null }) => void;
  set: (patch: Partial<BuilderInput>) => void;
  toggleSore: (a: SoreArea) => void;
  toggleAvoid: (key: string, name: string) => void;
  setEasyWeeks: (v: boolean) => void;
  build: () => void;
  swap: (routineIndex: number, exerciseIndex: number, key: string) => void;
  clearPlan: () => void;
}

export const DEFAULT_INPUT: BuilderInput = {
  goal: 'muscle',
  level: 'beginner',
  days: 3,
  split: 'auto',
  minutes: 60,
  equipment: 'gym',
  sore: [],
  avoid: [],
};

export const usePlanBuilder = create<PlanBuilderState>()((set, get) => ({
  input: DEFAULT_INPUT,
  easyWeeks: EASY_WEEKS_DEFAULT,
  plan: null,
  avoidNames: {},
  start: (from) =>
    set({
      input: { ...DEFAULT_INPUT, goal: from.goal ?? DEFAULT_INPUT.goal, level: from.level ?? DEFAULT_INPUT.level },
      easyWeeks: EASY_WEEKS_DEFAULT,
      plan: null,
      avoidNames: {},
    }),
  set: (patch) => set({ input: { ...get().input, ...patch } }),
  toggleSore: (a) => {
    const sore = get().input.sore;
    set({ input: { ...get().input, sore: sore.includes(a) ? sore.filter((x) => x !== a) : [...sore, a] } });
  },
  toggleAvoid: (key, name) => {
    const { input, avoidNames } = get();
    const has = input.avoid.includes(key);
    const names = { ...avoidNames };
    if (has) delete names[key];
    else names[key] = name;
    set({ input: { ...input, avoid: has ? input.avoid.filter((k) => k !== key) : [...input.avoid, key] }, avoidNames: names });
  },
  setEasyWeeks: (easyWeeks) => set({ easyWeeks }),
  build: () => set({ plan: buildPlan(get().input) }),
  swap: (r, x, key) => {
    const plan = get().plan;
    if (plan) set({ plan: swapInPlan(plan, get().input, r, x, key) });
  },
  clearPlan: () => set({ plan: null }),
}));
