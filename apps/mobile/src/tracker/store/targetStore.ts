/**
 * The live workout's Targets, one per card (audit TG-04 / TG-06 / TG-11). Not persisted:
 * Targets are derived from the member's history and recomputed when anything they depend on
 * changes — the cards (added, removed, swapped, Counting changed), the easy week, RPE logging
 * and the unit on screen.
 *
 * TG-11: starting a routine fills this store TOGETHER with the cards (`preloadTargets` runs
 * beside the draft build, `seedTargets` stores the result before the workout opens), so the
 * first frame already shows the Target and its hints — a fast tick can no longer log last
 * time's numbers while the Target is still on its way.
 */
import { create } from 'zustand';

import { displayUnits, type UnitSystem } from '@/lib/units';
import type { LoadMode } from '@/tracker/engine/logTypes';
import type { ProgressionTarget } from '@/tracker/engine/progression';
import { getTargetsForCards, type TargetCard } from '@/tracker/services/coachTargets';

/** What a card tells the Target (a slice of the draft exercise). */
export interface CardForTarget {
  key: string;
  exerciseId: string;
  /** LW-09 / TG-06: the routine exercise a swapped card replaced (its row gives the Target). */
  swappedFrom?: { exerciseId: string; card?: number } | null;
  loadMode?: LoadMode;
  /** #10: the card's own number among the cards of its exercise. */
  card?: number;
  /** #2: the card this one continues after a swap mid-exercise (it shares that routine row). */
  splitFrom?: string;
}

export interface TargetQuery {
  planDayId: string | null;
  cards: TargetCard[];
  easy: boolean;
  effort: boolean;
  units: UnitSystem;
}

export function targetQuery(
  planDayId: string | null,
  exercises: readonly CardForTarget[],
  opts: { easy: boolean; effort: boolean; units?: UnitSystem },
): TargetQuery {
  return {
    planDayId,
    cards: exercises.map((e) => ({
      key: e.key,
      exerciseId: e.exerciseId,
      ...(e.swappedFrom ? { planExerciseId: e.swappedFrom.exerciseId } : {}),
      ...(e.swappedFrom?.card != null ? { planCard: e.swappedFrom.card } : {}),
      ...(e.loadMode ? { loadMode: e.loadMode } : {}),
      ...(e.card != null ? { card: e.card } : {}),
      ...(e.splitFrom ? { splitFrom: e.splitFrom } : {}),
    })),
    easy: opts.easy,
    effort: opts.effort,
    units: opts.units ?? displayUnits(),
  };
}

/** Everything a Target depends on, as one string: equal strings = the same Targets. */
export function querySignature(q: TargetQuery): string {
  const cards = q.cards
    .map((c) => `${c.key}:${c.exerciseId}:${c.planExerciseId ?? ''}:${c.loadMode ?? ''}:${c.card ?? ''}:${c.planCard ?? ''}:${c.splitFrom ?? ''}`)
    .join(',');
  return `${q.planDayId ?? ''}|${q.easy ? 1 : 0}|${q.effort ? 1 : 0}|${q.units}|${cards}`;
}

interface TargetState {
  /** The query the current `targets` answer; null = none loaded yet. */
  sig: string | null;
  /** card key → Target. */
  targets: Map<string, ProgressionTarget>;
}

export const useTargets = create<TargetState>()(() => ({ sig: null, targets: new Map() }));

let inflight: string | null = null;

/** Compute the Targets for `q` unless they are already there (or on their way). Never throws. */
export async function loadTargets(q: TargetQuery): Promise<void> {
  const sig = querySignature(q);
  if (useTargets.getState().sig === sig || inflight === sig) return;
  inflight = sig;
  let map: Map<string, ProgressionTarget>;
  try {
    map = q.planDayId ? await getTargetsForCards(q.planDayId, q.cards, { easy: q.easy, effort: q.effort }) : new Map();
  } catch {
    map = new Map();
  }
  // A newer query started meanwhile: its answer wins.
  if (inflight !== sig) return;
  inflight = null;
  useTargets.setState({ sig, targets: map });
}

/**
 * TG-11: the Targets of a routine being started, computed BESIDE the draft build. Cards have no
 * keys yet, so they are keyed by their row index; `seedTargets` maps them onto the new cards.
 * Never throws (no Targets is better than no workout).
 */
export async function preloadTargets(
  planDayId: string | null,
  exerciseIds: readonly string[],
  opts: { easy: boolean; effort: boolean },
): Promise<Map<string, ProgressionTarget>> {
  if (!planDayId) return new Map();
  try {
    return await getTargetsForCards(
      planDayId,
      exerciseIds.map((exerciseId, i) => ({ key: String(i), exerciseId })),
      opts,
    );
  } catch {
    return new Map();
  }
}

/** Store preloaded Targets for the new cards (row i → card i) before the workout opens. */
export function seedTargets(q: TargetQuery, byIndex: Map<string, ProgressionTarget>): void {
  const targets = new Map<string, ProgressionTarget>();
  q.cards.forEach((c, i) => {
    const t = byIndex.get(String(i));
    if (t && t.exerciseId === c.exerciseId) targets.set(c.key, t);
  });
  inflight = null;
  useTargets.setState({ sig: querySignature(q), targets });
}
