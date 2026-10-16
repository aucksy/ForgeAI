/**
 * The steps of the routine import (RoutineImportSteps), kept in a plain .ts file so the pure
 * test lane can load them without React Native.
 */
import type { FolderChoice } from '../services/folderChoice';
import type { NameSuggestion } from '../services/importMatch';
import type { NewExercise } from '../services/routineImport';

export type Step =
  | { kind: 'list' }
  | { kind: 'check'; i: number }
  | { kind: 'new'; items: NewExercise[]; suggestions: NameSuggestion[] }
  | { kind: 'folder'; choices: FolderChoice[] }
  | { kind: 'follow' }
  | { kind: 'done'; routines: number; folder: string; today: string | null; created: number; keptEdits: string[] };

/**
 * One key per screen of the steps. Phone test, 16 Oct 2026 (360 dp, font 1.3): every step
 * shared one scroll list, so "Next" at the bottom of "1 of 2" opened "2 of 2" at the old
 * scroll position, its counter and top above the screen. A new key gives the new step a new
 * scroll list, which starts at its top.
 */
export function stepScrollKey(step: Step): string {
  switch (step.kind) {
    case 'check':
      return `check-${step.i}`;
    case 'list':
    case 'new':
    case 'folder':
    case 'follow':
    case 'done':
      return step.kind;
  }
}
