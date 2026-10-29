/**
 * "Watch opens when a workout starts" and "Watch in the gym's colour" (29 Oct 2026): the phone's
 * pure rules (watchOpen.shouldOpenWatch, restCard.watchAccent) and the native wiring read as text.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { watchAccent } from '@/tracker/services/restCard';
import { START_WINDOW_MS, shouldOpenWatch } from '@/tracker/services/watchOpen';

const NOW = 1_761_700_000_000;
const closed = { active: false, startedAt: null, pastLog: false, editingSessionId: null };
const started = { active: true, startedAt: NOW - 500, pastLog: false, editingSessionId: null };

describe('shouldOpenWatch', () => {
  it('opens on the start of a workout', () => {
    expect(shouldOpenWatch(closed, started, NOW, true)).toBe(true);
  });

  it('never when the switch is off', () => {
    expect(shouldOpenWatch(closed, started, NOW, false)).toBe(false);
  });

  it('never on a resume of a saved workout (old start time)', () => {
    const resumed = { ...started, startedAt: NOW - 20 * 60_000 };
    expect(shouldOpenWatch(closed, resumed, NOW, true)).toBe(false);
    expect(shouldOpenWatch(closed, { ...started, startedAt: NOW - START_WINDOW_MS - 1 }, NOW, true)).toBe(false);
  });

  it('never on an update of a workout already open', () => {
    expect(shouldOpenWatch(started, { ...started }, NOW, true)).toBe(false);
  });

  it('never for a correction or a workout logged afterwards', () => {
    expect(shouldOpenWatch(closed, { ...started, editingSessionId: 's1' }, NOW, true)).toBe(false);
    expect(shouldOpenWatch(closed, { ...started, pastLog: true }, NOW, true)).toBe(false);
  });

  it('never without a start time', () => {
    expect(shouldOpenWatch(closed, { ...started, startedAt: null }, NOW, true)).toBe(false);
  });
});

describe('watchAccent', () => {
  const palette = { color: { accent: '#3b82f6' } };

  it("is the gym's accent as the app shows it", () => {
    expect(watchAccent({ accent: '#1E3A8A' }, palette)).toBe('#3B82F6');
  });

  it('is null with no gym, a gym with no colour, or no palette (MettleUp orange)', () => {
    expect(watchAccent(null, palette)).toBeNull();
    expect(watchAccent({ accent: null }, palette)).toBeNull();
    expect(watchAccent({ accent: '#1E3A8A' }, null)).toBeNull();
  });
});

describe('native wiring (text)', () => {
  const root = resolve(__dirname, '../..');
  const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');

  it('the phone sends the colour additively and opens the watch on request', () => {
    const sync = read('modules/forge-rest/android/src/main/java/com/forgeai/rest/WearSync.kt');
    expect(sync).toMatch(/"accent" to now\[7\]/);
    expect(sync).toMatch(/fun openWatch\(ctx: Context, startedAt: Long\)/);
    expect(sync).toMatch(/RemoteActivityHelper/);
    const mod = read('modules/forge-rest/android/src/main/java/com/forgeai/rest/ForgeRestModule.kt');
    expect(mod).toMatch(/Function\("setWatchAccent"\)/);
    expect(mod).toMatch(/Function\("openWatch"\)/);
  });

  it('the watch reads a missing colour as orange and listens for /forge/open', () => {
    const ws = read('android/wear/src/main/java/com/forgeai/wear/WatchSync.kt');
    expect(ws).toMatch(/m\.getString\("accent", ""\)/);
    const manifest = read('android/wear/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/android:path="\/forge\/open"/);
    expect(manifest).toMatch(/android:scheme="mettleup-watch"/);
  });
});
