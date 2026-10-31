/**
 * 0.56.0: the GitHub "new version" card never shows on a copy installed from Google Play (Android
 * refuses the GitHub APK there: another signing key). lib/installSource.ts decides; UpdateCard asks
 * it before it asks GitHub.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { distributionFrom, offersGithubUpdate, PLAY_INSTALLER, readInstaller } from '@/lib/installSource';

describe('where the app came from', () => {
  it('Google Play is com.android.vending, whatever the build flag says', () => {
    expect(PLAY_INSTALLER).toBe('com.android.vending');
    expect(distributionFrom('com.android.vending', 'github')).toBe('play');
    expect(distributionFrom('com.android.vending', undefined)).toBe('play');
    expect(offersGithubUpdate('com.android.vending', 'github')).toBe(false);
  });
  it('any other installer (a browser, the package installer) is a GitHub copy, even on a "play" build', () => {
    expect(distributionFrom('com.google.android.packageinstaller', 'play')).toBe('github');
    expect(distributionFrom('com.android.chrome', undefined)).toBe('github');
    expect(offersGithubUpdate('com.google.android.packageinstaller', 'play')).toBe(true);
  });
  it('the phone cannot say (older native code, adb, an error): the build flag decides, GitHub by default', () => {
    expect(distributionFrom(null, 'play')).toBe('play');
    expect(distributionFrom(undefined, 'play')).toBe('play');
    expect(distributionFrom('', 'play')).toBe('play');
    expect(distributionFrom(null, 'github')).toBe('github');
    expect(distributionFrom(null, undefined)).toBe('github');
    expect(distributionFrom(null, 'Play')).toBe('github'); // only the exact word
    expect(offersGithubUpdate(null, undefined)).toBe(true);
  });
  it('reading the installer never throws: no module, an older module, a failing call', () => {
    expect(readInstaller(null)).toBeNull();
    expect(readInstaller({})).toBeNull();
    expect(readInstaller({ installerPackage: () => 'com.android.vending' })).toBe('com.android.vending');
    expect(
      readInstaller({
        installerPackage: () => {
          throw new Error('boom');
        },
      }),
    ).toBeNull();
  });
});

describe('the build and the card are wired to it', () => {
  const root = join(__dirname, '..', '..');
  it('app.json says "github" by default (the release workflow may set "play")', () => {
    const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')) as { expo: { extra: { distribution?: string } } };
    expect(app.expo.extra.distribution).toBe('github');
  });
  it('the update store (R-260) asks before it asks GitHub, with the phone\'s installer and the build flag', () => {
    const src = readFileSync(join(root, 'src', 'lib', 'updateStore.ts'), 'utf8');
    const gate = src.indexOf('offersGithubUpdate(readInstaller(phoneNative()), Constants.expoConfig?.extra?.distribution)');
    expect(gate).toBeGreaterThan(-1);
    const play = src.indexOf('if (isPlayCopy())');
    expect(play).toBeGreaterThan(gate);
    // The GitHub check runs only in the else branch, after the Play gate.
    expect(src.indexOf('findLatest(current, now)')).toBeGreaterThan(play);
  });
  it('the native module has the call (Android 11+ install source, older phones the old one)', () => {
    const kt = readFileSync(join(root, 'modules', 'forge-phone', 'android', 'src', 'main', 'java', 'com', 'forgeai', 'phone', 'ForgePhoneModule.kt'), 'utf8');
    expect(kt).toContain('Function("installerPackage")');
    expect(kt).toContain('getInstallSourceInfo(c.packageName).installingPackageName');
    expect(kt).toContain('getInstallerPackageName(c.packageName)');
  });
});
