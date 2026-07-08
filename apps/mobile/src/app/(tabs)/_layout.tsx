import { Tabs } from 'expo-router';

import { TrackerTabBar } from '@/tracker/components/TrackerTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TrackerTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="workout" options={{ title: 'Workout' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Progress' }} />
      <Tabs.Screen name="settings" options={{ title: 'Profile' }} />
      {/* Coach stays reachable (Home button) but is hidden from the tab bar. */}
      <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
    </Tabs>
  );
}
