/**
 * LW-18: the plank timer is never lost to a brushed screen. PURE.
 *
 * Once the clock has started (running or paused), a touch on the dimmed area does nothing,
 * and Back or × asks first ("Keep 0:42 / Discard / Keep going"). Before Start, all three
 * simply close, as any sheet does.
 */
export type HoldCloseSource = 'backdrop' | 'back' | 'close';

export function holdCloseIntent(source: HoldCloseSource, started: boolean): 'close' | 'ignore' | 'ask' {
  if (!started) return 'close';
  return source === 'backdrop' ? 'ignore' : 'ask';
}
