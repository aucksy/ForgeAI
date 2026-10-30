/** Settings → About (redesign R6): credits and the app's version. */
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Linking, Pressable } from 'react-native';

import { SettingRow } from '@/components/settings/SettingRow';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { versionLine } from '@/components/settings/settingsLines';
import { Card, Icon } from '@/components/ui';
import { REPDB_CREDIT, REPDB_URL } from '@/lib/credits';
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
        {/* F20: the RepDB licence asks for this visible link, in its own words (lib/credits.ts) */}
        <Pressable
          onPress={() => void Linking.openURL(REPDB_URL).catch((e: unknown) => console.warn('[about] could not open the exercise database page', e))}
          accessibilityRole="link"
          accessibilityLabel={REPDB_CREDIT}
          style={{ minHeight: 48 }}
        >
          <SettingRow title={REPDB_CREDIT} right={<Icon name="chevron-right" size={16} color={color.inkMuted} />} divider />
        </Pressable>
        {version ? <SettingRow title="MettleUp" caption={version} divider /> : null}
      </Card>
    </SettingsPage>
  );
}
