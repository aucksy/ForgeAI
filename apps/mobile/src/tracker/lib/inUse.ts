/** "Machine in use" words and helpers (MachineInUse.tsx draws them). PURE. */
import { groupInt } from '@/lib/numberFormat';

export const IN_USE_WORDS = {
  title: 'IN USE',
  /** R-70: says the member is resting, so people nearby know they are coming back. */
  back: 'Resting · back in',
  close: "I'm back",
  /** R-70: the tick on the screen (the same setting as Settings → Workouts). */
  auto: 'Show after every set',
} as const;

/** "Bench Press, set 3" -> "Bench Press": the fallback when the rest has no starting lift. PURE. */
export function machineName(nextLabel: string | null): string | null {
  const name = (nextLabel ?? '').split(',')[0].trim();
  return name || null;
}

/**
 * R-305 (owner, 3 Nov 2026: "300 kg more to beat previous total"): the "In use" screen's line under
 * the lift's name. People nearby read it and ask which app it is. `left`: kg (or reps) still to go;
 * `unit`: "kg" / "lb"; `each`: dumbbells counted per hand. null = no total to beat. PURE.
 */
export function inUseBeatLine(p: { left: number; reps: boolean; unit: string; each: boolean } | null): string | null {
  if (!p || !Number.isFinite(p.left)) return null;
  // A little left (0.3) is still "1 more", never "beaten".
  const n = p.left <= 1e-9 ? 0 : Math.max(1, Math.round(p.left));
  if (n <= 0) return 'Previous total beaten ✓';
  if (p.reps) return `${n} more ${n === 1 ? 'rep' : 'reps'} to beat the previous total`;
  return `${groupInt(n)} ${p.unit} more${p.each ? ' per hand' : ''} to beat the previous total`;
}
