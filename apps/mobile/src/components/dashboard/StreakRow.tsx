import { Text, View } from 'react-native';

import { AnimatedNumber, Badge, Card, Icon } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';
import { liftsUpShort } from '@/tracker/engine/headline';

interface StreakRowProps {
  /** THE streak (D9): weeks in a row with at least one workout. */
  streakWeeks: number;
  workoutsThisWeek: number;
  /** Lifts that beat a best this week (D10); null = unknown, 0 = none (no badge). */
  liftsUpThisWeek?: number | null;
}

/**
 * Flame + animated week streak ("5-week streak", the same number as Progress, History and
 * the year review), with this week's workouts and — when some lift beat its best this week
 * — "2 lifts up" on the right.
 */
export function StreakRow({ streakWeeks, workoutsThisWeek, liftsUpThisWeek }: StreakRowProps) {
  const lifts = liftsUpThisWeek ?? 0;
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

      <View
        style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end' }}
        accessible
        accessibilityLabel={`${streakWeeks}-week streak`}
      >
        <AnimatedNumber
          value={streakWeeks}
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
          -week streak
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: space.xs }}>
        <Badge
          label={`${workoutsThisWeek} this week`}
          tone={workoutsThisWeek > 0 ? 'accent' : 'neutral'}
        />
        {lifts > 0 ? <Badge label={liftsUpShort(lifts)} tone="accent" /> : null}
      </View>
    </Card>
  );
}
