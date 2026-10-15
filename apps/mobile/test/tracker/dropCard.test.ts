/**
 * 15 Oct 2026 (owner, in the gym): press, hold and drag an exercise in the live workout. The drop
 * keeps the superset rules of Move up / Move down (workoutOrder.dropCard).
 */
import { describe, expect, it } from 'vitest';

import { dropCard } from '@/tracker/services/workoutOrder';
import type { DraftExercise } from '@/tracker/store/activeWorkoutStore';

const ex = (key: string, supersetGroup: number | null = null): DraftExercise =>
  ({ key, exerciseId: key, name: key, muscleGroup: 'chest', equipment: 'barbell', sets: [], previousSets: [], supersetGroup }) as unknown as DraftExercise;
const keys = (l: DraftExercise[]) => l.map((e) => `${e.key}${e.supersetGroup != null ? `:${e.supersetGroup}` : ''}`);

describe('drag-and-drop in the live workout', () => {
  it('plain cards take the dropped order', () => {
    const l = [ex('a'), ex('b'), ex('c')];
    expect(keys(dropCard(l, ['c', 'a', 'b'], 'c'))).toEqual(['c', 'a', 'b']);
  });

  it('a card dropped between two superset partners jumps after the whole superset', () => {
    const l = [ex('x'), ex('a1', 1), ex('a2', 1)];
    expect(keys(dropCard(l, ['a1', 'x', 'a2'], 'x'))).toEqual(['a1:1', 'a2:1', 'x']);
  });

  it('a superset member dragged away from its partners leaves the superset (a superset of one dissolves)', () => {
    const l = [ex('a1', 1), ex('a2', 1), ex('x'), ex('y')];
    expect(keys(dropCard(l, ['a2', 'x', 'y', 'a1'], 'a1'))).toEqual(['a2', 'x', 'y', 'a1']);
  });

  it('a member moved within its superset stays in it', () => {
    const l = [ex('a1', 1), ex('a2', 1), ex('a3', 1), ex('x')];
    expect(keys(dropCard(l, ['a2', 'a1', 'a3', 'x'], 'a1'))).toEqual(['a2:1', 'a1:1', 'a3:1', 'x']);
  });

  it('supersets are lettered again in screen order', () => {
    const l = [ex('a1', 1), ex('a2', 1), ex('b1', 2), ex('b2', 2)];
    expect(keys(dropCard(l, ['b1', 'b2', 'a1', 'a2'], 'b1').slice(0, 2))).toEqual(['b1:1', 'b2:1']);
  });

  it('a bad order (missing, unknown or repeated keys) changes nothing', () => {
    const l = [ex('a'), ex('b')];
    expect(dropCard(l, ['a'], 'a')).toBe(l);
    expect(dropCard(l, ['a', 'z'], 'a')).toBe(l);
    expect(dropCard(l, ['a', 'a'], 'a')).toBe(l);
  });
});
