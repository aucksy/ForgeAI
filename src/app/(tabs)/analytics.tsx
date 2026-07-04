import { Text, View } from 'react-native';

import { color, type } from '@/theme/tokens';

/** Analytics — placeholder, replaced by the analytics module. */
export default function AnalyticsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: color.ink, fontFamily: type.heading, fontSize: type.size.h2 }}>
        Progress
      </Text>
    </View>
  );
}
