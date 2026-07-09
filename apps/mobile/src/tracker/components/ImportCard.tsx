/** Settings card: migrate a Hevy export (.csv/.xlsx) into local history. */
import { useRouter } from 'expo-router';
import { Text } from 'react-native';

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
        Bring your full Hevy workout history in — pick your exported file, preview, then import.
      </Text>
    </Card>
  );
}
