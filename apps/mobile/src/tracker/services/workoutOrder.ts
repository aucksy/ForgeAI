/**
 * Phase 2, packet E — the order and grouping of the cards in a live workout. PURE.
 *
 * LW-12 Move up / Move down. The rule: a superset moves as ONE block. Inside a superset a
 *   member moves one place among its partners; at the superset's edge, the next press moves
 *   the whole superset past its neighbour (a single card, or a whole other superset). A plain
 *   card never lands inside a superset — it jumps the whole block. Scattered members of one
 *   superset (joined from far apart) are gathered at the first member's place.
 * LW-26 No superset of one, and the letters follow the screen: A is the first superset on
 *   screen, B the next — never "C" with no "B".
 * LW-31 Swap after a tick: the ticked sets stay with the exercise they were done on; the open
 *   rows go to the new exercise, on a card right below.
 */
import type { DraftExercise } from '../store/activeWorkoutStore';

type Dir = -1 | 1;

/** Cards in blocks: a superset's members together (first member's place), a plain card alone. */
function blocksOf(list: readonly DraftExercise[]): DraftExercise[][] {
  const blocks: DraftExercise[][] = [];
  const byGroup = new Map<number, DraftExercise[]>();
  for (const e of list) {
    const g = e.supersetGroup ?? null;
    if (g == null) {
      blocks.push([e]);
      continue;
    }
    let b = byGroup.get(g);
    if (!b) {
      b = [];
      byGroup.set(g, b);
      blocks.push(b);
    }
    b.push(e);
  }
  return blocks;
}

/** What Move up (-1) / Move down (1) would do for this card: one card, the whole superset, or nothing. */
export function moveKind(list: readonly DraftExercise[], exKey: string, dir: Dir): 'card' | 'superset' | null {
  const blocks = blocksOf(list);
  const bi = blocks.findIndex((b) => b.some((e) => e.key === exKey));
  if (bi < 0) return null;
  const i = blocks[bi].findIndex((e) => e.key === exKey);
  const j = i + dir;
  if (j >= 0 && j < blocks[bi].length) return 'card';
  const bj = bi + dir;
  if (bj < 0 || bj >= blocks.length) return null;
  return blocks[bi].length > 1 ? 'superset' : 'card';
}

/** The list after Move up / Move down (the same array when nothing moves). */
export function moveCard(list: DraftExercise[], exKey: string, dir: Dir): DraftExercise[] {
  if (moveKind(list, exKey, dir) == null) return list;
  const blocks = blocksOf(list).map((b) => [...b]);
  const bi = blocks.findIndex((b) => b.some((e) => e.key === exKey));
  const block = blocks[bi];
  const i = block.findIndex((e) => e.key === exKey);
  const j = i + dir;
  if (j >= 0 && j < block.length) {
    [block[i], block[j]] = [block[j], block[i]];
  } else {
    const bj = bi + dir;
    [blocks[bi], blocks[bj]] = [blocks[bj], blocks[bi]];
  }
  return blocks.flat();
}

/**
 * LW-26: dissolve supersets of one and number the rest 1, 2, 3… in screen order (A, B, C).
 * Cards whose group doesn't change keep their identity (the cards are memoised).
 */
export function tidySupersets(list: DraftExercise[]): DraftExercise[] {
  const count = new Map<number, number>();
  for (const e of list) if (e.supersetGroup != null) count.set(e.supersetGroup, (count.get(e.supersetGroup) ?? 0) + 1);
  const renum = new Map<number, number>();
  for (const e of list) {
    const g = e.supersetGroup;
    if (g != null && (count.get(g) ?? 0) >= 2 && !renum.has(g)) renum.set(g, renum.size + 1);
  }
  let changed = false;
  const out = list.map((e) => {
    const g = e.supersetGroup ?? null;
    const next = g == null ? null : renum.get(g) ?? null;
    if (next === g) return e;
    changed = true;
    return { ...e, supersetGroup: next };
  });
  return changed ? out : list;
}

/**
 * Put a card in superset `group` (null = take it out). Review fix (#13): a card joining a
 * superset that already has members moves right after its last member at once — before, it
 * stayed where it was and the group only came together on the next Move. Not tidied.
 */
export function joinSuperset(list: readonly DraftExercise[], exKey: string, group: number | null): DraftExercise[] {
  const me = list.find((e) => e.key === exKey);
  if (!me || (me.supersetGroup ?? null) === group) return [...list];
  const moved: DraftExercise = { ...me, supersetGroup: group };
  const rest = list.filter((e) => e.key !== exKey);
  let at = -1;
  if (group != null) for (let i = 0; i < rest.length; i++) if (rest[i].supersetGroup === group) at = i;
  if (at < 0) return list.map((e) => (e.key === exKey ? moved : e));
  return [...rest.slice(0, at + 1), moved, ...rest.slice(at + 1)];
}

/** The next free superset number (before tidying). */
export function nextSupersetGroup(list: readonly DraftExercise[]): number {
  let max = 0;
  for (const e of list) if (e.supersetGroup != null && e.supersetGroup > max) max = e.supersetGroup;
  return max + 1;
}

export interface SupersetChoices {
  /** This card's superset, or null. */
  current: number | null;
  /** Plain cards this one can be paired with (a new superset always has two). */
  pairWith: { key: string; name: string }[];
  /** Other supersets this card can join, with their exercises' names. */
  join: { group: number; names: string[] }[];
}

export function supersetChoices(list: readonly DraftExercise[], exKey: string): SupersetChoices {
  const me = list.find((e) => e.key === exKey);
  const current = me?.supersetGroup ?? null;
  const pairWith = list.filter((e) => e.key !== exKey && e.supersetGroup == null).map((e) => ({ key: e.key, name: e.name }));
  const join: { group: number; names: string[] }[] = [];
  for (const e of list) {
    const g = e.supersetGroup ?? null;
    if (g == null || g === current) continue;
    const j = join.find((x) => x.group === g);
    if (j) j.names.push(e.name);
    else join.push({ group: g, names: [e.name] });
  }
  return { current, pairWith, join };
}

/**
 * LW-31: put `built` (the new exercise's fresh card) in `cur`'s place.
 *  - Nothing ticked yet: the new exercise takes the card (same key), as before.
 *  - Something ticked: `cur` keeps its ticked rows (untouched — they are what was lifted) and
 *    the new exercise gets a card right below with the open rows, in the same superset.
 * LW-09: the new card remembers the routine's own exercise (`swappedFrom`) so "Update routine?"
 * compares the routine against it; a split card also points at the card it continues
 * (`splitFrom`), so the two count as ONE routine exercise.
 */
export function swapSplit(cur: DraftExercise, built: DraftExercise): DraftExercise[] {
  // #2 / #10: the routine card stood in for keeps its number (heavy Bench 0, back-off 1), so the
  // stand-in gets that card's routine row — never the next one of the lift.
  const from = cur.swappedFrom ?? { exerciseId: cur.exerciseId, name: cur.name, ...(cur.card != null ? { card: cur.card } : {}) };
  const withFrom = (e: DraftExercise): DraftExercise => {
    const { swappedFrom: _drop, ...rest } = e;
    // Swapped back to the routine's own exercise: no swap at all, and its own number again.
    if (from.exerciseId === e.exerciseId) return from.card != null ? { ...rest, card: from.card } : rest;
    return { ...rest, swappedFrom: from };
  };
  const group = cur.supersetGroup ?? null;
  if (!cur.sets.some((s) => s.done)) {
    return [withFrom({ ...built, key: cur.key, supersetGroup: group, ...(cur.splitFrom ? { splitFrom: cur.splitFrom } : {}) })];
  }
  const old: DraftExercise = { ...cur, sets: cur.sets.filter((s) => s.done) };
  return [old, withFrom({ ...built, supersetGroup: group, splitFrom: cur.key })];
}
