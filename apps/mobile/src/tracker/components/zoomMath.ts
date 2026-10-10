/**
 * How far a zoomed photo may move (review fix, Phase 5: it could be dragged fully off-screen).
 * PURE, and a worklet so the gesture can call it on the UI thread.
 *
 * The picture is scaled about its centre: at `scale` on a box `size` wide it is `size × scale`
 * wide, so it can move `(scale − 1) × size / 2` either way before an edge comes inside the box.
 */
export function clampPan(t: number, size: number, scale: number): number {
  'worklet';
  const max = Math.max(0, ((scale - 1) * size) / 2);
  return Math.min(max, Math.max(-max, t));
}
