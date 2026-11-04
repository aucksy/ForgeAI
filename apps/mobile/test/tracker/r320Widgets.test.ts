/**
 * R-320 (owner, 4 Nov 2026: "Widget - Lets go with A"): the Today widget shows what to beat, and a new
 * "Gym right now" widget shows how busy the gym is with the time it was read. The pure halves here; the
 * native half (Kotlin, built only in the cloud) is read as source so a slip shows before the build.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { GymBusy } from '@/shop/gymBusy';
import { beatLine, gymWord, widgetData, widgetGym, widgetPayload, type BeatTarget } from '@/tracker/phone/widgets';
import { usesBannedWord } from '@/lib/words';

const kg = (w: number): string => `${Number.isInteger(w) ? w : w.toFixed(1)} kg`;
const bench: BeatTarget = {
  exerciseName: 'Bench Press',
  targetWeightKg: 62.5,
  repGoal: 8,
  targetRepsMin: 6,
  last: { weightKg: 60, topReps: 8 },
  logType: 'weight_reps',
};

describe('Today: what to beat', () => {
  it("last time's best set and the app's Target, in one line", () => {
    expect(beatLine(bench, kg)).toBe('Bench Press 60 kg × 8 last time · try 62.5 × 8');
    expect(beatLine({ ...bench, repGoal: null }, kg)).toBe('Bench Press 60 kg × 8 last time · try 62.5 × 6');
    expect(beatLine({ ...bench, each: true }, kg)).toBe('Bench Press 60 kg each × 8 last time · try 62.5 × 8');
  });
  it('says nothing it cannot back: no last time, not weight and reps, bodyweight, easy week, another version', () => {
    expect(beatLine({ ...bench, last: null }, kg)).toBeNull();
    expect(beatLine({ ...bench, logType: 'time' }, kg)).toBeNull();
    expect(beatLine({ ...bench, logType: 'assisted' }, kg)).toBeNull();
    expect(beatLine({ ...bench, bodyweightOnly: true }, kg)).toBeNull();
    expect(beatLine({ ...bench, easy: true }, kg)).toBeNull();
    expect(beatLine({ ...bench, free: true }, kg)).toBeNull();
    expect(beatLine({ ...bench, version: { kind: 'harder', id: null, name: 'Dips' } }, kg)).toBeNull();
    expect(beatLine({ ...bench, targetWeightKg: 0 }, kg)).toBeNull();
  });
  it('the widget keeps Start, names the count, and carries at most two lines', () => {
    const d = widgetData({
      todayISO: '2026-11-04',
      today: { name: 'Push 1', exercises: ['Bench Press', 'Dips', 'Fly'], routineId: 'r1', beats: ['a', 'b', 'c'] },
      doneToday: null,
      doneDates: new Set(),
      goal: null,
    });
    expect(d.today).toEqual({ title: 'Push 1', line: '3 exercises', action: 'Start', routineId: 'r1', beats: ['a', 'b'] });
    const plain = widgetData({ todayISO: '2026-11-04', today: { name: 'Push 1', exercises: ['Bench Press'], routineId: 'r1' }, doneToday: null, doneDates: new Set(), goal: null });
    expect(plain.today.line).toBe('1 exercise · Bench Press first');
    expect(plain.today.beats).toBeUndefined();
  });
  it('done and Resume carry no lines to beat', () => {
    const base = { todayISO: '2026-11-04', today: { name: 'Push 1', exercises: ['Bench Press'], routineId: 'r1', beats: ['x'] }, doneDates: new Set<string>(), goal: null };
    expect(widgetData({ ...base, doneToday: 'Push 1' }).today.beats).toBeUndefined();
    expect(widgetPayload({ ...base, doneToday: null, live: { name: 'Push 1' } }).live).toEqual({ title: 'Push 1', line: 'Workout in progress', action: 'Resume' });
  });
});

describe('Gym right now', () => {
  const busy = (level: GymBusy['level'], about: number | null): GymBusy => ({ gymId: 'g', level, about, weeks: 4, week: {} as GymBusy['week'] });
  it('not in a gym: nothing (the widget asks to join)', () => {
    expect(widgetGym(null, null)).toBeNull();
  });
  it('in a gym with no reading yet: the name and no word', () => {
    expect(widgetGym({ gymName: 'Iron Gym' }, null)).toEqual({ name: 'Iron Gym', word: '', line: '', at: 0 });
  });
  it('a reading: one word, the head count only from 5 people, and when it was read', () => {
    expect(widgetGym({ gymName: 'Iron Gym' }, { busy: busy('busy', 15), at: 1000 })).toEqual({
      name: 'Iron Gym',
      word: 'Busy',
      line: 'About 15 people checked in during the last 90 minutes',
      at: 1000,
    });
    expect(widgetGym({ gymName: 'Iron Gym' }, { busy: busy('quiet', null), at: 5 })?.line).toBe('Quiet right now');
    expect(widgetGym({ gymName: 'Iron Gym' }, { busy: busy('closed', 20), at: 5 })?.line).toBe('Closed right now');
  });
  it('the words are what the server knows, never more', () => {
    expect(['quiet', 'normal', 'busy', 'closed'].map((l) => gymWord(l as GymBusy['level']))).toEqual(['Quiet', 'Usual', 'Busy', 'Closed']);
  });
});

const MOD = resolve(__dirname, '../../modules/forge-phone/android/src/main');
const read = (p: string): string => readFileSync(join(MOD, p), 'utf8');

describe('[source-text check] the native half', () => {
  const kt = read('java/com/forgeai/phone/Widgets.kt');
  it('the new widget is registered like the other two: receiver, provider xml, layout, picker words', () => {
    const manifest = read('AndroidManifest.xml');
    expect(manifest).toMatch(/<receiver android:name="com\.forgeai\.phone\.GymWidget" android:exported="true" android:label="@string\/forge_widget_gym_label">/);
    expect(manifest).toMatch(/android:resource="@xml\/forge_widget_gym"/);
    const xml = read('res/xml/forge_widget_gym.xml');
    expect(xml).toContain('android:initialLayout="@layout/forge_widget_gym"');
    expect(xml).toContain('android:description="@string/forge_widget_gym_desc"');
    expect(xml).toContain('android:updatePeriodMillis="1800000"');
    const strings = read('res/values/strings.xml');
    expect(strings).toContain('<string name="forge_widget_gym_label">MettleUp · Gym right now</string>');
    expect(strings).toContain('<string name="forge_widget_gym_desc">How busy your gym is right now. Tap to check in.</string>');
    expect(kt).toMatch(/class GymWidget : AppWidgetProvider\(\)/);
    expect(kt).toMatch(/GymWidget::class\.java\)\)\) m\.updateAppWidget\(id, gym\(ctx\)\)/);
  });
  it('an old reading never says "now"; the tap checks in, or joins a gym', () => {
    expect(kt).toContain('private const val GYM_FRESH_MS = 30L * 60_000L');
    expect(kt).toContain('"Last checked " + clockOf(ctx, at)');
    expect(kt).toContain('"as of " + clockOf(ctx, at)');
    expect(kt).toContain('open(ctx, "scan", 23)');
    expect(kt).toContain('"Join your gym in the app to see how busy it is"');
  });
  it('the module counts one kind, and pins the gym widget', () => {
    const mod = read('java/com/forgeai/phone/ForgePhoneModule.kt');
    expect(mod).toMatch(/Function\("widgetCountOf"\) \{ kind: String ->/);
    expect(kt).toMatch(/"gym" -> GymWidget::class\.java/);
  });
  it('the widget words have no banned member word', () => {
    for (const w of [...kt.matchAll(/"([A-Z][^"$]{6,})"/g)].map((m) => m[1])) expect(usesBannedWord(w), w).toBe(false);
  });
});
