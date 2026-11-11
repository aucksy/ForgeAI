/**
 * expo-router's hook for every link the phone hands the app (not a screen).
 *
 * 12 Nov 2026 (UAT UK5): a fresh app screen made by an app-icon shortcut could open the PREVIOUS
 * link (the member tapped "Log body weight" and got "Start Push Day A?"). The first link of a new
 * screen is taken from expo-linking's own record of this launch when it has one; see
 * `lib/launchLink.ts` for the race. After every link the record is cleared, so a later launch
 * without a link never reopens it.
 */
import * as Linking from 'expo-linking';

import { launchLinkPath, linkForLog } from '@/lib/launchLink';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  let chosen = path;
  try {
    if (initial) {
      chosen = launchLinkPath({ path, launchRecord: Linking.getLinkingURL() });
      if (chosen !== path) {
        console.log('[link] launch link taken from this launch, not the last screen:', linkForLog(path), '->', linkForLog(chosen));
      }
    }
  } catch (e) {
    console.warn('[ForgeErr] launch link: could not read this launch\'s link', e);
    chosen = path;
  }
  try {
    Linking.clearInitialURL();
  } catch (e) {
    console.warn('[ForgeErr] launch link: could not clear the launch record', e);
  }
  return chosen;
}
