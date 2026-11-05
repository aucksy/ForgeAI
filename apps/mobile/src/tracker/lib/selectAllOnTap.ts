/**
 * Tap-selects-all (5 Nov 2026): every tap on a number box selects the whole number, so typing replaces it.
 *
 * `selectTextOnFocus` only fires when a box GAINS focus. Two taps never gain it: a tap on the box
 * the cursor is already in, and a tap that reopens the keyboard after Back closed it (Android
 * keeps the box focused). Both left the cursor where the finger landed, so "13" then "8" saved
 * 183 (UAT u358 flow b). This selects everything after the tap, once Android has placed its
 * cursor (a select sent sooner is overwritten by the tap itself).
 */
export const SELECT_AFTER_TAP_MS = 60;

/** The part of a TextInput this needs. */
export type Selectable = { setSelection: (start: number, end: number) => void };

export function selectAllSoon(
  getInput: () => Selectable | null | undefined,
  getLength: () => number,
  later: (fn: () => void, ms: number) => unknown = setTimeout,
): void {
  later(() => {
    const input = getInput();
    const n = getLength();
    if (!input || n <= 0) return;
    try {
      input.setSelection(0, n);
    } catch (e) {
      console.warn('[ForgeErr] number box: could not select the number after a tap', e);
    }
  }, SELECT_AFTER_TAP_MS);
}
