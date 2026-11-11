/**
 * Which link a freshly made app screen opens. PURE (the caller in `app/+native-intent.tsx` reads
 * expo-linking's record and clears it).
 *
 * 12 Nov 2026 (0.77.0 gate, UAT UK5, default-profile run 43106098012): the app-icon shortcut
 * "Log body weight" showed "Start Push Day A?" (the question of the Start link opened a minute
 * earlier) instead of Measures. A launcher shortcut starts the app with NEW_TASK | CLEAR_TASK, so
 * Android makes a NEW app screen and closes the old one. The JS is already running, so the new
 * screen's first render asks React Native for "the link the app was opened with" at once. React
 * Native (IntentModule.getInitialURL) answers from the screen it calls current, and that pointer
 * only moves to the new screen when the new screen resumes (or is cleared when the old one is
 * destroyed). When the question comes first, the answer is the OLD screen's link: the member gets
 * the previous link's page. When the old screen is already gone but the new one has not resumed,
 * React Native waits, and expo-router gives up after 150 ms and opens the app's first page instead
 * (the likely cause of the 31 Oct UK2 "Resume workout shortcut left me on the Workout tab").
 *
 * expo-linking keeps its own record, written in the new screen's onCreate before its JS starts
 * (Android), or by the app delegate (iPhone): that record is this launch's link. So when the record
 * holds a link, it wins over React Native's answer. The caller clears the record after every link
 * it handles, so a later launch WITHOUT a link (which never writes the record) cannot pick an old
 * one up; with no record, React Native's answer stands (the behaviour before this fix).
 */

/** A link we can open: "scheme:" then something (forgeai://, mettleup://, https://, content://). */
const LINK = /^[a-z][a-z0-9+.-]*:\S+$/i;

export function launchLinkPath(o: {
  /** What expo-router got from React Native (after its redirects): may be the old screen's link. */
  path: string;
  /** expo-linking's record of the link this launch was opened with; null when none. */
  launchRecord: string | null | undefined;
}): string {
  const rec = typeof o.launchRecord === 'string' ? o.launchRecord.trim() : '';
  if (!rec || !LINK.test(rec)) return o.path;
  return rec;
}

/** A link for the log, without its query (a Start link's one-shot key never reaches the log). */
export function linkForLog(url: string | null | undefined): string {
  if (!url) return '(none)';
  const q = url.search(/[?#]/);
  return q < 0 ? url : url.slice(0, q);
}
