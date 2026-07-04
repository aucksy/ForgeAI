import { Text, View } from 'react-native';

import { color, type } from '@/theme/tokens';

/** AI Coach chat — placeholder, replaced by the chat module. */
export default function CoachScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: color.ink, fontFamily: type.heading, fontSize: type.size.h2 }}>
        Coach
      </Text>
    </View>
  );
}
