/** Settings → What's new (R-56): this version's changes and every update before it, newest first. */
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
      <Card>
        {entries.length > 0 ? (
          <WhatsNewList entries={entries} />
        ) : (
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>Nothing new to show yet.</Text>
        )}
      </Card>
    </SettingsPage>
  );
}
