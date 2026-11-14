/**
 * 0.78.0 release round (qa-journeys run 43630726782, J3): the app crashed when a gym push reached the phone
 * while the app was not running yet. expo-notifications runs the push task through expo-task-manager, which
 * loads its background loader by the class name in expo-modules-core's manifest
 * (expo.modules.adapters.react.apploader.RNHeadlessAppLoader, Class.forName). R8 renamed that class in the
 * release build, the loader came back null and TaskService.executeTask threw a NullPointerException.
 * The keep rule must stay in the committed ProGuard file (the build uses it) and in app.json (a prebuild
 * would write the file again from there).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const APP = join(__dirname, '..', '..');
const KEEP = '-keep class expo.modules.adapters.react.apploader.** { *; }';

describe('the background loader for gym pushes survives R8', () => {
  it('in the committed proguard-rules.pro', () => {
    const rules = readFileSync(join(APP, 'android/app/proguard-rules.pro'), 'utf8');
    expect(rules).toContain(KEEP);
  });
  it('in app.json (expo-build-properties extraProguardRules)', () => {
    const app = JSON.parse(readFileSync(join(APP, 'app.json'), 'utf8')) as {
      expo: { plugins: unknown[] };
    };
    const props = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties') as
      | [string, { android: { extraProguardRules?: string } }]
      | undefined;
    expect(props?.[1].android.extraProguardRules ?? '').toContain(KEEP);
  });
  it('the release build still shrinks (the rule is needed, not a switch-off)', () => {
    const gradle = readFileSync(join(APP, 'android/app/build.gradle'), 'utf8');
    expect(gradle).toMatch(/proguardFiles getDefaultProguardFile\("proguard-android.txt"\), "proguard-rules.pro"/);
  });
});
