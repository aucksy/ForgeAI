/**
 * How much room the Android keyboard takes — the pure half of `components/KeyboardRoom`
 * (Phase 3, third review). PURE.
 */

/** The open keyboard: its top edge and its height in dp (as React Native reports them), or null. */
export type KeyboardFrame = { screenY: number; height: number } | null;

/**
 * How much of a view that starts at the top of the screen and is `viewHeight` dp tall the
 * keyboard covers: from the keyboard's top edge down, or its reported height when the edge is
 * unknown. Never negative, never more than the view.
 */
export function keyboardRoom(viewHeight: number, kb: KeyboardFrame): number {
  if (!kb || !(viewHeight > 0)) return 0;
  const covered = Number.isFinite(kb.screenY) && kb.screenY > 0 ? viewHeight - kb.screenY : kb.height;
  return Number.isFinite(covered) ? Math.max(0, Math.min(viewHeight, covered)) : 0;
}

/**
 * UAT U-M6 (17 Oct 2026): can React Native's own "is the keyboard open?" be believed? Android
 * closes the keyboard while the app is away without telling React Native, so after the member
 * typed a set, pressed Home and came back through the app-icon shortcut (the screens are made
 * afresh), the new tab bar read "open", hid itself and the app padded the bottom for a keyboard
 * that was not there: Minimise left the member on a Workout page with no tabs, and Back closed
 * the app. Belief goes when the app leaves the screen and comes back with the next keyboard.
 * PURE: the next belief after an event.
 */
export function keyboardCacheTrusted(trusted: boolean, event: 'background' | 'show' | 'hide'): boolean {
  if (event === 'background') return false;
  if (event === 'show') return true;
  return trusted;
}

/**
 * UAT U-M6 again (21 Oct 2026, phone run 39604087736 part UK2; owner run 39604091364 part UR): the
 * app-icon shortcut made the screens afresh and Android reported a keyboard that was not on screen,
 * so the resumed workout had a blank band at the bottom and, after Minimise, no tab bar; taps could
 * land on the wrong set row. A keyboard counts as ours only while one of our text boxes has the
 * focus: with nothing focused, nobody is typing, whatever the keyboard events said. PURE.
 */
export function keyboardIfTyping(frame: KeyboardFrame, typing: boolean): KeyboardFrame {
  return typing ? frame : null;
}
