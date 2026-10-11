import { Tabs } from 'expo-router';

import { TrackerTabBar } from '@/tracker/components/TrackerTabBar';

/**
 * Redesign R1 — three tabs, exactly Hevy's shape: Workout (opens first), Profile, Shop.
 * Home, History and Progress are gone as tabs: "/" sends to Workout (app/index.tsx), History and
 * Progress are plain pages the Profile links to, and Settings is the Profile's gear.
 */
export const unstable_settings = { initialRouteName: 'workout' };

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TrackerTabBar {...props} />}
      screenOptions={{ headerShown: false }}
      backBehavior="firstRoute"
    >
      <Tabs.Screen name="workout" options={{ title: 'Workout' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop' }} />
      {/* Coach is hidden from the tab bar. While FEATURES.coach is off (lib/features.ts)
          the route itself sends members to the Workout tab. */}
      <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
    </Tabs>
  );
}
