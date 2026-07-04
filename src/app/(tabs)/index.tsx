import { Text, View } from 'react-native';

import { color, type } from '@/theme/tokens';

/** Dashboard — placeholder, replaced by the dashboard module. */
export default function DashboardScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: color.ink, fontFamily: type.heading, fontSize: type.size.h2 }}>
        Dashboard
      </Text>
    </View>
  );
}
