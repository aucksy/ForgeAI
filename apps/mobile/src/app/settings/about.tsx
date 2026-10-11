/** Settings → About (redesign R6): credits and the app's version. */
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { SettingRow } from '@/components/settings/SettingRow';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { versionLine } from '@/components/settings/settingsLines';
import { Card, Icon } from '@/components/ui';
import { color, space } from '@/theme/tokens';

export default function AboutPage() {
  const router = useRouter();
  const version = versionLine(Constants.expoConfig?.version);
  return (
    <SettingsPage title="About">
      <Card style={{ paddingVertical: space.xs }}>
        <Pressable onPress={() => router.push('/credits')} accessibilityRole="button" accessibilityLabel="Credits" style={{ minHeight: 48 }}>
          <SettingRow title="Credits" right={<Icon name="chevron-right" size={16} color={color.inkMuted} />} />
        </Pressable>
        {version ? <SettingRow title="ForgeAI" caption={version} divider /> : null}
      </Card>
    </SettingsPage>
  );
}
