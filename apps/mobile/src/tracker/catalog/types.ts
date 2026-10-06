/**
 * Shape of one entry in the bundled exercise library (Phase 2). The library itself is
 * generated data (`exerciseCatalog.ts`); this file is the contract it follows.
 */
import type { Exercise } from '@/types/models';

import type { DistUnit, LoadMode, LogType } from '../engine/logTypes';
import type { Muscle } from './muscles';

export interface CatalogEntry {
  /** Stable id. Never reused or renamed — rows in members' databases point at it. */
  key: string;
  name: string;
  /** Other names for search and the coach's matching: Hindi/Hinglish, common gym words. */
  aliases: readonly string[];
  /**
   * Exact titles that mean THIS exercise — ForgeAI's older names and Hevy's titles
   * ("Pull Up", "Bench Press (Barbell)"). An existing library row with one of these names
   * (ignoring case and spaces) is linked to this entry instead of getting a duplicate, and
   * a Hevy import of that title lands on it. Never short generic words ("row", "curl").
   */
  linkNames?: readonly string[];
  equipment: Exercise['equipment'];
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  type: LogType;
  compound: boolean;
  incrementKg: number;
  /** How the typed weight counts (dumbbells). Default 'one' (as typed). */
  loadMode?: LoadMode;
  /** Share of body weight lifted each rep: 1 for the pull-up and dip families. */
  bwShare?: number;
  /** 2–4 short how-to steps. */
  steps: readonly string[];
  /** Keys of the linked easier / harder versions. */
  easier?: string;
  harder?: string;
  /** Bodyweight reps: cap before "try a harder version". */
  repCap?: number;
  /** Timed holds: cap in seconds before "try a harder version". */
  holdCapSec?: number;
  distUnit?: DistUnit;
}
