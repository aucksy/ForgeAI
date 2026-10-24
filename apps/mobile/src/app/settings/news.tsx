/** Settings → What's new (R-56; R-98, 24 Oct 2026: the last 3 updates, each change with a button to try it). */
import Constants from 'expo-constants';
import { Text } from 'react-native';

import { SettingsPage } from '@/components/settings/SettingsPage';
import { WhatsNewList } from '@/components/WhatsNewList';
import { Card } from '@/components/ui';
import { updatesUpTo } from '@/lib/whatsNew';
import { color, type } from '@/theme/tokens';

export default function WhatsNewPage() {
  const entries = updatesUpTo(Constants.expoConfig?.version);
  return (
    <SettingsPage title="What's new">
      <Text
        style={{
          fontFamily: type.body,
          fontSize: type.size.sub,
          color: color.inkSecondary,
        }}
      >
        What changed in the last 3 updates. Tap a button to try a change.
      </Text>
      <Card>
        {entries.length > 0 ? (
          <WhatsNewList entries={entries} here="/settings/news" />
        ) : (
          <Text
            style={{
              fontFamily: type.body,
              fontSize: type.size.sub,
              color: color.inkSecondary,
            }}
          >
            Nothing new to show yet.
          </Text>
        )}
      </Card>
    </SettingsPage>
  );
}
