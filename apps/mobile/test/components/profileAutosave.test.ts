/**
 * Audit Phase 7 (SH-16): Profile saves as you go — no "Save profile" button to forget. The pure
 * parts: what one box's text saves, and the per-field wait before a typed answer saves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkProfileField,
  chipPatch,
  createDebouncer,
  NO_RETRY,
  saveFailed,
  saveWorked,
  type CheckContext,
} from '@/components/settings/profileAutosave';

const ctx = (over: Partial<CheckContext> = {}): CheckContext => ({
  profile: {
    name: 'Rahul Sharma',
    gymName: '',
    age: 30,
    heightCm: 175,
    calorieTarget: 2500,
    proteinTargetG: 150,
    carbsTargetG: 300,
    fatTargetG: 70,
  },
  savedPhone: '+919876543210',
  units: 'metric',
  ...over,
});

describe('checkProfileField — one box at a time', () => {
  it('a changed name saves, tidied; the same name writes nothing', () => {
    expect(checkProfileField('name', '  Rahul   S ', ctx())).toEqual({ kind: 'write', write: { profile: { name: 'Rahul S' } } });
    expect(checkProfileField('name', 'Rahul Sharma ', ctx())).toEqual({ kind: 'same' });
  });

  it('a blank name is refused with a line under the box, never saved', () => {
    expect(checkProfileField('name', '   ', ctx())).toEqual({ kind: 'invalid', message: 'Your name, please.' });
  });

  it('the number: add, change, remove (SH-10)', () => {
    // Add, on a profile with none.
    expect(checkProfileField('phone', '+44 7700 900123', ctx({ savedPhone: null }))).toEqual({
      kind: 'write',
      write: { phone: '+447700900123' },
    });
    // Change.
    expect(checkProfileField('phone', '98765 00000', ctx())).toEqual({ kind: 'write', write: { phone: '9876500000' } });
    // Remove: a blank box clears it (before: blank meant "left alone" and could never remove it).
    expect(checkProfileField('phone', '', ctx())).toEqual({ kind: 'write', write: { phone: null } });
    // Same number re-formatted: nothing to write.
    expect(checkProfileField('phone', '+91 98765 43210', ctx())).toEqual({ kind: 'same' });
    // Blank and none on record: nothing to write.
    expect(checkProfileField('phone', ' ', ctx({ savedPhone: null }))).toEqual({ kind: 'same' });
  });

  it('a junk number is refused, and the old one stays', () => {
    expect(checkProfileField('phone', 'abc', ctx())).toEqual({ kind: 'invalid', message: 'Enter 7 to 15 digits, or leave it blank.' });
  });

  it('the gym name: trimmed, blank allowed, capped at 60', () => {
    expect(checkProfileField('gymName', '  Iron   Temple ', ctx())).toEqual({ kind: 'write', write: { profile: { gymName: 'Iron Temple' } } });
    expect(checkProfileField('gymName', '   ', ctx())).toEqual({ kind: 'same' });
    expect(checkProfileField('gymName', 'x'.repeat(61), ctx()).kind).toBe('invalid');
  });

  it('age: blank clears it (0 = not given); out of range is refused', () => {
    expect(checkProfileField('age', '31', ctx())).toEqual({ kind: 'write', write: { profile: { age: 31 } } });
    expect(checkProfileField('age', '', ctx())).toEqual({ kind: 'write', write: { profile: { age: 0 } } });
    expect(checkProfileField('age', '30', ctx())).toEqual({ kind: 'same' });
    expect(checkProfileField('age', '7', ctx()).kind).toBe('invalid');
    expect(checkProfileField('age', '30.5', ctx()).kind).toBe('invalid');
  });

  it('height in the units on screen, stored in cm', () => {
    expect(checkProfileField('height', '180', ctx())).toEqual({ kind: 'write', write: { profile: { heightCm: 180 } } });
    expect(checkProfileField('height', '70', ctx({ units: 'imperial' }))).toEqual({ kind: 'write', write: { profile: { heightCm: 177.8 } } });
    const bad = checkProfileField('height', '175', ctx({ units: 'imperial' }));
    expect(bad.kind === 'invalid' && bad.message).toContain('inches');
  });

  it('daily targets: whole numbers in range only', () => {
    expect(checkProfileField('proteinTargetG', '160', ctx())).toEqual({ kind: 'write', write: { profile: { proteinTargetG: 160 } } });
    expect(checkProfileField('proteinTargetG', '150', ctx())).toEqual({ kind: 'same' });
    expect(checkProfileField('calorieTarget', '', ctx()).kind).toBe('invalid');
    expect(checkProfileField('calorieTarget', '9000', ctx()).kind).toBe('invalid');
    expect(checkProfileField('fatTargetG', '1e2', ctx()).kind).toBe('invalid');
  });
});

describe('createDebouncer — save after a pause, per field', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('typing keeps pushing the save back; it runs once after the pause', () => {
    const run = vi.fn();
    const deb = createDebouncer<'name' | 'age'>(run, 800);
    deb.schedule('name');
    vi.advanceTimersByTime(500);
    deb.schedule('name');
    vi.advanceTimersByTime(500);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('name');
    expect(deb.pending()).toEqual([]);
  });

  it('one field never delays another', () => {
    const run = vi.fn();
    const deb = createDebouncer<'name' | 'age'>(run, 800);
    deb.schedule('name');
    vi.advanceTimersByTime(600);
    deb.schedule('age');
    vi.advanceTimersByTime(200);
    expect(run.mock.calls).toEqual([['name']]);
    vi.advanceTimersByTime(600);
    expect(run.mock.calls).toEqual([['name'], ['age']]);
  });

  it('flush saves what is waiting now (leaving the box, the app going to the background)', async () => {
    const run = vi.fn();
    const deb = createDebouncer<'name' | 'age'>(run, 800);
    deb.schedule('name');
    deb.schedule('age');
    await deb.flush('age');
    expect(run.mock.calls).toEqual([['age']]);
    await deb.flush();
    expect(run.mock.calls).toEqual([['age'], ['name']]);
    vi.advanceTimersByTime(2000);
    expect(run).toHaveBeenCalledTimes(2); // nothing runs twice
  });

  it('drop forgets one field; cancel forgets them all', () => {
    const run = vi.fn();
    const deb = createDebouncer<'name' | 'age'>(run, 800);
    deb.schedule('name');
    deb.schedule('age');
    deb.drop('name');
    vi.advanceTimersByTime(1000);
    expect(run.mock.calls).toEqual([['age']]);
    deb.schedule('name');
    deb.cancel();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('"Try again" re-runs what failed — chips too (review fix)', () => {
  it('a failed chip tap is remembered, and a newer tap on the same chip replaces it', () => {
    let l = saveFailed(NO_RETRY, { chip: { key: 'goal', value: 'strength' } });
    expect(l.chips).toEqual([{ key: 'goal', value: 'strength' }]);
    l = saveFailed(l, { chip: { key: 'goal', value: 'fat_loss' } });
    l = saveFailed(l, { chip: { key: 'experience', value: 'advanced' } });
    expect(l.chips).toEqual([
      { key: 'goal', value: 'fat_loss' },
      { key: 'experience', value: 'advanced' },
    ]);
  });

  it('a save that works clears its own entry only', () => {
    let l = saveFailed(NO_RETRY, { chip: { key: 'goal', value: 'strength' } });
    l = saveFailed(l, { field: 'name' });
    l = saveFailed(l, { field: 'name' });
    expect(l.fields).toEqual(['name']);
    l = saveWorked(l, { chip: { key: 'goal', value: 'general' } });
    expect(l.chips).toEqual([]);
    expect(l.fields).toEqual(['name']);
    l = saveWorked(l, { field: 'name' });
    expect(l).toEqual(NO_RETRY);
    // Nothing to clear: the same list back.
    expect(saveWorked(NO_RETRY, { field: 'age' })).toBe(NO_RETRY);
  });

  it('a chip change writes only its own column', () => {
    expect(chipPatch({ key: 'goal', value: 'strength' })).toEqual({ goal: 'strength' });
    expect(chipPatch({ key: 'experience', value: 'beginner' })).toEqual({ experience: 'beginner' });
  });
});
