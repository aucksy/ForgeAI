/**
 * R-440 (10 Nov 2026): on the light look the status bar's clock and battery stayed WHITE on the cream
 * "Your watch app has an update" pop-up (UAT run for R-438). A React Native Modal is its own Android
 * window and React Native's StatusBar only sets the main window, so a <StatusBar> inside the Modal did
 * nothing. Every full-page pop-up now sets its own window's icons when it shows (read as text).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

/** Full-page pop-ups drawn in the page colour: their status-bar icons must follow the look. */
const FULL_PAGE = [
  'src/components/WatchUpdatePrompt.tsx',
  'src/components/UpdatePrompt.tsx',
  'src/tracker/components/MachineInUse.tsx',
  'src/tracker/components/WorkoutPhotos.tsx',
  'src/app/photos/index.tsx',
  'src/app/photos/compare.tsx',
  'src/app/exercise/[id].tsx',
];

describe('pop-up status bar follows the look (R-440)', () => {
  it.each(FULL_PAGE)('%s sets its window icons when it shows', (p) => {
    const src = read(p);
    // The opening tag sits on one line in each file ("=>" in a handler ends a [^>]* match too early).
    const modals = src.match(/<Modal\b.*$/gm) ?? [];
    expect(modals.length).toBeGreaterThan(0);
    for (const m of modals) expect(m).toContain('onShow={popupBarsFollowLook}');
  });

  it('no <StatusBar> inside a pop-up (it only reaches the main window)', () => {
    for (const p of FULL_PAGE) expect(read(p)).not.toMatch(/<StatusBar\b/);
  });

  it('the helper asks the native side with the look, and the native side exists', () => {
    const js = read('src/theme/appearance.ts');
    expect(js).toMatch(/modalBars\?\.\(tokenScheme\(\) === 'light'\)/);
    const kt = read('modules/forge-phone/android/src/main/java/com/forgeai/phone/ForgePhoneModule.kt');
    expect(kt).toContain('Function("modalBars")');
    const bars = read('modules/forge-phone/android/src/main/java/com/forgeai/phone/PopupBars.kt');
    expect(bars).toContain('APPEARANCE_LIGHT_STATUS_BARS');
    expect(bars).toContain('WindowInspector.getGlobalWindowViews()');
  });
});
