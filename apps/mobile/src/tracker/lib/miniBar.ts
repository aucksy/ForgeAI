/**
 * Audit Phase 7 (packet B): where the minimised workout bar shows. PURE.
 *
 * A workout left open shows the bar on every tab, so the way back is always one tap — except:
 *  - the Workout tab (the workout itself is there);
 *  - Home, once Home has drawn its answer card: that card already says "Workout in progress"
 *    with Continue, and two of the same thing stacked is noise. While Home is still loading
 *    or failed to load (no card), the bar stays so the way back never disappears. An edit of
 *    a past workout is not "in progress" on Home's card, so the bar stays for it too.
 */
export function showsMiniBar(p: { tab: string | undefined; homeReady: boolean; editing: boolean }): boolean {
  if (p.tab === 'workout') return false;
  if (p.tab === 'index' && p.homeReady && !p.editing) return false;
  return true;
}
