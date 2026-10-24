/**
 * Where this copy of the app came from (first MettleUp release, 0.56.0). The Workout tab's "A new
 * version is ready" card (lib/appUpdate.ts) offers the APK from GitHub. On a phone that got the app
 * from Google Play that APK carries a different signing key, so Android refuses to install it over
 * the Play one: the card must not show there (Play updates the app itself).
 *
 * Asked two ways, the phone's answer first:
 *  1. Android's own record of the installer (forge-phone `installerPackage`, from 0.56.0):
 *     "com.android.vending" is Google Play; any other installer (a browser, the file manager's
 *     package installer) is a GitHub copy.
 *  2. When the phone cannot say (a build before 0.56.0's native code, adb, an error): the build's
 *     own flag, app.json `extra.distribution` ("play" | "github", default "github"). The release
 *     workflow can set it to "play" for a Play-only build.
 * PURE (the callers pass in what the phone and the build said).
 */

export type Distribution = 'play' | 'github';

/** Google Play's installer package. */
export const PLAY_INSTALLER = 'com.android.vending';

/** Where the app came from, from the installer Android reported and the build's flag. PURE. */
export function distributionFrom(installer: string | null | undefined, flag: unknown): Distribution {
  if (typeof installer === 'string' && installer.trim() !== '') return installer.trim() === PLAY_INSTALLER ? 'play' : 'github';
  return flag === 'play' ? 'play' : 'github';
}

/** True when the GitHub "new version" card may show on this copy of the app. PURE. */
export function offersGithubUpdate(installer: string | null | undefined, flag: unknown): boolean {
  return distributionFrom(installer, flag) === 'github';
}

/** The installer Android reports, through the native module when it has the call; null otherwise. Never throws. */
export function readInstaller(native: { installerPackage?: () => string | null } | null | undefined): string | null {
  try {
    return native?.installerPackage?.() ?? null;
  } catch (e) {
    console.warn('[update] installer could not be read', e);
    return null;
  }
}
