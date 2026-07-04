/**
 * Arjun's active 6-day PPL (A/B) plan. Array order == rotation order
 * (plan_days.day_order). Rep ranges: 5-8 heavy compounds, 8-12 accessories,
 * 12-15 isolation. Every movement is loaded (no 0 kg bodyweight rows) so
 * volume/e1RM analytics stay meaningful.
 */
import type { DayType } from '@/types/models';

import type { ExerciseKey } from './exercises';

export interface SeedPlanExercise {
  key: ExerciseKey;
  sets: number;
  repMin: number;
  repMax: number;
}

export interface SeedPlanDay {
  name: string;
  dayType: DayType;
  exercises: readonly SeedPlanExercise[];
}

export const PLAN_NAME = 'Push Pull Legs — 6 Day';

export const PLAN_DAYS: readonly SeedPlanDay[] = [
  {
    name: 'Push Day A',
    dayType: 'push',
    exercises: [
      { key: 'benchPress', sets: 4, repMin: 5, repMax: 8 },
      { key: 'overheadPress', sets: 3, repMin: 5, repMax: 8 },
      { key: 'inclineDbPress', sets: 3, repMin: 8, repMax: 12 },
      { key: 'cableFly', sets: 3, repMin: 12, repMax: 15 },
      { key: 'lateralRaise', sets: 3, repMin: 12, repMax: 15 },
      { key: 'tricepsPushdown', sets: 3, repMin: 8, repMax: 12 },
    ],
  },
  {
    name: 'Pull Day A',
    dayType: 'pull',
    exercises: [
      { key: 'deadlift', sets: 3, repMin: 5, repMax: 8 },
      { key: 'latPulldown', sets: 3, repMin: 8, repMax: 12 },
      { key: 'seatedCableRow', sets: 3, repMin: 8, repMax: 12 },
      { key: 'facePull', sets: 3, repMin: 12, repMax: 15 },
      { key: 'barbellCurl', sets: 3, repMin: 8, repMax: 12 },
      { key: 'hammerCurl', sets: 3, repMin: 12, repMax: 15 },
    ],
  },
  {
    name: 'Legs Day A',
    dayType: 'legs',
    exercises: [
      { key: 'squat', sets: 4, repMin: 5, repMax: 8 },
      { key: 'romanianDeadlift', sets: 3, repMin: 8, repMax: 12 },
      { key: 'legPress', sets: 3, repMin: 8, repMax: 12 },
      { key: 'legExtension', sets: 3, repMin: 12, repMax: 15 },
      { key: 'standingCalfRaise', sets: 4, repMin: 12, repMax: 15 },
      { key: 'cableCrunch', sets: 3, repMin: 12, repMax: 15 },
    ],
  },
  {
    name: 'Push Day B',
    dayType: 'push',
    exercises: [
      { key: 'overheadPress', sets: 4, repMin: 5, repMax: 8 },
      { key: 'inclineBarbellPress', sets: 3, repMin: 5, repMax: 8 },
      { key: 'machineChestPress', sets: 3, repMin: 8, repMax: 12 },
      { key: 'pecDeck', sets: 3, repMin: 12, repMax: 15 },
      { key: 'lateralRaise', sets: 3, repMin: 12, repMax: 15 },
      { key: 'overheadTricepsExtension', sets: 3, repMin: 8, repMax: 12 },
    ],
  },
  {
    name: 'Pull Day B',
    dayType: 'pull',
    exercises: [
      { key: 'barbellRow', sets: 4, repMin: 5, repMax: 8 },
      { key: 'latPulldown', sets: 3, repMin: 8, repMax: 12 },
      { key: 'shrug', sets: 3, repMin: 12, repMax: 15 },
      { key: 'rearDeltFly', sets: 3, repMin: 12, repMax: 15 },
      { key: 'preacherCurl', sets: 3, repMin: 8, repMax: 12 },
      { key: 'dumbbellCurl', sets: 3, repMin: 12, repMax: 15 },
    ],
  },
  {
    name: 'Legs Day B',
    dayType: 'legs',
    exercises: [
      { key: 'hipThrust', sets: 4, repMin: 8, repMax: 12 },
      { key: 'bulgarianSplitSquat', sets: 3, repMin: 8, repMax: 12 },
      { key: 'legCurl', sets: 3, repMin: 8, repMax: 12 },
      { key: 'walkingLunge', sets: 3, repMin: 12, repMax: 15 },
      { key: 'seatedCalfRaise', sets: 4, repMin: 12, repMax: 15 },
      { key: 'cableCrunch', sets: 3, repMin: 12, repMax: 15 },
    ],
  },
];
