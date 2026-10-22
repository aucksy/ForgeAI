/** "Machine in use" words and helpers (MachineInUse.tsx draws them). PURE. */

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
