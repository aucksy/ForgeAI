import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useCloud } from '@/store/cloudStore';
import { initDb } from '@/db';
import { initTrackerSchema } from '@/tracker/db/trackerSchema';
import { initMemberSchema } from '@/onboarding/db/memberSchema';
import { BootErrorScreen } from '@/onboarding/components/BootErrorScreen';
import { WelcomeScreen } from '@/onboarding/components/WelcomeScreen';
import { useOnboarding } from '@/onboarding/store/onboardingStore';
import { color } from '@/theme/tokens';
import { useAppFonts } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  const [dbReady, setDbReady] = useState(false);
  // Phase O2 (W1): NOTHING is seeded on launch any more. A first run with no
  // profile row lands on the welcome flow; the demo seed runs only when the
  // member explicitly asks for it (welcome screen / Settings → Your data).
  const status = useOnboarding((s) => s.status);

  useEffect(() => {
    (async () => {
      try {
        await initDb();
        await initTrackerSchema(); // additive tracker columns
        await initMemberSchema(); // additive member columns (phone)
      } catch {
        // Fall through: boot() below will fail its reads too and land on the
        // retry screen. Swallowing here (rather than skipping boot) is what keeps
        // a failed migration from freezing the app on a blank splash.
      } finally {
        setDbReady(true);
      }
      await useOnboarding.getState().boot();
      // Cloud is fully gated: init() no-ops (and starts NO network watcher)
      // unless a gym is linked, so the offline app makes zero network calls.
      void useCloud.getState().init();
    })();
  }, []);

  const ready = fontsLoaded && dbReady && status !== 'loading';

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: color.bg }} />;

  // Rendered INSTEAD of the navigator (not pushed onto it) so the tabs never mount
  // over an empty DB, and an "Erase all data" can drop straight back here.
  if (status === 'welcome' || status === 'error') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
        <StatusBar style="light" />
        {status === 'welcome' ? <WelcomeScreen /> : <BootErrorScreen />}
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg },
          animation: 'fade_from_bottom',
        }}
      />
    </GestureHandlerRootView>
  );
}
