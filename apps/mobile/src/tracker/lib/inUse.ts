/** "Machine in use" words and helpers (MachineInUse.tsx draws them). PURE. */
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
  /**
   * R-345 (owner, 5 Nov 2026: the hint "went away" after a touch on In use): while this exercise's In
   * use opens by itself, the same line says so, instead of vanishing. The tick on In use flips the
   * line between the two, so the member sees what the tick changed.
   */
  autoHint: 'In use opens after each set',
} as const;

/** R-345: the line under the rest clock: what In use does for this exercise now. Never empty. PURE. */
export function inUseClockHint(autoOn: boolean): string {
  return autoOn ? IN_USE_WORDS.autoHint : IN_USE_WORDS.tapHint;
}

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
 * R-346 (owner, 5 Nov 2026: "instead of showing the total kg, we can replicate the previous and next
 * set thing that is being shown on the watch"): the In use screen's two lines under the lift's name,
 * exactly as the watch's rest screen words them (WatchLayout.card: "Previous " + last, "Next " + goal).
 * `w` is the row the phone already sends the watch (liveCard.ts `watch`: last time's numbers for the
 * next set, and what its tick saves). Each null when unknown. PURE.
 */
export function inUseSetLines(w: { last: string; goal: string } | null | undefined): { previous: string | null; next: string | null } {
  const last = (w?.last ?? '').trim();
  const goal = (w?.goal ?? '').trim();
  return { previous: last ? `Previous ${last}` : null, next: goal ? `Next ${goal}` : null };
}

/**
 * Owner decision (3 Nov 2026): "In use" does not open by itself after the LAST set of an exercise —
 * the member leaves that machine anyway. Is a working set still open (not ticked) on this card after
 * the tick? Warm-ups and drop sets do not count. The clock still opens it by hand. PURE.
 */
export function inUseHasOpenWorkingSet(sets: readonly { done: boolean; isWarmup: boolean; setType?: string | null }[] | null | undefined): boolean {
  return (sets ?? []).some((s) => !s.done && !s.isWarmup && s.setType !== 'drop');
}

/**
 * R-357 (owner, 5 Nov 2026: a record's pop-up and In use opened together, the pop-up drawn over the
 * phone's clock and In use's confetti fighting it; "Let the banner start after the toast is done"):
 * In use that opens BY ITSELF waits while a set's pop-up is on screen (the "New record" one, or the
 * quieter "+2.5 kg on last time" line in the same place), and opens once it has gone and its fade-out
 * is over. The pop-ups keep their own full time (never shortened). A tap on the clock opens In use at
 * once: the member asked for it. PURE.
 *  - 'drop': the rest ended, or a question the tick asked is on screen ("Is 300 kg right?"): stay closed.
 *  - 'wait': a pop-up is up: check again when it goes.
 *  - 'open': nothing in the way.
 */
export function inUseAutoStep(s: { restRunning: boolean; question: boolean; popup: boolean }): 'drop' | 'wait' | 'open' {
  if (!s.restRunning || s.question) return 'drop';
  return s.popup ? 'wait' : 'open';
}

/** R-357: is a set pop-up on screen (workoutUiStore `record` / `lastTime`)? PURE. */
export function setPopupUp(ui: { record: unknown; lastTime: unknown }): boolean {
  return ui.record != null || ui.lastTime != null;
}

/** R-357: the pop-up's fade-out (RecordToast: 200 ms) is over before In use fades in. */
export const POPUP_EXIT_MS = 300;
