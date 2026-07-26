/**
 * Shown when the app cannot read its own database at launch — Phase O2 (W1).
 *
 * The important thing this screen does is NOT be the welcome screen: falling back
 * to first-run over a device that already holds months of training would invite the
 * member to set up again, and setting up wipes. A retry is the only safe landing.
 */
import { Text, View } from 'react-native';

import { Card, Icon, PrimaryButton, Screen } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { useOnboarding } from '../store/onboardingStore';

export function BootErrorScreen() {
  const boot = useOnboarding((s) => s.boot);

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name="close" size={18} color={color.criticalText} />
          <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
            ForgeAI could not start
          </Text>
        </View>
        <Text
          style={{
            fontFamily: type.body,
            fontSize: type.size.sub,
            color: color.inkSecondary,
            lineHeight: 20,
            marginTop: space.sm,
          }}
        >
          Something went wrong opening your training data. Nothing has been changed or
          deleted — everything is still on this phone.
        </Text>
        <View style={{ marginTop: space.lg }}>
          <PrimaryButton label="Try again" icon="zap" onPress={() => void boot()} />
        </View>
        <Text
          style={{
            fontFamily: type.body,
            fontSize: type.size.caption,
            color: color.inkMuted,
            textAlign: 'center',
            marginTop: space.md,
          }}
        >
          If this keeps happening, close ForgeAI completely and open it again.
        </Text>
      </Card>
    </Screen>
  );
}
