/**
 * R-482 / R-492, phone run 43564289562 (owner large-text profile): a member who scrolled down the Workout tab
 * before tapping Add (or Swap) on the "Smart suggestion" tip never saw "Seated Leg Curl added to your Legs
 * routine." with Undo: the bar sat where the tip was, above the screen. The bar now floats at the bottom of the
 * screen, outside the scrolling page, whatever the page's scroll. Same words, same Undo.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { tipWhy } from '@/tracker/engine/muscleBalance';
import { applyMuscleTip, type MuscleTip } from '@/tracker/services/muscleTips';
import { tipUndoLine } from '@/tracker/services/muscleTipUndo';

// The routine writes are stand-ins (as in muscleTipsRoutines.test.ts): Add and Swap without a database.
vi.mock('@/tracker/db/routineRepo', () => ({
  addExerciseToRoutine: vi.fn(async () => 'newRow'),
  removeRoutineExercise: vi.fn(async () => undefined),
  restoreRoutineRow: vi.fn(async () => undefined),
  swapRoutineExerciseKeepingSets: vi.fn(async () => ({ rowId: 'out', exerciseId: 'ex_out' })),
}));

function swapTip(): MuscleTip {
  return {
    kind: 'swap',
    group: 'hamstrings',
    routineId: 'legs',
    routineName: 'Legs',
    exerciseId: 'ex_seated_leg_curl',
    exerciseName: 'Seated Leg Curl',
    sets: 4,
    addSets: 3,
    outRowId: 'rowLegExt',
    outExerciseId: 'ex_leg_extension',
    outName: 'Leg Extension',
    line: '',
    why: tipWhy({ kind: 'swap', group: 'hamstrings', routineNames: ['Legs'], timesPerWeek: 1, rows: [], exerciseName: 'Seated Leg Curl', routineName: 'Legs', addSets: 3, outName: 'Leg Extension' }),
  };
}
function addTip(): MuscleTip {
  return { ...swapTip(), kind: 'add', group: 'calves', exerciseId: 'ex_standing_calf_raise', exerciseName: 'Standing Calf Raise', sets: 3 } as MuscleTip;
}

const TAB = readFileSync(join(__dirname, '..', '..', 'src', 'app', '(tabs)', 'workout.tsx'), 'utf8');

describe('the Undo line after Add and after Swap (words unchanged)', () => {
  it('tip 1, Add: "Standing Calf Raise added to your Legs routine." with Undo', async () => {
    const done = await applyMuscleTip(addTip(), 'add');
    expect(done).toEqual({ kind: 'add', rowId: 'newRow' });
    expect(tipUndoLine(addTip(), done!)).toBe('Standing Calf Raise added to your Legs routine.');
  });
  it('tip 2, Add (nothing swapped out): "Seated Leg Curl added to your Legs routine."', async () => {
    const done = await applyMuscleTip(swapTip(), 'add');
    expect(done?.kind).toBe('add');
    expect(tipUndoLine(swapTip(), done!)).toBe('Seated Leg Curl added to your Legs routine.');
  });
  it('tip 2, Swap: "Seated Leg Curl now replaces Leg Extension in your Legs routine."', async () => {
    const done = await applyMuscleTip(swapTip(), 'swap');
    expect(done?.kind).toBe('swap');
    expect(tipUndoLine(swapTip(), done!)).toBe('Seated Leg Curl now replaces Leg Extension in your Legs routine.');
  });
  it('the Workout tab shows the Undo bar with that line after both, and Undo puts the routine back', () => {
    expect(TAB).toMatch(/const done = await applyMuscleTip\(tip, how\);/);
    expect(TAB).toMatch(/if \(done\) \{\s*setTipUndo\(\{ done, message: tipUndoLine\(tip, done\), key: Date\.now\(\) \}\);/);
    expect(TAB).toMatch(/<UndoBar\s+key=\{tipUndo\.key\}\s+message=\{tipUndo\.message\}/);
    expect(TAB).toMatch(/undoMuscleTip\(done\)/);
    // Default label: the button reads "Undo".
    expect(TAB.slice(TAB.indexOf('key={tipUndo.key}'), TAB.indexOf('key={tipUndo.key}') + 600)).not.toMatch(/actionLabel=/);
  });
});

describe('the Undo bar is on screen whatever the page scroll', () => {
  it('it is drawn outside the scrolling page (after </Screen>), not inside the Up next card', () => {
    const bar = TAB.indexOf('key={tipUndo.key}');
    expect(bar).toBeGreaterThan(TAB.indexOf('</Screen>'));
    expect(TAB.indexOf('</UpNextCard>')).toBeLessThan(TAB.indexOf('</Screen>'));
    expect(TAB.match(/<UndoBar/g)).toHaveLength(1);
  });
  it('it floats at the bottom, just above the tab bar, and lets taps through around it', () => {
    const holder = TAB.slice(TAB.lastIndexOf('<View', TAB.indexOf('key={tipUndo.key}')), TAB.indexOf('key={tipUndo.key}'));
    expect(holder).toMatch(/pointerEvents="box-none"/);
    expect(holder).toMatch(/position: 'absolute', left: space\.screenX, right: space\.screenX, bottom: space\.md/);
    // The page and the bar share one full-size holder, so "bottom" is the screen's bottom above the tab bar.
    expect(TAB).toMatch(/return \(\s*<View style=\{\{ flex: 1 \}\}>\s*<Screen title="Workout"/);
  });
});
