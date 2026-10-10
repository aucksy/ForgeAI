/**
 * Phase 1 (HI-13, RP-14, LW-20, EX-10): a button action that can fail must never go dead.
 *
 * `runGuarded` takes a ref-style guard (a plain `{ current }` object — React refs fit),
 * refuses a second tap while the first is running (a ref, not React state: state updates
 * are async, so two fast taps both see "not busy" — RP-25), ALWAYS releases the guard when
 * the action ends, and hands any error to `onError` instead of letting it vanish.
 *
 * An action that navigates away may return 'left': the guard then stays held, so a tap that
 * lands during the closing animation can't run it a second time. Any other ending (done,
 * stayed on the screen, failed) releases it.
 *
 * Returns 'busy' when the tap was ignored, 'ok' when the action finished, 'failed' when it
 * threw.
 */
export type GuardResult = 'busy' | 'ok' | 'failed';

export async function runGuarded(
  guard: { current: boolean },
  action: () => Promise<void | 'left'> | void | 'left',
  onError: (e: unknown) => void,
): Promise<GuardResult> {
  if (guard.current) return 'busy';
  guard.current = true;
  let hold = false;
  try {
    hold = (await action()) === 'left';
    return 'ok';
  } catch (e) {
    onError(e);
    return 'failed';
  } finally {
    if (!hold) guard.current = false;
  }
}

/** The calm lines shown under a button when its action fails. */
export const START_FAILED = "Couldn't start the workout. Try again.";
export const EDIT_FAILED = "Couldn't open the editor. Try again.";
export const SAVE_ROUTINE_FAILED = "Couldn't save the routine. Try again.";
export const ADD_EXERCISE_FAILED = "Couldn't add it. Try again.";

/**
 * Audit Phase 4 (EX-18): open a page once, however fast the taps. `go` runs on the first tap;
 * taps in the next `ms` (while the page slides in) are ignored, so a double tap never stacks
 * two copies of the same page. Returns false when the tap was ignored.
 */
export function navigateOnce(guard: { current: boolean }, go: () => void, ms = 700): boolean {
  if (guard.current) return false;
  guard.current = true;
  try {
    go();
  } finally {
    setTimeout(() => {
      guard.current = false;
    }, ms);
  }
  return true;
}
