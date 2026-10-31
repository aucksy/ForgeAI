/**
 * RPE (how hard a set felt, 6–10) — choices and colour scale (Phase 1).
 * Green = easy, amber = hard, ember = near or at failure.
 */
import { color } from '@/theme/tokens';

export const RPE_CHOICES: readonly number[] = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

export function rpeColor(rpe: number | null | undefined): string {
  if (rpe == null) return color.inkMuted;
  if (rpe < 7.5) return color.goodText;
  if (rpe < 9) return color.warning;
  return color.accent;
}

/** Plain words shown under the picker. */
export function rpeMeaning(rpe: number): string {
  if (rpe >= 10) return 'Could not do another rep';
  if (rpe >= 9.5) return 'Maybe 1 more rep';
  if (rpe >= 9) return '1 more rep left';
  if (rpe >= 8.5) return '1 or 2 more reps left';
  if (rpe >= 8) return '2 more reps left';
  if (rpe >= 7.5) return '2 or 3 more reps left';
  if (rpe >= 7) return '3 more reps left';
  // UAT A-08 (30 Oct 2026): 6.5 and 6 both said "4 or more".
  if (rpe >= 6.5) return '3 or 4 more reps left';
  return '4 or more reps left';
}

/**
 * 13 Oct 2026 (owner: at large text the chips wrapped 6 + 3, three left alone): the choices as an
 * even grid — rows of `perRow` (3 × 3 for the nine), every row full, so no row is ever an orphan.
 * PURE.
 */
export function rpeGrid(choices: readonly number[] = RPE_CHOICES, perRow = 3): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < choices.length; i += perRow) rows.push(choices.slice(i, i + perRow));
  return rows;
}
