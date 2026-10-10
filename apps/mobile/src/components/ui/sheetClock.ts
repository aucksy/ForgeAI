/**
 * Audit Phase 7 review: when did a sheet last close? PURE timing plus one shared number.
 *
 * Every `Sheet` is an Android `Modal`. A notice or question (`tell()` / `askConfirm`) opened in
 * the same moment a sheet closes swaps two Modals in one frame, and Android can drop the new
 * one — the member taps "Delete" in a sheet and never sees the answer. `Sheet` notes the
 * moment it closes here; `ConfirmHost` waits for the closing sheet to finish sliding away
 * before it shows, so every caller is safe without its own delay.
 */

/** How long a closing sheet takes to leave the screen (a Modal's slide-out). */
export const SHEET_CLOSE_MS = 260;
/** A sheet that closed this recently may still be on its way out. */
export const SHEET_RECENT_MS = 300;

let lastClosedAt = Number.NEGATIVE_INFINITY;

/** Called by `Sheet` when it closes (hidden, or taken off the screen while showing). */
export function noteSheetClosed(now: number = Date.now()): void {
  lastClosedAt = now;
}

/** How long a new sheet should wait before showing: the slide-out, if a sheet just closed. PURE. */
export function waitAfterSheet(closedAt: number, now: number): number {
  const since = now - closedAt;
  return since >= 0 && since < SHEET_RECENT_MS ? SHEET_CLOSE_MS : 0;
}

/** The wait right now, from the last close any sheet noted. */
export function sheetWaitNow(now: number = Date.now()): number {
  return waitAfterSheet(lastClosedAt, now);
}

export function resetSheetClockForTests(): void {
  lastClosedAt = Number.NEGATIVE_INFINITY;
}
