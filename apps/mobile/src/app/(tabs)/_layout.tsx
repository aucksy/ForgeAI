import { Tabs } from 'expo-router';

import { UpdatePrompt } from '@/components/UpdatePrompt';
import { WatchUpdatePrompt } from '@/components/WatchUpdatePrompt';
import { PlanNotice } from '@/plan/PlanNotice';
import { APP_TABS, HIDDEN_TAB_ROUTES } from '@/lib/appTabs';
import { TrackerTabBar } from '@/tracker/components/TrackerTabBar';

/**
 * Release A (docs/ux/MEMBER-APP-MAP.md §3.1) and F199 (R-403): 3 tabs, always the same 3 — Workout
 * (opens first) · Gym · Profile (lib/appTabs.ts). The Gym tab's route is still `shop`, so every older
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
        {/* Progress (F199: now inside Profile, its route redirects there) and Coach (while FEATURES.coach
            is off, lib/features.ts, its route sends members to the Workout tab) never show in the bar. */}
        {HIDDEN_TAB_ROUTES.map((r) => (
          <Tabs.Screen key={r} name={r} options={{ title: r === 'coach' ? 'Coach' : 'Progress' }} />
        ))}
      </Tabs>
      {/* R-260: "Update MettleUp" when a newer version exists (lib/updatePrompt.ts says when). */}
      <UpdatePrompt />
      {/* R-438: "Your watch app has an update" when the watch app is older (tracker/services/watchUpdateCard.ts says when). */}
      <WatchUpdatePrompt />
      {/* F56 (R-461): the free month's two one-time pop-ups (plan/PlanNotice.tsx says when). */}
      <PlanNotice />
    </>
  );
}
