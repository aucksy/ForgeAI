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
