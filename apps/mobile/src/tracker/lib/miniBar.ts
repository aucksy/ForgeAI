/**
 * Audit Phase 7 (packet B): where the minimised workout bar shows. PURE.
 *
 * A workout left open shows the bar on every tab, so the way back is always one tap — except
 * the Workout tab: its Up next card says "Workout in progress" with Resume (redesign R1 — Home,
 * which had the same rule, is gone).
 */
import { countWord } from '@/lib/words';

export function showsMiniBar(p: { tab: string | undefined }): boolean {
  return p.tab !== 'workout';
}

/**
 * R-198 (owner, 30 Oct 2026): the bar's two lines. The top line names the workout ("Pull 2";
 * "Workout in progress" only in the moment its routine's name is being read); the line under it
 * says what is happening: "3 sets done", "Resting · 3 sets done", "Paused · 3 sets done". The time
 * (or the rest countdown) stays on the right as before. An edit of a saved workout keeps
 * "Editing a workout" with no second line. PURE.
 */
export function miniBarWords(p: {
  editing: boolean;
  resting: boolean;
  paused: boolean;
  name: string | null;
  done: number;
}): { title: string; line: string } {
  if (p.editing) return { title: 'Editing a workout', line: '' };
  const sets = `${countWord(p.done, 'set')} done`;
  const title = p.name?.trim() || 'Workout in progress';
  if (p.resting) return { title, line: `Resting · ${sets}` };
  if (p.paused) return { title, line: `Paused · ${sets}` };
  return { title, line: sets };
}
