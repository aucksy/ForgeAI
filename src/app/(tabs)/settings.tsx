import { Text, View } from 'react-native';

import { color, type } from '@/theme/tokens';

/** Settings — placeholder, replaced by the settings module. */
export default function SettingsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: color.ink, fontFamily: type.heading, fontSize: type.size.h2 }}>
        Settings
      </Text>
    </View>
  );
}
