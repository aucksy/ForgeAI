/**
 * R-336 (option B, approved on the design canvas 5 Nov 2026): the full-screen "A new MettleUp is here"
 * (when: lib/updatePrompt.ts; what: lib/updateStore.ts). Mounted once under the tabs, so it never shows
 * on the welcome screens, and only over the 4 main tabs. It also checks again when the app comes back
 * after 6 hours away (that counts as a launch), and lets a finished Play download install when the app
 * leaves. "Later" (or Android's back) closes it; the Workout tab's orange line (UpdateLine.tsx) stays.
 * Once Play's download is done, the small restart sheet asks instead (a full screen is too much for that).
 *
 * It scrolls: on a short phone (an iPhone SE, a 360 dp phone at large text) the buttons are below the
 * fold, never cut off (lesson: a full-screen card with overflow hidden lost its own button).
 */
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { GhostButton, PrimaryButton, Sheet } from '@/components/ui';
import { earlierLine, hasUpdateStandIn, kickerFor, qaOldNews, qaStandInBehind } from '@/lib/updatePrompt';
import { installDownloadedQuietly, useAppUpdate } from '@/lib/updateStore';
import { qaForgetWhatsNew } from '@/lib/whatsNew';
import { accentTint } from '@/theme/tint';
import { color, gradients, radius, shadow, space, type } from '@/theme/tokens';
import { phoneNative } from '@/tracker/phone/native';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

const RECHECK_MS = 6 * 60 * 60 * 1000;
/** Review fix: Android says "background" while a share sheet or picker covers the app; wait before installing. */
const QUIET_INSTALL_AFTER_MS = 60 * 1000;

export const UPDATE_WORDS = {
  title: 'A new MettleUp is here',
  github: 'Tap "Update now" to download the file, then open it to install. Your workouts stay safe.',
  play: 'It downloads while you keep using the app. Your workouts stay safe.',
  updateNow: 'Update now',
  later: 'Later',
  standIn: 'Test build: a made-up update.',
  restartTitle: 'The new version is ready to install',
  restart: 'Tap "Restart now" to open the new version. It takes a few seconds. Your workouts stay safe.',
  restartNow: 'Restart now',
} as const;

/** The download mark (arrow into a tray), drawn here: the shared icon set is frozen. */
export function DownloadMark({ size, stroke }: { size: number; stroke: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M12 4v11" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7 10l5 5 5-5" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 20h14" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function UpdatePrompt() {
  const popup = useAppUpdate((s) => s.popup);
  const kind = useAppUpdate((s) => s.kind);
  const playStatus = useAppUpdate((s) => s.playStatus);
  const busy = useAppUpdate((s) => s.busy);
  const workout = useActiveWorkout((s) => s.active);
  const lastCheck = useRef(0);
  // Review fix: only over the 4 main tabs, never over a screen opened on top (a summary, checkout, a scan).
  const onTabs = useSegments()[0] === '(tabs)';
  const visible = popup && !workout && onTabs;
  const restart = kind === 'play' && playStatus === 'downloaded';

  useEffect(() => {
    const run = (launch: boolean) => {
      lastCheck.current = Date.now();
      void useActiveWorkout
        .getState()
        .hydrate()
        .catch((e: unknown) => console.warn('[update] workout state not read before the check', e))
        .then(() => useAppUpdate.getState().check({ launch }));
    };
    run(true);
    let quiet: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (st) => {
      if (quiet) clearTimeout(quiet);
      quiet = null;
      if (st === 'background') quiet = setTimeout(installDownloadedQuietly, QUIET_INSTALL_AFTER_MS);
      // R-336: a return after 6+ hours away counts as a launch.
      if (st === 'active' && Date.now() - lastCheck.current > RECHECK_MS) run(true);
    });
    const native = phoneNative();
    const play = native?.playUpdateCheck ? native.addListener('onPlayUpdate', (e) => useAppUpdate.getState().setPlayStatus(e.status)) : null;
    return () => {
      if (quiet) clearTimeout(quiet);
      sub.remove();
      play?.remove();
    };
  }, []);

  // R-336 device UAT, QA builds only: mettleup://qa-update?behind=N (the route itself only opens the
  // Workout tab). Handled here, where the full screen lives, so no screen change can lose it.
  useEffect(() => {
    if (!hasUpdateStandIn(Constants.expoConfig?.extra)) return;
    const onUrl = (url: string | null) => {
      // R-401 UAT: the Workout tab's "New in this version" card shows again after the next start.
      if (qaOldNews(url)) void qaForgetWhatsNew().catch((e: unknown) => console.warn('[update] QA old news failed', e));
      const n = qaStandInBehind(url);
      if (n != null) void useAppUpdate.getState().qaStandIn(n).catch((e: unknown) => console.warn('[update] QA stand-in failed', e));
    };
    Linking.getInitialURL()
      .then(onUrl)
      .catch((e: unknown) => console.warn('[update] could not read the opening link', e));
    const sub = Linking.addEventListener('url', (e) => onUrl(e.url));
    return () => sub.remove();
  }, []);

  // A workout opened while the pop-up was up (a shortcut, the watch): it gives way.
  useEffect(() => {
    if (workout && popup) useAppUpdate.getState().laterPopup();
  }, [workout, popup]);

  // The launch count starts again when the member really saw the full screen.
  useEffect(() => {
    if (visible && !restart) useAppUpdate.getState().shown();
  }, [visible, restart]);

  if (!kind) return null;
  const close = () => useAppUpdate.getState().laterPopup();
  if (restart) {
    return (
      <Sheet
        visible={visible}
        title={UPDATE_WORDS.restartTitle}
        onClose={close}
        closeLabel="Later"
        footer={
          <View style={{ gap: space.sm }}>
            <PrimaryButton label={UPDATE_WORDS.restartNow} loading={busy} onPress={() => void useAppUpdate.getState().update()} />
            <GhostButton label={UPDATE_WORDS.later} onPress={close} />
          </View>
        }
      >
        <Text style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.inkSecondary }}>{UPDATE_WORDS.restart}</Text>
      </Sheet>
    );
  }
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      {/* UAT finding: the insets outside a Modal window missed the gesture bar ("Later" sat on it). */}
      <SafeAreaProvider>
        <UpdateFullScreen onLater={close} />
      </SafeAreaProvider>
    </Modal>
  );
}

/** The full screen itself (design: UpdateB). */
export function UpdateFullScreen({ onLater }: { onLater: () => void }) {
  const kind = useAppUpdate((s) => s.kind);
  const version = useAppUpdate((s) => s.version);
  const behind = useAppUpdate((s) => s.behind);
  const news = useAppUpdate((s) => s.news);
  const busy = useAppUpdate((s) => s.busy);
  const standIn = useAppUpdate((s) => s.standIn);
  const insets = useSafeAreaInsets();
  const earlier = earlierLine(behind);
  const kicker = kickerFor(behind, version);
  return (
    <View role="dialog" aria-modal accessibilityViewIsModal style={{ flex: 1, backgroundColor: color.bg }}>
      {/* The warm glow at the top (the design's radial wash), behind everything. */}
      <LinearGradient
        colors={[accentTint(0.22), accentTint(0.05), color.bg]}
        locations={[0, 0.5, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%' }}
        pointerEvents="none"
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + space.xxxl,
          paddingBottom: Math.max(insets.bottom, space.xl) + space.lg,
          paddingHorizontal: space.xl + 4,
          gap: space.xl + 4,
        }}
      >
        <View style={{ alignItems: 'center', gap: space.lg + 2 }}>
          <LinearGradient
            colors={gradients.ember}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ width: 96, height: 96, borderRadius: 30, alignItems: 'center', justifyContent: 'center', ...shadow.glow }}
          >
            <DownloadMark size={44} stroke={color.onAccent} />
          </LinearGradient>
          <Text
            style={{
              fontFamily: type.bodyBold,
              fontSize: type.size.caption,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              color: color.accentBright,
              textAlign: 'center',
            }}
          >
            {kicker}
          </Text>
          <Text accessibilityRole="header" style={{ fontFamily: type.display, fontSize: 30, lineHeight: 36, color: color.ink, textAlign: 'center' }}>
            {UPDATE_WORDS.title}
          </Text>
          <Text style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.inkSecondary, textAlign: 'center' }}>
            {kind === 'github' ? UPDATE_WORDS.github : UPDATE_WORDS.play}
          </Text>
        </View>
        {news.length > 0 || earlier ? (
          <View style={{ gap: space.sm + 2 }}>
            {news.map((line, i) => (
              <View
                key={i}
                accessible
                accessibilityLabel={`${i + 1}. ${line}`}
                style={{
                  flexDirection: 'row',
                  gap: space.md,
                  alignItems: 'center',
                  backgroundColor: color.glass,
                  borderWidth: 1,
                  borderColor: color.border,
                  borderRadius: radius.md,
                  padding: space.md + 2,
                }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.body, color: color.accentBright }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, fontFamily: type.body, fontSize: type.size.body, lineHeight: 21, color: color.ink }}>{line}</Text>
              </View>
            ))}
            {earlier ? (
              <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 19, color: color.inkMuted, paddingLeft: space.xs }}>{earlier}</Text>
            ) : null}
          </View>
        ) : null}
        <View style={{ marginTop: 'auto', gap: space.sm }}>
          <PrimaryButton label={UPDATE_WORDS.updateNow} loading={busy} onPress={() => void useAppUpdate.getState().update()} />
          <Pressable
            onPress={onLater}
            accessibilityRole="button"
            accessibilityLabel={UPDATE_WORDS.later}
            style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkMuted }}>{UPDATE_WORDS.later}</Text>
          </Pressable>
          {standIn ? (
            <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, textAlign: 'center' }}>{UPDATE_WORDS.standIn}</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
