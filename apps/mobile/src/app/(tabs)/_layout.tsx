import { Tabs } from 'expo-router';

import { UpdatePrompt } from '@/components/UpdatePrompt';
import { APP_TABS } from '@/lib/appTabs';
import { TrackerTabBar } from '@/tracker/components/TrackerTabBar';

/**
 * Release A (docs/ux/MEMBER-APP-MAP.md §3.1): 4 tabs, always the same 4 — Workout (opens first) ·
 * Progress · Gym · Profile (lib/appTabs.ts). The Gym tab's route is still `shop`, so every older
 * `/shop` link opens it. "/" sends to Workout (app/index.tsx); Settings is the Profile's gear.
 */
export const unstable_settings = { initialRouteName: 'workout' };

export default function TabsLayout() {
  return (
    <>
      <Tabs
        tabBar={(props) => <TrackerTabBar {...props} />}
        screenOptions={{ headerShown: false }}
        backBehavior="firstRoute"
      >
        {APP_TABS.map((t) => (
          <Tabs.Screen key={t.route} name={t.route} options={{ title: t.title }} />
        ))}
        {/* Coach is hidden from the tab bar. While FEATURES.coach is off (lib/features.ts)
            the route itself sends members to the Workout tab. */}
        <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
      </Tabs>
      {/* R-260: "Update MettleUp" when a newer version exists (lib/updatePrompt.ts says when). */}
      <UpdatePrompt />
    </>
  );
}
