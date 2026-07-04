import { Text, View } from 'react-native';

import { AnimatedNumber, Badge, Card, Icon } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

interface StreakRowProps {
  streakDays: number;
  workoutsThisWeek: number;
}

/** Flame + animated streak counter, with a this-week badge on the right. */
export function StreakRow({ streakDays, workoutsThisWeek }: StreakRowProps) {
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: color.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="flame" size={22} color={color.accent} />
      </View>

      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: space.xs }}>
        <AnimatedNumber
          value={streakDays}
          style={{ fontFamily: type.monoBold, fontSize: type.size.h1, color: color.ink }}
        />
        <Text
          style={{
            fontFamily: type.bodyMedium,
            fontSize: type.size.sub,
            color: color.inkSecondary,
            marginBottom: 5,
          }}
        >
          day streak
        </Text>
      </View>

      <Badge
        label={`${workoutsThisWeek} this week`}
        tone={workoutsThisWeek > 0 ? 'accent' : 'neutral'}
      />
    </Card>
  );
}
