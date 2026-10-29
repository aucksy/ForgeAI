/**
 * UAT U-W1 / U-W3 / U-W4 / U-W5 (17 Oct 2026): what keeps the watch to ONE buzz at a rest's end,
 * and what keeps the watch's buttons honest. Kotlin builds only in cloud CI, so these read the
 * phone's and the watch's Kotlin as text (the same style as liveCard.test.ts). The watch's own JVM
 * tests (BridgingTest, RestTextTest) and the phone module's (WearWireTest) run in wear-build.yml.
 *
 *  - The phone tags its rest countdown "rest-card" and its "Rest is over" "rest-over".
 *  - The watch app asks Wear OS never to copy "rest-over" (it buzzes itself, also with its
 *    notifications refused: U-W1), and not to copy "rest-card" only while it can show its own.
 * Dropping or renaming one of these brings back a double buzz, or no buzz, silently.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (p: string): string => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8').replace(/\r\n/g, '\n');
const PHONE = 'modules/forge-rest/android/src/main/java/com/forgeai/rest/';
const WATCH = 'android/wear/src/main/java/com/forgeai/wear/';

/** The body of the Kotlin function that starts at [signature], up to the next function of the file. */
const fnBody = (src: string, signature: string): string => {
  const at = src.indexOf(signature);
  expect(at, signature).toBeGreaterThanOrEqual(0);
  const rest = src.slice(at + signature.length);
  const next = rest.search(/\n {2}(?:(?:private|internal|public) )?fun /);
  return next < 0 ? rest : rest.slice(0, next);
};

describe('the phone tags its two watch-copied notifications (U-W5)', () => {
  const rest = read(`${PHONE}RestCard.kt`);

  it('the tags are "rest-over" and "rest-card", each set exactly once', () => {
    expect(rest).toContain('const val BRIDGE_TAG_OVER = "rest-over"');
    expect(rest).toContain('const val BRIDGE_TAG_CARD = "rest-card"');
    expect(rest.match(/setBridgeTag\(/g)).toHaveLength(2);
  });

  it('"rest-card" is on the rest countdown builder, "rest-over" on the "Rest is over" builder', () => {
    const card = fnBody(rest, 'private fun post(ctx: Context, r: Rest)');
    expect(card).toContain('val b = builder(ctx, channel)');
    expect(card).toContain('Notification.WearableExtender().setBridgeTag(BRIDGE_TAG_CARD)');
    expect(card).not.toContain('BRIDGE_TAG_OVER');

    const over = fnBody(rest, 'private fun postOver(');
    expect(over).toContain('.setContentTitle("Rest is over")');
    expect(over).toContain('Notification.WearableExtender().setBridgeTag(BRIDGE_TAG_OVER)');
    expect(over).not.toContain('BRIDGE_TAG_CARD');
  });

  it('the stale "since C5-6 always" note is gone (U-W1)', () => {
    expect(rest).not.toContain('since C5-6 always');
  });

  it('the live workout card never reaches a watch at all (local only, no tag needed)', () => {
    const live = read(`${PHONE}WorkoutCard.kt`);
    expect(live).toContain('.setLocalOnly(true)');
    expect(live).not.toContain('setBridgeTag(');
  });
});

describe('the watch keeps exactly those tags off, and buzzes itself (U-W1 / U-W5)', () => {
  const bridging = read(`${WATCH}Bridging.kt`);
  const alerts = read(`${WATCH}RestAlerts.kt`);

  it('the watch names the same tags as the phone', () => {
    expect(bridging).toContain('const val TAG_OVER = "rest-over"');
    expect(bridging).toContain('const val TAG_CARD = "rest-card"');
  });

  it('"rest-over" always, "rest-card" only while its notifications are allowed', () => {
    expect(bridging).toContain(
      'fun excludedTags(canPost: Boolean): List<String> = if (canPost) listOf(TAG_OVER, TAG_CARD) else listOf(TAG_OVER)',
    );
    const sync = fnBody(bridging, 'fun sync(ctx: Context)');
    expect(sync).toContain('val tags = excludedTags(canPost(app))');
    expect(sync).toContain('for (t in tags) b.addExcludedTag(t)');
    // No other exclusion anywhere: exactly these tags, nothing else.
    expect(bridging.match(/addExcludedTag\(/g)).toHaveLength(1);
  });

  it('the rest-end buzz never waits on the notification permission (one buzz, the watch\'s own)', () => {
    const over = fnBody(alerts, 'fun restOver(');
    expect(over).toMatch(/\n {4}buzz\(ctx, r\.ringThroughDnd\)\n/); // a statement of its own, not under an if
    expect(over).not.toMatch(/if \([^)]*\) buzz\(/);
    const wear = ['Bridging.kt', 'RestAlerts.kt', 'WatchState.kt', 'MainActivity.kt'].map((f) => read(`${WATCH}${f}`)).join('\n');
    expect(wear).not.toContain('shouldBuzz');
  });

  it('the watch may vibrate (the Vibrator needs VIBRATE, not notifications)', () => {
    expect(read('android/wear/src/main/AndroidManifest.xml')).toContain('<uses-permission android:name="android.permission.VIBRATE" />');
  });
});

describe('a set the phone cannot log is reported back to the watch (U-W3)', () => {
  it('the phone answers /forge/nack/done to the sending watch, and parses through the tested WearWire', () => {
    const svc = read(`${PHONE}WearActionService.kt`);
    expect(svc).toContain('const val PATH_NACK_DONE = "/forge/nack/done"');
    expect(svc).toMatch(/sendMessage\(event\.sourceNodeId, PATH_NACK_DONE/);
    const sync = read(`${PHONE}WearSync.kt`);
    expect(sync).toContain('val d = WearWire.parseDone(data)');
  });

  it('the watch listens for it and tells the member at once', () => {
    expect(read(`${WATCH}WatchActions.kt`)).toContain('const val PATH_NACK_DONE = "/forge/nack/done"');
    const svc = read(`${WATCH}ForgeListenerService.kt`);
    expect(svc).toMatch(/onMessageReceived[\s\S]*WatchActions\.PATH_NACK_DONE[\s\S]*WatchActions\.refused/);
    const manifest = read('android/wear/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/com\.google\.android\.gms\.wearable\.MESSAGE_RECEIVED[\s\S]*android:pathPrefix="\/forge\/nack"/);
    // R-207: the app screen is glance-only (no button to show again), so a refused set is a short note.
    expect(read(`${WATCH}WatchActions.kt`)).toMatch(/fun refused\(ctx: Context\)[\s\S]*note\(ctx, "Not saved\. Tick it on your phone"\)/);
  });
});

describe('the phone\'s watch link and the QA script agree (U-W2 / U-W5)', () => {
  it('a state counts as sent only on a successful put (U-W2)', () => {
    const sync = read(`${PHONE}WearSync.kt`);
    expect(sync).toMatch(/putDataItem\(data\)\s*\.addOnSuccessListener \{\s*outbox\.sent\(item\)/);
    expect(sync).toMatch(/\.addOnFailureListener \{ e ->\s*outbox\.failed\(item\)/);
    expect(sync).not.toMatch(/lastWorkout = now\s*\n\s*put\(ctx, PATH_WORKOUT\) \{/);
  });

  it('notif.py reads the phone\'s "watch: <mode>" log line, which WearSync writes', () => {
    expect(read(`${PHONE}WearSync.kt`)).toContain('Log.i(TAG, "watch: $mode")');
    const qa = read('qa/notif.py');
    expect(qa).toContain('re.findall(r"\\bwatch: (plain|app|none)\\b", out)');
    expect(qa).toContain('want_ch = PLAIN_WATCH_CHANNEL if mode == "plain" else CARD_CHANNEL');
  });
});

describe('the watch tests gate CI (U-W4)', () => {
  const root = (p: string): string => read(`../../${p}`);

  it('release-apk.yml runs them before the build that makes and signs the watch APK', () => {
    const rel = root('.github/workflows/release-apk.yml');
    const tests = rel.indexOf(':wear:testReleaseUnitTest :forge-rest:testReleaseUnitTest');
    const build = rel.indexOf('- name: Build release APK + AAB (+ watch APK + watch AAB)');
    expect(tests).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(tests);
    // Not allowed to fail quietly.
    const step = rel.slice(rel.lastIndexOf('- name:', tests), tests);
    expect(step).not.toContain('continue-on-error');
  });

  it('wear-build.yml runs on pushes that touch the watch or the phone watch link', () => {
    const wear = root('.github/workflows/wear-build.yml');
    expect(wear).toMatch(/push:\s*\n\s*branches: \[main\]\s*\n\s*paths:/);
    expect(wear).toContain("- 'apps/mobile/android/wear/**'");
    expect(wear).toContain("- 'apps/mobile/modules/forge-rest/**'");
    expect(wear).toContain(':wear:testDebugUnitTest :forge-rest:testDebugUnitTest');
  });
});
