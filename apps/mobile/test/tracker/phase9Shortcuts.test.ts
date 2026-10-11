/**
 * Audit Phase 9 (#9) — the long-press shortcuts on the app icon, from the Today widget's answer.
 * Each link is one the Today widget's start screen already understands (`widgetLink.ts`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { routineParam, widgetStartAction, widgetTokenOk } from '@/tracker/phone/widgetLink';
import { appShortcuts, widgetPayload } from '@/tracker/phone/widgets';

const base = {
  todayISO: '2026-10-14',
  doneToday: null,
  next: null,
  doneDates: new Set<string>(),
  goal: 3,
  live: null,
};
const push = { name: 'Push 1', exercises: ['Bench Press', 'Overhead Press'], routineId: 'r-push_1' };

function params(uri: string): URLSearchParams {
  return new URL(uri.replace('forgeai://', 'https://x/')).searchParams;
}

describe("app icon shortcuts — the Today widget's answer", () => {
  it("today's routine: \"Start Push 1\" with the widget's key, so one tap starts it", () => {
    const p = { ...widgetPayload({ ...base, today: push }), token: 'k9-abc' };
    const [first, weight] = appShortcuts(p);
    expect(first).toMatchObject({ id: 'today', short: 'Start', long: 'Start Push 1' });
    const q = params(first.uri);
    expect(first.uri.startsWith('forgeai://workout/start?')).toBe(true);
    expect(routineParam(q.get('routine') ?? undefined)).toBe('r-push_1');
    expect(widgetTokenOk(q.get('t') ?? undefined, 'k9-abc')).toBe(true);
    expect(widgetStartAction({ routineId: 'r-push_1', open: false, routineExists: true, tokenOk: true })).toBe('start');
    expect(weight).toEqual({ id: 'weight', short: 'Weight', long: 'Log body weight', uri: 'forgeai://bodyweight' });
  });

  it('no key could be read: the same link without it (the calm "Start Push 1?" screen)', () => {
    const [first] = appShortcuts(widgetPayload({ ...base, today: push }));
    expect(first.uri).toBe('forgeai://workout/start?routine=r-push_1');
  });

  it('a workout open: "Resume workout", whatever today holds', () => {
    const [first] = appShortcuts(widgetPayload({ ...base, today: push, live: { name: 'Legs' } }));
    expect(first).toMatchObject({ long: 'Resume workout', uri: 'forgeai://workout/start' });
    expect(widgetStartAction({ routineId: null, open: true, routineExists: false, tokenOk: false })).toBe('resume');
  });

  it("today's routine done, no plan, or a routine with no exercises: \"Start workout\" opens the Workout tab", () => {
    for (const p of [
      widgetPayload({ ...base, today: push, doneToday: 'Push 1', next: 'Pull 1' }),
      widgetPayload({ ...base, today: null, goal: null }),
      widgetPayload({ ...base, today: { name: 'Empty', exercises: [], routineId: 'r-e' } }),
    ]) {
      expect(appShortcuts(p)[0]).toEqual({ id: 'today', short: 'Start', long: 'Start workout', uri: 'forgeai://workout' });
    }
  });

  it('a long routine name is cut with "…" so the line fits (25 characters)', () => {
    const [first] = appShortcuts(widgetPayload({ ...base, today: { ...push, name: 'Upper body strength and conditioning A' } }));
    expect(first.long.length).toBeLessThanOrEqual(25);
    expect(first.long).toBe('Start Upper body strengt…');
  });

  it('an odd character in an id or key is escaped, never breaking the link', () => {
    const p = { ...widgetPayload({ ...base, today: { ...push, routineId: 'a&b' } }), token: 'x y' };
    const q = params(appShortcuts(p)[0].uri);
    expect(q.get('routine')).toBe('a&b');
    expect(routineParam(q.get('routine') ?? undefined)).toBeNull(); // not an id → the Workout tab
    expect(q.get('t')).toBe('x y');
  });

  it('[source-text check] the native side opens only forgeai:// links, inside ForgeAI, and keeps the last list', () => {
    const kt = readFileSync(resolve(__dirname, '../../modules/forge-phone/android/src/main/java/com/forgeai/phone/Shortcuts.kt'), 'utf8');
    expect(kt).toContain('uri.startsWith("forgeai://")');
    expect(kt).toContain('.setPackage(c.packageName)');
    expect(kt).toContain('removeAllDynamicShortcuts');
    expect(kt).toContain('prefs.getString(KEY_LAST, null) == json');
    const mod = readFileSync(resolve(__dirname, '../../modules/forge-phone/android/src/main/java/com/forgeai/phone/ForgePhoneModule.kt'), 'utf8');
    expect(mod).toContain('Function("shortcutsSave")');
  });
});
