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

/**
 * R-345: the line under the rest clock: what In use does for this exercise now. Never empty.
 * R-457 (owner, 12 Nov 2026): the tap line names the kit ("Tap to show Bench in use") when that still
 * fits the line under the clock (at most TAP_HINT_MAX letters, as long as R-345's longest line is today
 * at the owner's 360 dp / font 1.3); a longer kit ("Dumbbells", "Pull-up bar") keeps "Tap to show In use".
 * "In use opens after each set" names the feature, so it stays as it is (with a kit it would not fit). PURE.
 */
export function inUseClockHint(autoOn: boolean, kit: InUseKit | null = null): string {
  if (autoOn) return IN_USE_WORDS.autoHint;
  const named = kit ? `Tap to show ${kit} in use` : null;
  return named && named.length <= TAP_HINT_MAX ? named : IN_USE_WORDS.tapHint;
}

/** R-457: the longest kit tap line under the rest clock ("Tap to show Bench in use" = 24). */
export const TAP_HINT_MAX = 24;

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
 * R-457 (owner, 12 Nov 2026: "not as clear to people who are not aware of the concept to just say in
 * use ... if there is an exercise that is bench related, then we should say bench in use. If there is a
 * machine related exercise, we should say machine in use"): the piece of kit the member is resting on,
 * in the words people in a gym use for it. The In use screen then reads "BENCH / IN USE". null = no
 * kit to name (push-ups, planks, bands): the screen keeps plain "IN USE".
 *  - Machine: every machine, Smith machines too. Cable: every cable move.
 *  - Bench: a move done lying or sitting on a bench (bench press, incline, decline, seated, preacher,
 *    hip thrust, skull crusher, pullover, chest-supported, a dumbbell fly or row on a bench, Bulgarian
 *    split squat, bench dip, decline sit-up).
 *  - Rack: a barbell taken from a rack (squats, overhead press, push press, rack pull, shrugs, lunges,
 *    good mornings, calf raises).
 *  - Barbell / EZ bar / Trap bar: the other barbell moves (curls, rows, deadlifts), named by the bar.
 *  - Dumbbells: the other dumbbell moves (people take the dumbbells while you rest, R-70).
 *  - Dip station / Pull-up bar / Kettlebell / Sled: by the name.
 * Order matters: a Smith machine is a machine; a bench move on a barbell is a bench, not a rack. PURE.
 */
export type InUseKit =
  | 'Bench'
  | 'Machine'
  | 'Cable'
  | 'Rack'
  | 'Barbell'
  | 'EZ bar'
  | 'Trap bar'
  | 'Dumbbells'
  | 'Kettlebell'
  | 'Dip station'
  | 'Pull-up bar'
  | 'Sled';

/** A barbell or dumbbell move done lying or sitting on a bench. */
const ON_BENCH = [
  ' bench ', ' incline ', ' decline ', ' seated ', ' chest supported ', ' preacher ', ' hip thrust ',
  ' skull crusher ', ' pullover ', ' jm press ', ' tate press ', ' lying ', ' spider curl ',
  ' squeeze press ', ' concentration ', ' bulgarian ', ' dumbbell fly ', ' neutral grip dumbbell press ',
  ' one arm dumbbell row ', ' single arm dumbbell row ', ' dumbbell leg curl ',
];
/** A barbell taken from a rack. */
const FROM_RACK = [' squat ', ' overhead press ', ' push press ', ' rack ', ' shrug ', ' lunge ', ' good morning ', ' calf raise '];
const DIP = [' dip ', ' dips ', ' captain s chair '];
const PULL_UP = [' pull up ', ' pullup ', ' chin up ', ' chinup ', ' muscle up ', ' hanging ', ' dead hang ', ' toes to bar '];
/** Bodyweight moves done on a bench (hands or feet up, a decline bench). */
const BODY_ON_BENCH = [' bench ', ' incline ', ' decline ', ' hip thrust '];

export function inUseKit(ex: { name: string; key?: string | null; equipment: InUseEquipment | string | null | undefined } | null | undefined): InUseKit | null {
  if (!ex) return null;
  const text = `${words(ex.name)}${words(ex.key)}`;
  const has = (list: readonly string[]) => list.some((w) => text.includes(w));
  if (has([' smith '])) return 'Machine';
  switch (ex.equipment) {
    case 'machine':
      return 'Machine';
    case 'cable':
      return 'Cable';
    case 'barbell':
      if (has(ON_BENCH)) return 'Bench';
      if (has([' trap bar '])) return 'Trap bar';
      if (has([' landmine '])) return 'Barbell';
      if (has(FROM_RACK)) return 'Rack';
      if (has([' ez bar ', ' ezbar '])) return 'EZ bar';
      return 'Barbell';
    case 'dumbbell':
      return has(ON_BENCH) ? 'Bench' : 'Dumbbells';
    default:
      if (has(DIP) && !has([' bench '])) return 'Dip station';
      if (has(PULL_UP)) return 'Pull-up bar';
      if (has(BODY_ON_BENCH)) return 'Bench';
      if (has([' rack '])) return 'Rack';
      if (has([' kettlebell '])) return 'Kettlebell';
      if (has([' sled '])) return 'Sled';
      return null;
  }
}

/** R-457: the sign's big words: "BENCH IN USE" (the screen draws the kit on its own line above IN USE). PURE. */
export function inUseTitle(kit: InUseKit | null): string {
  return kit ? `${kit.toUpperCase()} ${IN_USE_WORDS.title}` : IN_USE_WORDS.title;
}

/** R-457: the same in a sentence, for TalkBack / VoiceOver and the hints: "Bench in use", or "In use". PURE. */
export function inUseSpoken(kit: InUseKit | null): string {
  return kit ? `${kit} in use` : 'In use';
}

/**
 * R-456 (owner, 12 Nov 2026: a tap anywhere closed the screen; "That should only go away if someone taps on
 * I am back"): what TalkBack / VoiceOver read for the screen. It never says "Tap to close" any more:
 * only the "I'm back" button closes it. PURE.
 */
export function inUseScreenLabel(kit: InUseKit | null, previous: string | null, next: string | null, remaining: number): string {
  return `${inUseSpoken(kit)}. ${previous ? `${previous}. ` : ''}${next ? `${next}. ` : ''}Back in ${remaining} seconds.`;
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
