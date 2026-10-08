/** Settings card: bring a Hevy export (.csv/.xlsx) or, since v0.27.0, a Strong export (.csv) into local history. */
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Card, GhostButton } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, space, type } from '@/theme/tokens';

export function ImportCard() {
  const router = useRouter();

  return (
    <Card>
      <GhostButton
        label="Import from Hevy"
        icon="calendar"
        onPress={() => {
          tap();
          router.push('/import');
        }}
      />
      <View style={{ height: space.sm }} />
      <GhostButton
        label="Import from Strong"
        icon="calendar"
        onPress={() => {
          tap();
          router.push({ pathname: '/import', params: { from: 'strong' } });
        }}
      />
      <Text
        style={{
          fontFamily: type.body,
          fontSize: type.size.caption,
          color: color.inkMuted,
          textAlign: 'center',
          marginTop: space.md,
          lineHeight: 15,
        }}
      >
        Bring your full Hevy or Strong workout history in: pick your exported file, preview, then import.
      </Text>
    </Card>
  );
}
