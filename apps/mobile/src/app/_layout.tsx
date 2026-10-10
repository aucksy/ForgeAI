import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactElement } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { KeyboardRoom } from '@/components/KeyboardRoom';
import { logScreenCrash, ScreenCrashFallback, ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { SaveProblemBanner } from '@/components/SaveProblemBanner';
import { ConfirmHost } from '@/components/ui';
import { startUnitSync } from '@/lib/useUnits';
import { FEATURES } from '@/lib/features';
import { useCloud } from '@/store/cloudStore';
import { WorkoutPresenceHost } from '@/tracker/components/WorkoutPresenceHost';
import { BootErrorScreen } from '@/onboarding/components/BootErrorScreen';
import { WelcomeScreen } from '@/onboarding/components/WelcomeScreen';
import { useOnboarding } from '@/onboarding/store/onboardingStore';
import { color } from '@/theme/tokens';
import { useAppFonts } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync().catch(() => {});
// v0.27.0: kg / lb and km / miles — the pure formatters follow Profile → Units.
startUnitSync();

/**
 * Last resort: the root layout ITSELF threw while drawing (each screen has its own
 * ScreenErrorBoundary below, so a screen crash never reaches here). expo-router renders this
 * in place of the layout; "Try again" draws it afresh. Stores — and so the live workout
 * draft — are untouched.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    logScreenCrash(error);
    SplashScreen.hideAsync().catch(() => {});
  }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <StatusBar style="light" />
      <ScreenCrashFallback onRetry={() => void retry()} noNavigation />
    </View>
  );
}

/** Every screen of the navigator gets its own boundary: one crash never closes the app. */
const screenLayout = ({ children }: { children: ReactElement }) => (
  <ScreenErrorBoundary>{children}</ScreenErrorBoundary>
);

export default function RootLayout() {
  // Loaded or failed — a font failure falls back to the phone's font (SH-02).
  const fontsLoaded = useAppFonts();
  // Phase O2 (W1): NOTHING is seeded on launch any more. A first run with no
  // profile row lands on the welcome flow; the demo seed runs only when the
  // member explicitly asks for it (welcome screen / Settings → Your data).
  const status = useOnboarding((s) => s.status);

  useEffect(() => {
    (async () => {
      // DS-08 / SH-11: the whole start-up — open the database, run EVERY upgrade step, sync
      // the bundled library, then read. An open or upgrade failure lands on the error screen
      // (status 'error'), never on the app over a half-upgraded database; its "Try again"
      // re-runs all of it (useOnboarding.retry). Never throws.
      await useOnboarding.getState().start();
      // Cloud is fully gated: init() no-ops (and starts NO network watcher)
      // unless a gym is linked, so the offline app makes zero network calls.
      // Gym sync is hidden until its own phase (D4) — not even started then.
      if (FEATURES.gymSync) void useCloud.getState().init();
    })();
  }, []);

  const ready = fontsLoaded && status !== 'loading';

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: color.bg }} />;

  // Rendered INSTEAD of the navigator (not pushed onto it) so the tabs never mount
  // over an empty DB, and an "Erase all data" can drop straight back here.
  // KeyboardRoom: the app draws edge to edge, where Android no longer shrinks the window
  // for the keyboard — it gives every screen the room back (see components/KeyboardRoom).
  if (status === 'welcome' || status === 'error') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
        <StatusBar style="light" />
        <KeyboardRoom>{status === 'welcome' ? <WelcomeScreen /> : <BootErrorScreen />}</KeyboardRoom>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <StatusBar style="light" />
      <KeyboardRoom>
        <Stack
          screenLayout={screenLayout}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.bg },
            animation: 'fade_from_bottom',
          }}
        />
        <WorkoutPresenceHost />
        {/* The app's own "Are you sure?" sheet (askConfirm) — mounted once, above every screen. */}
        <ConfirmHost />
        {/* A failed save (e.g. phone storage full) is shown on every screen of the app. */}
        <SaveProblemBanner />
      </KeyboardRoom>
    </GestureHandlerRootView>
  );
}
