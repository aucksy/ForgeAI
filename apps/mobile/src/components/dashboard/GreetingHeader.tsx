import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { shortDate, todayISO } from '@/lib/date';
import { color, motion, type } from '@/theme/tokens';

interface GreetingHeaderProps {
  /** First name of the member; null while the profile is loading. */
  name: string | null;
}

/** Plain greetings only (audit R4: no "Burning the midnight oil"). Exported for tests. */
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Top of Home: the date ("Fri, 9 Oct", as every heading writes it) and a plain greeting. Audit
 * Phase 7 (V3): the logo is gone, so the greeting has the full width and wraps to two lines
 * rather than shrinking.
 */
export function GreetingHeader({ name }: GreetingHeaderProps) {
  const greeting = greetingForHour(new Date().getHours());
  const line = name ? `${greeting}, ${name}` : greeting;

  return (
    <Animated.View
      entering={FadeInDown.duration(motion.slow)}
      style={{
        marginBottom: 2,
      }}
    >
      <View>
        <Text
          style={{
            fontFamily: type.bodySemi,
            fontSize: type.size.sub,
            color: color.inkMuted,
          }}
        >
          {shortDate(todayISO())}
        </Text>
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          style={{
            fontFamily: type.display,
            fontSize: type.size.h1,
            color: color.ink,
            letterSpacing: -0.5,
            marginTop: 4,
          }}
        >
          {line}
        </Text>
      </View>
    </Animated.View>
  );
}
