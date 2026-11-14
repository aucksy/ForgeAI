import { describe, expect, it } from 'vitest';

import { IN_USE_WORDS, TAP_HINT_MAX, cleanInUseChoices, inUseAutoOn, inUseAutoStep, inUseClockHint, inUseKit, inUseScreenLabel, inUseSpoken, inUseTitle, setPopupUp, inUseDefault, inUseHasOpenWorkingSet, inUseSetLines, machineName } from '@/tracker/lib/inUse';

describe('Machine in use (backlog, 21 Oct)', () => {
  it('names the machine, not the set', () => {
    expect(machineName('Bench Press, set 3')).toBe('Bench Press');
    expect(machineName('Leg Press')).toBe('Leg Press');
    expect(machineName(null)).toBeNull();
    expect(machineName('  ')).toBeNull();
  });
  it('member words never say volume, PR or session', () => {
    for (const w of Object.values(IN_USE_WORDS)) expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});

describe('R-70 / R-304: "In use" after every set (owner, 22 Oct and 3 Nov 2026)', () => {
  it('the master switch is on by default; a saved choice is kept; anything else is the default', async () => {
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    useTrackerPrefs.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
    expect(useTrackerPrefs.getInitialState().inUseAfterSet).toBe(true);
    expect(useTrackerPrefs.getInitialState().inUseByExercise).toEqual({});
    const merge = useTrackerPrefs.persist.getOptions().merge!;
    const now = { ...useTrackerPrefs.getInitialState() };
    expect(merge({ inUseAfterSet: false }, now).inUseAfterSet).toBe(false);
    expect(merge({ inUseAfterSet: 'yes' }, now).inUseAfterSet).toBe(true);
    expect(merge({}, now).inUseAfterSet).toBe(true);
    expect(merge({ inUseByExercise: { a: true, b: false, c: 'yes', '': true } }, now).inUseByExercise).toEqual({ a: true, b: false });
    expect(merge({ inUseByExercise: [true] }, now).inUseByExercise).toEqual({});
    useTrackerPrefs.getState().setInUseAfterSet(false);
    expect(useTrackerPrefs.getState().inUseAfterSet).toBe(false);
  });
  it('a choice for one exercise is remembered for that exercise only', async () => {
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    useTrackerPrefs.getState().setInUseFor('ex-1', false);
    useTrackerPrefs.getState().setInUseFor('ex-2', true);
    useTrackerPrefs.getState().setInUseFor('ex-1', true);
    useTrackerPrefs.getState().setInUseFor('', true);
    expect(useTrackerPrefs.getState().inUseByExercise).toEqual({ 'ex-1': true, 'ex-2': true });
  });
  it('the screen says the member is resting, and the tick says what it does', () => {
    expect(IN_USE_WORDS.back).toBe('Resting · back in');
    expect(IN_USE_WORDS.auto).toBe('Show after every set of this exercise');
    expect(IN_USE_WORDS.tapHint).toBe('Tap to show In use');
  });
});

describe('R-304 / R-307: In use by equipment', () => {
  const on = (name: string, equipment: string, key?: string) => inUseDefault({ name, equipment, key });
  it('machines, cables and barbells are on', () => {
    expect(on('Pec Deck Fly', 'machine', 'pec_deck_fly')).toBe(true);
    expect(on('Leg Press', 'machine')).toBe(true);
    expect(on('Cable Fly', 'cable', 'cable_fly')).toBe(true);
    expect(on('Barbell Squat', 'barbell', 'barbell_squat')).toBe(true);
  });
  it('a dumbbell move on a bench is on; other dumbbell moves are off', () => {
    expect(on('Incline Dumbbell Press', 'dumbbell', 'incline_dumbbell_press')).toBe(true);
    expect(on('Dumbbell Bench Press', 'dumbbell')).toBe(true);
    expect(on('Seated Dumbbell Shoulder Press', 'dumbbell')).toBe(true);
    expect(on('Chest-Supported Dumbbell Row', 'dumbbell')).toBe(true);
    expect(on('Chest Supported Row', 'dumbbell')).toBe(true);
    expect(on('Dumbbell Preacher Curl', 'dumbbell')).toBe(true);
    expect(on('Row', 'dumbbell', 'decline_db_row')).toBe(true);
    expect(on('Lateral Raise', 'dumbbell', 'lateral_raise')).toBe(false);
    expect(on('Dumbbell Curl', 'dumbbell')).toBe(false);
  });
  it('bodyweight and other are off unless the name says bench, rack or station', () => {
    expect(on('Push-Up', 'bodyweight', 'push_up')).toBe(false);
    expect(on('Decline Sit-Up', 'bodyweight')).toBe(false);
    expect(on('Kettlebell Swing', 'other')).toBe(false);
    expect(on('Band Pull-Apart', 'other')).toBe(false);
    expect(on('Bench Dip', 'bodyweight')).toBe(true);
    expect(on('Dip Station Leg Raise', 'bodyweight')).toBe(true);
    expect(on('Rack Pull', 'other')).toBe(true);
    // "Stationary" is not "station".
    expect(on('Stationary Lunge', 'bodyweight')).toBe(false);
    expect(on('Mystery Move', 'unknown')).toBe(false);
  });
  it("the master switch off means never; the member's own choice beats the default", () => {
    const press = { name: 'Incline Dumbbell Press', equipment: 'dumbbell' };
    const raise = { name: 'Lateral Raise', equipment: 'dumbbell' };
    expect(inUseAutoOn(true, undefined, press)).toBe(true);
    expect(inUseAutoOn(true, undefined, raise)).toBe(false);
    expect(inUseAutoOn(true, false, press)).toBe(false);
    expect(inUseAutoOn(true, true, raise)).toBe(true);
    expect(inUseAutoOn(false, true, raise)).toBe(false);
    expect(inUseAutoOn(false, undefined, press)).toBe(false);
    expect(inUseAutoOn(true, true, null)).toBe(false);
  });
  it('cleans a saved choice map', () => {
    expect(cleanInUseChoices({ a: true, b: 0 })).toEqual({ a: true });
    expect(cleanInUseChoices(null)).toEqual({});
    expect(cleanInUseChoices('x')).toEqual({});
  });
});

describe('R-346: In use shows the rest lines the watch shows (owner, 5 Nov 2026)', () => {
  it('words them as the watch does: "Previous" + last time, "Next" + what the tick saves', () => {
    expect(inUseSetLines({ last: '60 kg × 8', goal: '62.5 kg × 8' })).toEqual({ previous: 'Previous 60 kg × 8', next: 'Next 62.5 kg × 8' });
  });
  it('a line the watch would leave out is left out here too', () => {
    expect(inUseSetLines({ last: '', goal: '40 kg × 10' })).toEqual({ previous: null, next: 'Next 40 kg × 10' });
    expect(inUseSetLines({ last: ' ', goal: '' })).toEqual({ previous: null, next: null });
    expect(inUseSetLines(null)).toEqual({ previous: null, next: null });
  });
});

describe('owner decision (3 Nov 2026): no In use by itself after the last set of an exercise', () => {
  const set = (done: boolean, extra: { isWarmup?: boolean; setType?: 'normal' | 'drop' | 'failure' } = {}) => ({ done, isWarmup: extra.isWarmup ?? false, setType: extra.setType });
  it('a working set still open: it opens', () => {
    expect(inUseHasOpenWorkingSet([set(true), set(false)])).toBe(true);
    expect(inUseHasOpenWorkingSet([set(true), set(false, { setType: 'failure' })])).toBe(true);
  });
  it('the last working set ticked: it stays closed (open warm-ups and drop sets do not count)', () => {
    expect(inUseHasOpenWorkingSet([set(true), set(true)])).toBe(false);
    expect(inUseHasOpenWorkingSet([set(false, { isWarmup: true }), set(true), set(true)])).toBe(false);
    expect(inUseHasOpenWorkingSet([set(true), set(true), set(false, { setType: 'drop' })])).toBe(false);
    expect(inUseHasOpenWorkingSet([])).toBe(false);
    expect(inUseHasOpenWorkingSet(undefined)).toBe(false);
  });
});

describe('R-345: the line under the rest clock never vanishes (owner, 5 Nov 2026)', () => {
  it('says what In use does for this exercise now, in both states', () => {
    expect(inUseClockHint(false)).toBe('Tap to show In use');
    expect(inUseClockHint(true)).toBe('In use opens after each set');
  });
  it('the tick on In use flips the line: off -> on -> off, never empty', () => {
    const ex = { name: 'Lateral Raise', key: 'lateral_raise', equipment: 'dumbbell' };
    let chosen: boolean | undefined;
    const line = () => inUseClockHint(inUseAutoOn(true, chosen, ex));
    expect(line()).toBe(IN_USE_WORDS.tapHint);
    chosen = true; // the member ticks "Show after every set of this exercise"
    expect(line()).toBe(IN_USE_WORDS.autoHint);
    chosen = false;
    expect(line()).toBe(IN_USE_WORDS.tapHint);
    // A machine is on by default: the line says so from the first set.
    expect(inUseClockHint(inUseAutoOn(true, undefined, { name: 'Leg Extension', key: 'leg_extension', equipment: 'machine' }))).toBe(IN_USE_WORDS.autoHint);
    // Settings' switch off: In use never opens by itself, and the line offers the tap.
    expect(inUseClockHint(inUseAutoOn(false, true, ex))).toBe(IN_USE_WORDS.tapHint);
  });
});

describe('R-357: the set pop-up first, then In use (owner, 5 Nov 2026)', () => {
  const record = { id: 1, exercise: 'Dumbbell Preacher Curl', label: 'Most lifted in one set · 10 kg × 13' };
  it('the reported case: a record pop-up is up, so In use waits; it opens once the pop-up has gone', () => {
    const ui = { record, lastTime: null };
    expect(setPopupUp(ui)).toBe(true);
    expect(inUseAutoStep({ restRunning: true, question: false, popup: setPopupUp(ui) })).toBe('wait');
    ui.record = null as never; // the pop-up's own 6.2 s ran out (or the member tapped its ×)
    expect(inUseAutoStep({ restRunning: true, question: false, popup: setPopupUp(ui) })).toBe('open');
  });
  it('the quieter "+2.5 kg on last time" line holds it too', () => {
    expect(setPopupUp({ record: null, lastTime: { id: 2, exercise: 'Leg Extension', text: '+2.5 kg on previous' } })).toBe(true);
    expect(setPopupUp({ record: null, lastTime: null })).toBe(false);
  });
  it('never opens after the rest ended or over a question the tick asked', () => {
    expect(inUseAutoStep({ restRunning: false, question: false, popup: false })).toBe('drop');
    expect(inUseAutoStep({ restRunning: false, question: false, popup: true })).toBe('drop');
    expect(inUseAutoStep({ restRunning: true, question: true, popup: false })).toBe('drop');
  });
});

describe('R-457: the sign names the kit (owner, 12 Nov 2026: "bench in use", "machine in use")', () => {
  const kit = (name: string, equipment: string, key?: string) => inUseKit({ name, equipment, key });
  it('machines (Smith machines too) and cables', () => {
    expect(kit('Leg Extension', 'machine', 'leg_extension')).toBe('Machine');
    expect(kit('Pec Deck Fly', 'machine')).toBe('Machine');
    expect(kit('Preacher Curl', 'machine')).toBe('Machine');
    expect(kit('Smith Machine Bench Press', 'machine')).toBe('Machine');
    expect(kit('Smith Squat', 'barbell')).toBe('Machine');
    expect(kit('Lat Pulldown', 'cable')).toBe('Cable');
    expect(kit('Flat Bench Cable Fly', 'cable')).toBe('Cable');
  });
  it('a bench move on a barbell or dumbbells is a bench', () => {
    for (const n of ['Barbell Bench Press', 'Close-Grip Bench Press', 'Incline Barbell Press', 'EZ Bar Preacher Curl', 'Barbell Hip Thrust', 'EZ Bar Skull Crusher', 'Seated Barbell Shoulder Press', 'JM Press'])
      expect(kit(n, 'barbell'), n).toBe('Bench');
    for (const n of ['Incline Dumbbell Press', 'Dumbbell Bench Press', 'Dumbbell Fly', 'Seated Dumbbell Shoulder Press', 'Chest-Supported Dumbbell Row', 'Dumbbell Preacher Curl', 'One-Arm Dumbbell Row', 'Concentration Curl', 'Bulgarian Split Squat', 'Dumbbell Skull Crusher', 'Single-Arm Lying Dumbbell Extension'])
      expect(kit(n, 'dumbbell'), n).toBe('Bench');
    expect(kit('Bench Dip', 'bodyweight')).toBe('Bench');
    expect(kit('Decline Sit-Up', 'bodyweight')).toBe('Bench');
  });
  it('a barbell from a rack is a rack; other barbell moves name the bar', () => {
    for (const n of ['Barbell Squat', 'Front Squat', 'Overhead Press', 'Push Press', 'Rack Pull', 'Barbell Shrug', 'Barbell Lunge', 'Good Morning'])
      expect(kit(n, 'barbell'), n).toBe('Rack');
    expect(kit('Deadlift', 'barbell')).toBe('Barbell');
    expect(kit('Barbell Row', 'barbell')).toBe('Barbell');
    expect(kit('Landmine Squat', 'barbell')).toBe('Barbell');
    expect(kit('EZ Bar Curl', 'barbell', 'ez_bar_curl')).toBe('EZ bar');
    expect(kit('Trap Bar Deadlift', 'barbell')).toBe('Trap bar');
    expect(kit('Trap Bar Shrug', 'barbell')).toBe('Trap bar');
  });
  it('other dumbbell moves: dumbbells (a rear delt fly is standing, not a bench)', () => {
    expect(kit('Lateral Raise', 'dumbbell', 'lateral_raise')).toBe('Dumbbells');
    expect(kit('Hammer Curl', 'dumbbell')).toBe('Dumbbells');
    expect(kit('Rear Delt Fly', 'dumbbell')).toBe('Dumbbells');
    expect(kit('Seated Rear Delt Fly', 'dumbbell')).toBe('Bench');
  });
  it('bodyweight and other: dip station, pull-up bar, kettlebell, sled; floor moves name nothing', () => {
    expect(kit('Chest Dip', 'bodyweight')).toBe('Dip station');
    expect(kit("Captain's Chair Leg Raise", 'bodyweight')).toBe('Dip station');
    expect(kit('Pull-Up', 'bodyweight', 'pull_up')).toBe('Pull-up bar');
    expect(kit('Hanging Leg Raise', 'bodyweight')).toBe('Pull-up bar');
    expect(kit('Weighted Chin-Up', 'other')).toBe('Pull-up bar');
    expect(kit('Kettlebell Swing', 'other')).toBe('Kettlebell');
    expect(kit('Sled Push', 'other')).toBe('Sled');
    expect(kit('Push-Up', 'bodyweight', 'push_up')).toBeNull();
    expect(kit('Plank', 'bodyweight')).toBeNull();
    expect(kit('Band Pull-Apart', 'other')).toBeNull();
    expect(kit('Mystery Move', 'unknown')).toBeNull();
    expect(inUseKit(null)).toBeNull();
  });
  it('every catalogue move on a machine, cable, barbell or dumbbells gets a kit', async () => {
    const { CATALOG } = await import('@/tracker/catalog/catalogData');
    for (const e of CATALOG) {
      const ex = { name: e.name, key: e.key, equipment: e.equipment };
      if (['machine', 'cable', 'barbell', 'dumbbell'].includes(e.equipment)) expect(inUseKit(ex), e.name).not.toBeNull();
      // A move In use opens by itself after names its kit: its sign never says plain IN USE.
      if (inUseDefault(ex)) expect(inUseKit(ex), e.name).not.toBeNull();
    }
  });
  it('the sign, the spoken label and the rest bar line', () => {
    expect(inUseTitle('Bench')).toBe('BENCH IN USE');
    expect(inUseTitle('Pull-up bar')).toBe('PULL-UP BAR IN USE');
    expect(inUseTitle(null)).toBe('IN USE');
    expect(inUseSpoken('Machine')).toBe('Machine in use');
    expect(inUseSpoken(null)).toBe('In use');
    expect(inUseClockHint(false, 'Bench')).toBe('Tap to show Bench in use');
    expect(inUseClockHint(false, 'Cable')).toBe('Tap to show Cable in use');
    // Too long for the line under the clock at the owner's text size: the short line stays.
    expect(inUseClockHint(false, 'Machine')).toBe('Tap to show In use');
    expect(inUseClockHint(false, 'Dumbbells')).toBe('Tap to show In use');
    expect(inUseClockHint(true, 'Bench')).toBe('In use opens after each set');
    for (const k of ['Bench', 'Machine', 'Cable', 'Rack', 'Barbell', 'EZ bar', 'Trap bar', 'Dumbbells', 'Kettlebell', 'Dip station', 'Pull-up bar', 'Sled'] as const)
      expect(inUseClockHint(false, k).length).toBeLessThanOrEqual(TAP_HINT_MAX);
  });
});

describe("R-456: only \"I'm back\" closes In use (owner, 12 Nov 2026; first R-345)", () => {
  it('the spoken label names the kit and never says "Tap to close"', () => {
    expect(inUseScreenLabel('Bench', 'Previous 60 kg × 8', 'Next 62.5 kg × 8', 90)).toBe('Bench in use. Previous 60 kg × 8. Next 62.5 kg × 8. Back in 90 seconds.');
    expect(inUseScreenLabel(null, null, null, 30)).toBe('In use. Back in 30 seconds.');
    expect(inUseScreenLabel('Machine', null, 'Next 40 kg × 10', 5)).not.toMatch(/tap to close/i);
  });
  it("[source-text check] the screen body and the tick strip are not close buttons; \"I'm back\" is", async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../../src/tracker/components/MachineInUse.tsx'), 'utf8');
    // onClose is wired to exactly two things: Android Back (the Modal) and the "I'm back" button.
    expect(src.match(/=\{onClose\}/g)).toHaveLength(2);
    expect(src).toMatch(/<Modal [^\n]*onRequestClose=\{onClose\}/);
    expect(src).toMatch(/<Pressable\s+onPress=\{onClose\}\s+accessibilityRole="button"\s+accessibilityLabel=\{IN_USE_WORDS\.close\}/);
    expect(src).not.toMatch(/onResponderRelease/);
    expect(src).not.toMatch(/Tap to close/);
  });
});
