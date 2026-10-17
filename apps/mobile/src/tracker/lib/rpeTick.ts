/**
 * RPE tap ticks the set (15 Oct 2026, owner) — and now the member SEES it (17 Oct 2026, owner:
 * "when someone taps the RPE value I want them to see the check mark ticked in front of them, so
 * they know it is done"). The tick used to happen while the RPE sheet was still sliding away, so it
 * was never seen. Now: the sheet closes, THEN the ✓ turns green with a short pop, THEN the rest
 * starts. PURE.
 */

/** Android's sheet slides away in about 300 ms; the tick waits for it. No slide (reduce motion): a beat. */
export function rpeTickDelayMs(reduceMotion: boolean): number {
  return reduceMotion ? 120 : 350;
}

/**
 * Tick it after the wait only if it is still there and still unticked: in that moment the member
 * may have ticked it by hand (a second toggle would UNtick it) or removed it.
 */
export function shouldAutoTick(set: { done: boolean } | undefined): boolean {
  return set != null && !set.done;
}

/** The ✓'s pop: up, then back (scale), in ms. Off with reduce motion. */
export const TICK_POP = { scale: 1.3, upMs: 110, downMs: 170 } as const;
