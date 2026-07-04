import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { color, type } from '@/theme/tokens';

/** Exercise detail — placeholder, replaced by the exercise-pages module. */
export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: color.ink, fontFamily: type.heading, fontSize: type.size.h2 }}>
        Exercise {id}
      </Text>
    </View>
  );
}
