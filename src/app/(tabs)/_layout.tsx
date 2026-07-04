import { Tabs } from 'expo-router';

import { TabBar } from '@/components/ui/TabBar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Progress' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
