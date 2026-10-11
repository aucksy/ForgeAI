/**
 * Redesign R6: one page of Settings (Hevy's list of pages). The back arrow goes back to Settings
 * — or, opened cold with nothing behind it, to Settings itself.
 */
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { space } from '@/theme/tokens';

export function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Screen title={title} onBack={() => goBack(router, '/settings')}>
      <View style={{ gap: space.md }}>{children}</View>
    </Screen>
  );
}
