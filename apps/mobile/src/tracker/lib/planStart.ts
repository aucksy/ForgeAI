/**
 * OWNER-INBOX #19 (18 Oct 2026): a first time on an exercise whose routine gives a starting
 * weight (a trainer's plan from the gym, a Hevy routine). The set rows already hint that weight
 * (fillForSet: with no Target the plan is the hint), so the short Target line says the same
 * instead of "find a weight for 8–12 reps". After the first workout the member's own Target leads.
 * PURE.
 */
import type { LogType } from '../engine/logTypes';

export function planStartLine(
  t: { action: string; logType?: LogType | null; bodyweightOnly?: boolean } | null,
  plan: { weightKg?: number; reps?: number } | undefined,
  weight: (kg: number) => string,
): string | null {
  if (!t || t.action !== 'start' || t.bodyweightOnly || !plan) return null;
  const lt = t.logType ?? 'weight_reps';
  if (lt !== 'weight_reps' && lt !== 'weighted') return null;
  const kg = plan.weightKg;
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return null;
  const reps = plan.reps != null && Number.isFinite(plan.reps) && plan.reps > 0 ? ` × ${Math.round(plan.reps)}` : '';
  return `First time · start at ${lt === 'weighted' ? '+' : ''}${weight(kg)}${reps}`;
}
