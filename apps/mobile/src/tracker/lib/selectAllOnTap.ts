/**
 * Tap-selects-all (5 Nov 2026): every tap on a number box selects the whole number, so typing replaces it.
 *
 * `selectTextOnFocus` only fires when a box GAINS focus. Two taps never gain it: a tap on the box the
 * cursor is already in, and a tap that reopens the keyboard after Back closed it (Android keeps the box
 * focused). Both left the cursor where the finger landed, so "13" then "8" saved 183 (UAT u358 flow b).
 *
 * No timer (T76, 5 Nov 2026): a select sent 60 ms after the tap caught a digit typed inside that window,
 * and the next digit replaced it ("100" became "00"). Now, while a box has the cursor, a see-through
 * layer over it takes the tap (Android never moves the cursor), and the tap itself does the work:
 * - keyboard closed: the box loses focus and gains it again in the same moment, so Android's own
 *   select-on-focus selects the number before the keyboard is even up (nothing can be typed sooner);
 * - keyboard open: the whole number is selected right away. A digit typed before that reaches the
 *   phone is never swallowed: React Native drops a selection sent against older text.
 * Nothing runs later, so nothing ever re-selects after typing has started.
 */

/** The parts of a TextInput this needs. */
export type RetapInput = {
  setSelection: (start: number, end: number) => void;
  blur: () => void;
  focus: () => void;
};

export type RetapResult = 'select' | 'refocus' | 'none';

/** A tap on a box that already has the cursor. Runs at once; schedules nothing. */
export function retapSelectAll(input: RetapInput | null | undefined, length: number, keyboardOpen: boolean): RetapResult {
  if (!input) return 'none';
  try {
    if (!keyboardOpen) {
      input.blur();
      input.focus();
      return 'refocus';
    }
    if (length <= 0) return 'none';
    input.setSelection(0, length);
    return 'select';
  } catch (e) {
    console.warn('[ForgeErr] number box: could not select the number after a tap', e);
    return 'none';
  }
}
