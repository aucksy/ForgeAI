import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { initDb } from '@/db';
import { ensureSeeded } from '@/db/seed';
import { color } from '@/theme/tokens';
import { useAppFonts } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await initDb();
        await ensureSeeded();
      } finally {
        setDbReady(true);
      }
    })();
  }, []);

  const ready = fontsLoaded && dbReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: color.bg }} />;

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
