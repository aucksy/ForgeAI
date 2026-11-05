/** "Machine in use" words and helpers (MachineInUse.tsx draws them). PURE. */
import { groupInt } from '@/lib/numberFormat';

export const IN_USE_WORDS = {
  title: 'IN USE',
  /** R-70: says the member is resting, so people nearby know they are coming back. */
  back: 'Resting · back in',
  close: "I'm back",
  /**
   * R-70: the tick on the screen. R-304 (owner, 3 Nov 2026): it now switches THIS exercise only, and
   * the app remembers it for that exercise in later workouts.
   */
  auto: 'Show after every set of this exercise',
  /** R-299 (owner, 3 Nov 2026): under the rest clock while this exercise's In use stays closed. */
  /** Fresh-eyes review (5 Nov 2026): "Tap: In use" read as a riddle; it says what the tap does. */
  tapHint: 'Tap to show In use',
} as const;

/** The catalogue's equipment kinds (types/models Exercise['equipment']). */
export type InUseEquipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other';

/** "incline_dumbbell_press" / "Chest-Supported Row" -> "incline dumbbell press" / "chest supported row". */
function words(s: string | null | undefined): string {
  return ` ${(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

/** A dumbbell move done on a bench: the bench is what people wait for. */
const BENCH_WORDS = [' bench ', ' incline ', ' decline ', ' seated ', ' chest supported ', ' preacher '];
/** Bodyweight / other moves that still hold a piece of kit (a bench, a rack, a dip station). */
const KIT_WORDS = [' bench ', ' rack ', ' station '];

/**
 * R-304 / R-307 (owner, 3 Nov 2026: "ON by default for exercises on machines or benches, OFF for
 * dumbbell or bodyweight"): does "In use" open by itself after this exercise's sets when the member
 * never chose? ON: machine, cable, barbell (rack or bench), and a dumbbell move on a bench (name or
 * key says bench, incline, decline, seated, chest-supported, preacher). OFF: other dumbbell moves,
 * bodyweight and other (bands, kettlebells) unless the name says bench, rack or station. PURE.
 */
export function inUseDefault(ex: { name: string; key?: string | null; equipment: InUseEquipment | string | null | undefined }): boolean {
  const text = `${words(ex.name)}${words(ex.key)}`;
  const has = (list: readonly string[]) => list.some((w) => text.includes(w));
  switch (ex.equipment) {
    case 'machine':
    case 'cable':
    case 'barbell':
      return true;
    case 'dumbbell':
      return has(BENCH_WORDS);
    default:
      return has(KIT_WORDS);
  }
}

/**
 * R-304: does "In use" open by itself after a set of this exercise? `master` is Settings' "Show In
 * use after sets" (off = never, anywhere); `chosen` is the member's own choice for this exercise
 * (remembered), which beats the equipment default. No exercise known = no. PURE.
 */
export function inUseAutoOn(
  master: boolean,
  chosen: boolean | null | undefined,
  ex: { name: string; key?: string | null; equipment: InUseEquipment | string | null | undefined } | null,
): boolean {
  if (!master || !ex) return false;
  return typeof chosen === 'boolean' ? chosen : inUseDefault(ex);
}

/** A saved per-exercise choice map, cleaned: string keys, true/false values only. PURE. */
export function cleanInUseChoices(v: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (k && typeof x === 'boolean') out[k] = x;
  return out;
}

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
  // Fresh-eyes review (5 Nov 2026): `left` is what is still to go to TODAY's total (the exercise
  // card's "of 1,560 kg"), not to last time's, so the words name today's target.
  if (n <= 0) return "Today's target reached ✓";
  if (p.reps) return `${n} more ${n === 1 ? 'rep' : 'reps'} to reach today's target`;
  return `${groupInt(n)} ${p.unit} more${p.each ? ' per hand' : ''} to reach today's target`;
}

/**
 * Owner decision (3 Nov 2026): "In use" does not open by itself after the LAST set of an exercise —
 * the member leaves that machine anyway. Is a working set still open (not ticked) on this card after
 * the tick? Warm-ups and drop sets do not count. The clock still opens it by hand. PURE.
 */
export function inUseHasOpenWorkingSet(sets: readonly { done: boolean; isWarmup: boolean; setType?: string | null }[] | null | undefined): boolean {
  return (sets ?? []).some((s) => !s.done && !s.isWarmup && s.setType !== 'drop');
}
