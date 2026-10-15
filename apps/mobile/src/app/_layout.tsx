import * as Linking from 'expo-linking';
import { Stack, router, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactElement } from 'react';
import { AppState, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BrandOpening } from '@/components/BrandOpening';
import { KeyboardRoom } from '@/components/KeyboardRoom';
import { logScreenCrash, ScreenCrashFallback, ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { SaveProblemBanner } from '@/components/SaveProblemBanner';
import { ConfirmHost } from '@/components/ui';
import { startUnitSync } from '@/lib/useUnits';
import { FEATURES } from '@/lib/features';
import { useCloud } from '@/store/cloudStore';
import { WorkoutPresenceHost } from '@/tracker/components/WorkoutPresenceHost';
import { phoneAfterLookChange } from '@/tracker/phone/phoneSync';
import { photoBackupAtStart } from '@/tracker/services/photoBackup';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { BootErrorScreen } from '@/onboarding/components/BootErrorScreen';
import { WelcomeScreen } from '@/onboarding/components/WelcomeScreen';
import { useOnboarding, type BootStatus } from '@/onboarding/store/onboardingStore';
import { refreshGymIfDue, refreshGymNow } from '@/shop/gymActions';
import { checkInCodeFromUrl } from '@/shop/checkIn';
import { inviteCodeFromUrl, setPendingCheckIn, setPendingInvite, takePendingCheckIn, takePendingInvite } from '@/shop/pendingInvite';

/** The link the app was started with is read once per run: an erase later must not bring it back. */
let launchLinkRead = false;
import { dismissOpening, setWorkoutCheck, showWaitingLook, startGymTheme, useGymTheme } from '@/theme/gymTheme';
import { color } from '@/theme/tokens';
import { useAppFonts } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync().catch(() => {});
// v0.27.0: kg / lb and km / miles — the pure formatters follow Profile → Units.
startUnitSync();
// Gym branding: the joined gym's look (already in the tokens since index.js) follows the gym
// shop's saved link from here on — join, Leave gym, erase (theme/gymTheme.ts). A look the member
// did not ask for waits while a workout is open: the theme sees one through this check.
// An open workout — or one not read back yet (unknown counts as open): never re-draw over it.
setWorkoutCheck(() => {
  const w = useActiveWorkout.getState();
  return w.active || !w.hydrated;
});
startGymTheme();

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
  // Gym branding: `epoch` changes whenever a gym's colours are written into the theme tokens
  // (a join, Leave gym, an erase); the app below is keyed on it, so every screen — the frozen
  // shared pieces too — draws again from the new values.
  const epoch = useGymTheme((s) => s.epoch);
  const themeReady = useGymTheme((s) => s.ready);
  const opening = useGymTheme((s) => s.opening);

  useEffect(() => {
    (async () => {
      // DS-08 / SH-11: the whole start-up — open the database, run EVERY upgrade step, sync
      // the bundled library, then read. An open or upgrade failure lands on the error screen
      // (status 'error'), never on the app over a half-upgraded database; its "Try again"
      // re-runs all of it (useOnboarding.retry). Never throws.
      await useOnboarding.getState().start();
      // Audit PG-17 / D11: after a fresh install, photos come back from the backup folder; the
      // opt-in copies are kept current. In the background, never in the way of the start-up.
      if (useOnboarding.getState().status === 'ready') void photoBackupAtStart().catch(() => undefined);
      // Cloud is fully gated: init() no-ops (and starts NO network watcher)
      // unless a gym is linked, so the offline app makes zero network calls.
      // Gym sync is hidden until its own phase (D4) — not even started then.
      if (FEATURES.gymSync) void useCloud.getState().init();
    })();
  }, []);

  const ready = fontsLoaded && status !== 'loading' && themeReady;

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
    // Gym branding: the gym's name and look as they are now (the owner may have changed them).
    // Back while the logo is still up → shown at once; later → the next time the app comes back
    // with no workout open (below). Joined phones only; quiet on failure.
    void refreshGymNow().catch(() => undefined);
    // Back to the foreground: a look that is waiting is shown now (under the gym's logo) unless a
    // workout is open, and the gym is asked again at most about once an hour.
    // Review fix: only after a real time away (a share sheet or picker is not a new visit).
    let awaySince: number | null = null;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        awaySince = Date.now();
        return;
      }
      if (s !== 'active') return;
      const away = awaySince == null ? 0 : Date.now() - awaySince;
      awaySince = null;
      showWaitingLook(away);
      void refreshGymIfDue().catch(() => undefined);
    });
    // A new look once the app is up (join, Leave, an owner's change shown): the home-screen
    // widgets and the reminders scheduled with the old colour are drawn again in the new one.
    // (The look the app starts in reaches them through the phone sync's own start.)
    const unwatch = useGymTheme.subscribe((s, prev) => {
      if (s.epoch !== prev.epoch) void phoneAfterLookChange().catch(() => undefined);
    });
    return () => {
      sub.remove();
      unwatch();
    };
  }, [ready]);

  // Invite link on a phone that is not set up yet: the welcome flow stands in for the app's
  // screens, so the gym's link is kept (shop/pendingInvite.ts) and its "Join <gym>" screen opens
  // once the welcome flow is done. A screen the link already opened takes the code first.
  useEffect(() => {
    if (status !== 'welcome') return;
    const keep = (url: string | null) => {
      const code = inviteCodeFromUrl(url);
      if (code) setPendingInvite(code);
      // QR self check-in: a check-in poster scanned before setup opens "Check in at <gym>" after it.
      const checkIn = checkInCodeFromUrl(url);
      if (checkIn) setPendingCheckIn(checkIn);
    };
    if (!launchLinkRead) {
      launchLinkRead = true;
      void Linking.getInitialURL().then(keep).catch(() => undefined);
    }
    const sub = Linking.addEventListener('url', ({ url }) => keep(url));
    return () => sub.remove();
  }, [status]);
  useEffect(() => {
    if (status !== 'ready') return;
    const t = setTimeout(() => {
      const code = takePendingInvite();
      if (code) router.push(`/j/${code}`);
      const checkIn = takePendingCheckIn();
      if (checkIn) router.push(`/c/${checkIn}`);
    }, 600);
    return () => clearTimeout(t);
  }, [status]);

  return (
    <>
      <RootFrame key={epoch} ready={ready} status={status} />
      {ready && opening ? <BrandOpening key={opening.id} opening={opening} onDone={dismissOpening} /> : null}
    </>
  );
}

/**
 * The app itself. Created afresh whenever the gym's look changes (keyed on the theme's epoch in
 * RootLayout), so nothing keeps a colour from before.
 */
function RootFrame({ ready, status }: { ready: boolean; status: BootStatus }) {
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
