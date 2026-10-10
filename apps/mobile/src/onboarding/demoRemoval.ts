/**
 * "Remove demo data" as one action for any screen (Phase 1 — DS-06): the Demo strip above the
 * tabs and Profile → Your data both call it.
 *
 * The demo goes; every workout the member logged themselves stays. The demo profile goes with
 * the demo, so the app returns to the welcome screen for the member's own details — around the
 * kept workouts (completeOnboarding keeps them).
 */
import { askConfirm } from '@/components/ui';
import { useChat } from '@/store/chatStore';
import { useDashboard } from '@/store/dashboardStore';

import { countOwnWorkouts, removeDemoData } from './db/dataActions';
import { removeDemoBody } from './demoText';
import { useOnboarding } from './store/onboardingStore';

/** Ask, then remove. Resolves true when the demo was removed. Throws if the removal failed. */
export async function confirmAndRemoveDemo(beforeRemove?: () => void): Promise<boolean> {
  const own = await countOwnWorkouts().catch(() => 0);
  const ok = await askConfirm({
    title: 'Remove the demo?',
    body: removeDemoBody(own),
    confirmLabel: 'Remove demo',
    destructive: true,
  });
  if (!ok) return false;
  beforeRemove?.();
  const r = await removeDemoData();
  if (!r.removed) {
    // The data stopped being the demo since this screen read it: nothing was deleted.
    await useOnboarding.getState().refreshDemoFlag().catch(() => undefined);
    return false;
  }
  try {
    await Promise.all([useDashboard.getState().refresh(), useChat.getState().load()]);
  } catch {
    // caches only — the removal has committed
  }
  // No profile row is left: the welcome screen asks for the member's own details.
  useOnboarding.setState({ demo: false, status: 'welcome' });
  return true;
}
