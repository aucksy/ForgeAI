/**
 * F56 MettleUp Plus (R-461): what happens when a paid feature is tapped on the free part: one calm pop-up
 * (the feature's line, "your workouts, history and routines stay free", and "See MettleUp Plus"). Shared by
 * every locked place (charts, own exercises, calculators, suggested weights, the watch).
 */
import type { PaidFeature } from '@forgeai/theme';

import { askConfirm } from '@/components/ui/confirmStore';

import { canUseNow } from './memberPlanStore';
import { LOCKED_BODY, lockedTitle, NOT_NOW, SEE_PLUS } from './planWords';

/** Explain why the feature is closed; on "See MettleUp Plus" call `openPlus`. */
export async function explainLocked(feature: PaidFeature, openPlus: () => void): Promise<void> {
  const yes = await askConfirm({ title: lockedTitle(feature), body: LOCKED_BODY, confirmLabel: SEE_PLUS, cancelLabel: NOT_NOW });
  if (yes) openPlus();
}

/** True when the feature may be used now; else explains (never blocks on anything slow). */
export function allowOrExplain(feature: PaidFeature, openPlus: () => void): boolean {
  if (canUseNow(feature)) return true;
  void explainLocked(feature, openPlus);
  return false;
}
