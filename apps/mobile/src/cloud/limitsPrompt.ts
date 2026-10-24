/**
 * The calm line when a free-plan limit is reached (tracker #43): what the limit is, then "Join
 * through your gym to unlock everything, free." with a button to Settings → "Your gym". Only ever
 * shown when the server switch is on (limitsFlag.ts) — OFF at launch.
 */
import { askConfirm } from '@/components/ui/confirmStore';

import { JOIN_GYM_BUTTON, JOIN_GYM_LINE, limitTitle, NOT_NOW, type LimitKind } from './limits';
import { useFreeLimits } from './limitsFlag';

/** Ask; on "Open Your gym" call `openGym` (the screen's router push to /settings/gym). */
export async function explainLimit(kind: LimitKind, openGym: () => void): Promise<void> {
  const limits = useFreeLimits.getState().limits;
  const yes = await askConfirm({ title: limitTitle(kind, limits), body: JOIN_GYM_LINE, confirmLabel: JOIN_GYM_BUTTON, cancelLabel: NOT_NOW });
  if (yes) openGym();
}

export { monthsOfRange } from './limits';
