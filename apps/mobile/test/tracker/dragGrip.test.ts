/**
 * Owner, 17 Oct 2026: a small bar at the top of each draggable card (live workout exercises, the
 * Workout tab's routines) shows they can be pressed, held and dragged. Shown only where a drag is
 * possible (two cards or more); on the workout card it sits INSIDE the hold area.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (f: string): string => readFileSync(join(__dirname, '../../src', f), 'utf8');

describe('drag grip on draggable cards', () => {
  it('is decoration: no touch of its own, hidden from screen readers', () => {
    const g = read('tracker/components/DragGrip.tsx');
    expect(g).toContain('pointerEvents="none"');
    expect(g).toContain('importantForAccessibility="no-hide-descendants"');
    expect(g).toContain('accessibilityElementsHidden');
  });

  it('routine cards show it when the folder has two routines or more', () => {
    const w = read('tracker/components/WorkoutRoutines.tsx');
    expect(w).toMatch(/canDrag \? <DragGrip/);
    expect(w).toContain('canDrag={f.routines.length > 1}');
  });

  it('workout cards show it inside the hold area when there are two exercises or more', () => {
    const c = read('tracker/components/ExerciseLogCard.tsx');
    const hold = c.indexOf('(wrapHandle ?? noWrap)(');
    const grip = c.indexOf('canDrag ? <DragGrip');
    const row = c.indexOf("<View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>", hold);
    expect(hold).toBeGreaterThan(-1);
    expect(grip).toBeGreaterThan(hold);
    expect(grip).toBeLessThan(row);
    expect(read('app/session/active.tsx')).toContain('canDrag={exercises.length > 1}');
  });
});
