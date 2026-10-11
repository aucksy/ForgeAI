/**
 * Audit Phase 7 (packet B): where the minimised workout bar shows. PURE.
 *
 * A workout left open shows the bar on every tab, so the way back is always one tap — except
 * the Workout tab: its Up next card says "Workout in progress" with Resume (redesign R1 — Home,
 * which had the same rule, is gone).
 */
export function showsMiniBar(p: { tab: string | undefined }): boolean {
  return p.tab !== 'workout';
}
