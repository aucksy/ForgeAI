/**
 * The calm pop-up when the free part of MettleUp Plus reaches a limit (F56, R-461): what is paid, that the
 * member's own data stays free, and a button to the MettleUp Plus screen. Only ever shown when the plan is
 * switched on (MEMBER_PLAN_GATE_ON); see src/plan/locked.ts.
 */
import type { PaidFeature } from '@forgeai/theme';

import { explainLocked } from '@/plan/locked';

export type LimitKind = 'customExercises' | 'charts';

const FEATURE: Readonly<Record<LimitKind, PaidFeature>> = { customExercises: 'ownExercises', charts: 'olderCharts' };

/** Ask; on "See MettleUp Plus" call `openPlus` (the screen's router push to /plus). */
export async function explainLimit(kind: LimitKind, openPlus: () => void): Promise<void> {
  await explainLocked(FEATURE[kind], openPlus);
}

export { monthsOfRange } from './limits';
