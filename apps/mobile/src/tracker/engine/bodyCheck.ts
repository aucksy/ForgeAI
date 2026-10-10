/**
 * The gentle typo question for a body weight (audit PG-03), like the workout's set question:
 * "765 kg — that's 10× your last. Keep it?". It never refuses (R6): Keep keeps it as typed.
 * PURE.
 */
import { dateWithYear } from '@/lib/date';
import { trimNum } from '@/lib/format';
import type { UnitSystem } from '@/types/models';

import { showWU } from '../components/unitText';

/** At least this many times the last weigh-in (or this fraction of it) is worth asking about. */
const TYPO_TIMES = 1.5;
/** With nothing to compare against, outside these is no body weight anyone has. */
const ODD_BELOW_KG = 25;
const ODD_ABOVE_KG = 300;

export interface BodyWeightTypo {
  kind: 'high' | 'low' | 'odd';
  /** How many times the last weigh-in (high only), in halves. */
  times: number | null;
  lastKg: number | null;
}

/**
 * The weigh-in to compare against: the latest one on or before `dateISO`, else the earliest
 * after it — leaving out the entry being edited (`excludeId`).
 */
function lastBefore(
  history: readonly { id?: string; dateISO: string; weightKg: number }[],
  dateISO: string,
  excludeId?: string,
): number | null {
  const others = history.filter((h) => h.id == null || h.id !== excludeId).filter((h) => h.weightKg > 0);
  if (others.length === 0) return null;
  const sorted = [...others].sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
  const before = sorted.filter((h) => h.dateISO <= dateISO);
  return before.length > 0 ? before[before.length - 1].weightKg : sorted[0].weightKg;
}

export function bodyWeightTypo(
  kg: number,
  history: readonly { id?: string; dateISO: string; weightKg: number }[],
  at: { dateISO: string; excludeId?: string },
): BodyWeightTypo | null {
  if (!(kg > 0)) return null;
  const last = lastBefore(history, at.dateISO, at.excludeId);
  if (last == null) return kg < ODD_BELOW_KG || kg > ODD_ABOVE_KG ? { kind: 'odd', times: null, lastKg: null } : null;
  const ratio = kg / last;
  if (ratio >= TYPO_TIMES) return { kind: 'high', times: Math.floor(ratio * 2) / 2, lastKg: last };
  if (ratio <= 1 / TYPO_TIMES) return { kind: 'low', times: null, lastKg: last };
  return null;
}

/** "765 kg — that's 10× your last. Keep it?" in the member's units. */
export function bodyWeightTypoText(hit: BodyWeightTypo, kg: number, u: UnitSystem): string {
  const what = showWU(kg, u);
  if (hit.kind === 'high') return `${what} — that's ${trimNum(hit.times ?? 0)}× your last. Keep it?`;
  if (hit.kind === 'low') return `${what} — that's far below your last (${showWU(hit.lastKg ?? 0, u)}). Keep it?`;
  return `${what} — that's not a usual body weight. Keep it?`;
}

// ---------------------------------------------------------------- logging over an earlier day

/**
 * Review fix (Phase 5): logging for an EARLIER day that already has an entry replaces it, so the
 * screen asks first. Today's own re-weigh is the everyday correction and is not asked about
 * (the form already says "Replaces 76.2 kg on 10 Oct.").
 */
export function shouldAskReplace(dayISO: string, today: string, existing: unknown): boolean {
  return existing != null && dayISO !== today;
}

/** "Replace 76.2 kg on Tue, 3 Oct?" */
export function replaceWeighInQuestion(existing: { dateISO: string; weightKg: number }, u: UnitSystem, today: string): string {
  return `Replace ${showWU(existing.weightKg, u)} on ${dateWithYear(existing.dateISO, today)}?`;
}

/** "Replace Waist 82 cm and Chest 100 cm on Tue, 3 Oct?" — `parts` already in the member's units. */
export function replaceMeasurementsQuestion(parts: readonly string[], dateISO: string, today: string): string {
  const list = parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Replace ${list} on ${dateWithYear(dateISO, today)}?`;
}
