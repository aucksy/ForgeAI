/**
 * 13 Oct 2026 — the live workout card (Hevy's): the exercise being trained, its next open set
 * with what a tick would save ("Set 3 of 5 · 35 kg × 11"), "Complete set" for exactly that row,
 * and "All sets done · Finish" at the end. The words are PURE (`services/liveCard.ts`); the card
 * itself is native (WorkoutCard.kt), checked by source below.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { setDisplayUnits } from '@/lib/units';
import { hintSignature, type RowFill } from '@/tracker/services/restDone';
import { liveCardContent, liveCardKey, liveFrom, setPosition } from '@/tracker/services/liveCard';
import type { DraftExercise, DraftSet, SetFill } from '@/tracker/store/activeWorkoutStore';

const set = (key: string, o: Partial<DraftSet> = {}): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false, ...o });
const ex = (key: string, name: string, sets: DraftSet[], o: Partial<DraftExercise> = {}): DraftExercise =>
  ({ key, exerciseId: `id-${key}`, name, muscleGroup: 'chest', equipment: 'barbell', previousSets: [], sets, ...o }) as DraftExercise;

/** Every row hints 35 × 11 (as a Target would), unless given. */
const hints =
  (by: Record<string, SetFill | null> = {}): RowFill =>
  (_e, setKey) =>
    setKey in by ? by[setKey] : { weightKg: 35, reps: 11 };

const START = 1_760_000_000_000;

describe('the live card names the next set and what a tick saves', () => {
  it('before any tick: the first exercise, set 1, its grey hint', () => {
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', [set('a1'), set('a2'), set('a3')]), ex('b', 'Row', [set('b1')])] };
    const c = liveCardContent(w, hints(), 'metric');
    expect(c.title).toBe('Bench Press');
    expect(c.text).toBe('Set 1 of 3 · 35 kg × 11');
    expect(c.label).toBe('Bench Press, set 1');
    expect(c.done).toEqual({ workout: START, exKey: 'a', setKey: 'a1', open: false, values: hintSignature({ weightKg: 35, reps: 11 }) });
  });

  it('after ticks: the next open set of the exercise just trained ("Set 3 of 5")', () => {
    const sets = [set('a1', { done: true, doneAt: 10, weightKg: 30, reps: 12 }), set('a2', { done: true, doneAt: 20, weightKg: 35, reps: 11 }), set('a3'), set('a4'), set('a5')];
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', sets), ex('b', 'Row', [set('b1')])] };
    expect(liveCardContent(w, hints(), 'metric').text).toBe('Set 3 of 5 · 35 kg × 11');
  });

  it('typed numbers win over the hint, as a tick saves them', () => {
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', [set('a1', { weightKg: 40, reps: 8 })])] };
    expect(liveCardContent(w, hints(), 'metric').text).toBe('Set 1 of 1 · 40 kg × 8');
  });

  it('moves on to the next exercise when this one is done, and follows the last tick', () => {
    const w = {
      startedAt: START,
      exercises: [ex('a', 'Bench Press', [set('a1', { done: true, doneAt: 50, weightKg: 35, reps: 11 })]), ex('b', 'Barbell Row', [set('b1'), set('b2')])],
    };
    const c = liveCardContent(w, hints(), 'metric');
    expect(c.title).toBe('Barbell Row');
    expect(c.text).toBe('Set 1 of 2 · 35 kg × 11');
    expect(liveFrom(w.exercises)).toBe('a');
  });

  it('a warm-up first: "Warm-up 1 of 2"', () => {
    const w = { startedAt: START, exercises: [ex('a', 'Squat', [set('w1', { isWarmup: true }), set('w2', { isWarmup: true }), set('s1')])] };
    const c = liveCardContent(w, hints({ w1: { weightKg: 20, reps: 10 } }), 'metric');
    expect(c.text).toBe('Warm-up 1 of 2 · 20 kg × 10');
    expect(setPosition(w.exercises[0], 's1')).toBe('Set 1 of 1');
  });

  it('nothing to save: says what is missing, and no "Complete set"', () => {
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', [set('a1')])] };
    const c = liveCardContent(w, hints({ a1: null }), 'metric');
    expect(c.text).toBe('Set 1 of 1 · add reps in the app');
    expect(c.done?.open).toBe(true);
  });

  it('each log type in its own words; pounds when the member uses them', () => {
    const one = (o: Partial<DraftExercise>, fill: SetFill, units: 'metric' | 'imperial' = 'metric') =>
      liveCardContent({ startedAt: START, exercises: [ex('a', 'X', [set('a1')], o)] }, () => fill, units).text;
    expect(one({ logType: 'reps' }, { weightKg: 0, reps: 12 })).toBe('Set 1 of 1 · 12 reps');
    expect(one({ logType: 'time' }, { weightKg: 0, reps: 0, durationSec: 60 })).toBe('Set 1 of 1 · 1:00');
    expect(one({ loadMode: 'both' }, { weightKg: 22.5, reps: 8 })).toBe('Set 1 of 1 · 22.5 kg each × 8');
    setDisplayUnits('imperial');
    expect(one({}, { weightKg: 100, reps: 5 }, 'imperial')).toBe('Set 1 of 1 · 220.5 lb × 5');
    setDisplayUnits('metric');
  });

  it('every working set ticked: "All sets done · Finish", no button; no exercise yet: says so', () => {
    const w = { startedAt: START, workoutName: 'Push 1', exercises: [ex('a', 'Bench Press', [set('a1', { done: true, doneAt: 1, weightKg: 35, reps: 11 })])] };
    expect(liveCardContent(w, hints(), 'metric')).toMatchObject({ title: 'Push 1', text: 'All sets done · Finish', done: null });
    expect(liveCardContent({ startedAt: START, exercises: [] }, hints(), 'metric')).toMatchObject({ title: 'Workout in progress', text: 'Add an exercise to start', done: null });
  });

  it('the card is posted again only when something on it changes', () => {
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', [set('a1')])] };
    const a = liveCardKey(liveCardContent(w, hints(), 'metric'), null);
    expect(liveCardKey(liveCardContent(w, hints(), 'metric'), null)).toBe(a);
    expect(liveCardKey(liveCardContent(w, hints({ a1: { weightKg: 37.5, reps: 11 } }), 'metric'), null)).not.toBe(a);
    expect(liveCardKey(liveCardContent(w, hints(), 'metric'), 'pic')).not.toBe(a);
  });
});

const read = (p: string): string => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const DIR = 'modules/forge-rest/android/src/main/java/com/forgeai/rest/';

describe('the native card (source checks — Kotlin builds only in cloud CI)', () => {
  it('a DEFAULT, silent channel that never buzzes on an update and never goes to the watch', () => {
    const kt = read(`${DIR}WorkoutCard.kt`);
    expect(kt).toMatch(/NotificationChannel\(CH, "Live workout", NotificationManager\.IMPORTANCE_DEFAULT\)/);
    expect(kt).toContain('setSound(null, null)');
    expect(kt).toContain('enableVibration(false)');
    expect(kt).toContain('.setOnlyAlertOnce(true)');
    expect(kt).toContain('.setLocalOnly(true)');
    expect(kt).toContain('.setOngoing(true)');
    // "Complete set" is the rest card's own Done (ticks that row, also with the app stopped).
    expect(kt).toMatch(/RestCard\.doneIntent\(ctx, done\.first, 0L, done\.second, CODE_SHIFT\)/);
    expect(kt).toContain('"Complete set"');
  });

  it('the module exposes it, and the rest countdown stays LOW and silent', () => {
    expect(read(`${DIR}ForgeRestModule.kt`)).toMatch(/Function\("showWorkoutCard"\)[\s\S]*WorkoutCard\.show\(/);
    expect(read(`${DIR}ForgeRestModule.kt`)).toMatch(/Function\("clearWorkoutCard"\)/);
    const rest = read(`${DIR}RestCard.kt`);
    expect(rest).toMatch(/NotificationChannel\(CH_CARD, "Rest countdown", NotificationManager\.IMPORTANCE_LOW\)/);
  });

  it('every "Rest is over" is an alarm (skips Android 15 notification cooldown), except a DND the member did not choose to ring through', () => {
    const rest = read(`${DIR}RestCard.kt`);
    expect(rest).toContain('val category = if (dndOn(ctx) && !ringThroughDnd(ctx)) Notification.CATEGORY_REMINDER else Notification.CATEGORY_ALARM');
    expect(rest).toContain('.setCategory(category)');
    // Every rest-over channel vibrates with the pattern (a watch copies the phone's buzz)...
    for (const ch of ['CH_OVER_ALARM', 'CH_OVER,', 'CH_OVER_OPEN,']) {
      const at = rest.indexOf(`NotificationChannel(${ch}`);
      expect(at, ch).toBeGreaterThan(0);
      const block = rest.slice(at, rest.indexOf('},', at));
      expect(block, ch).toContain('enableVibration(true)');
      expect(block, ch).toContain('vibrationPattern = longArrayOf(0, 250, 150, 250)');
    }
    // ...except C5-4's app-open one (16 Oct 2026): it rings the rest sound, and the app on screen
    // buzzes the phone itself, so a channel buzz would be a second one.
    const at = rest.indexOf('NotificationChannel(CH_OVER_OPEN_SOUND,');
    expect(at).toBeGreaterThan(0);
    const open = rest.slice(at, rest.indexOf('},', at));
    expect(open).toContain('restSound(ctx)');
    expect(open).toContain('enableVibration(false)');
  });
});
