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
  return '4 or more reps left';
}
