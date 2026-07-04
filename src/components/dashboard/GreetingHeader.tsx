import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Logo } from '@/components/ui/Logo';
import { shortDate, todayISO } from '@/lib/date';
import { color, motion, type } from '@/theme/tokens';

interface GreetingHeaderProps {
  /** First name of the member; null while the profile is loading. */
  name: string | null;
}

function greetingForHour(hour: number): string {
  if (hour < 5) return 'Burning the midnight oil';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Top-of-dashboard greeting: date overline + local-hour greeting, Logo mark right. */
export function GreetingHeader({ name }: GreetingHeaderProps) {
  const greeting = greetingForHour(new Date().getHours());
  const line = name ? `${greeting}, ${name}` : greeting;

  return (
    <Animated.View
      entering={FadeInDown.duration(motion.slow)}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 2,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text
          style={{
            fontFamily: type.bodySemi,
            fontSize: type.size.caption,
            color: color.inkMuted,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
        >
          {shortDate(todayISO())}
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
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
      <View style={{ marginBottom: 4 }}>
        <Logo height={20} />
      </View>
    </Animated.View>
  );
}
