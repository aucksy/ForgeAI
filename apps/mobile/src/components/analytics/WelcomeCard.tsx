import { Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, Icon, PrimaryButton } from '@/components/ui';
import { color, motion, space, type } from '@/theme/tokens';

/**
 * A new member's Progress (audit Phase 5, UX-3): one friendly card and the one action that
 * fills it — not nine empty boxes.
 */
export function WelcomeCard({ onStart }: { onStart: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(motion.slow)}>
      <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl }}>
        <Icon name="trend" size={28} color={color.accent} />
        <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink, textAlign: 'center' }}>
          Finish your first workout to see your progress
        </Text>
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, textAlign: 'center', lineHeight: 19 }}>
          Your lifts, records and the muscles you train show here.
        </Text>
        <PrimaryButton label="Start a workout" icon="dumbbell" onPress={onStart} />
      </Card>
    </Animated.View>
  );
}
