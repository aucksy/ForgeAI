import { Text, View } from 'react-native';

import { Card, Icon } from '@/components/ui';
import { relativeDay } from '@/lib/date';
import { color, space, type } from '@/theme/tokens';
import type { DashboardData } from '@/types/models';

import { Tappable } from './Tappable';

interface NextUpRowProps {
  lastWorkout: DashboardData['lastWorkout'];
  nextName: string;
  onPress: () => void;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Last-session recap on the left, next planned workout on the right. */
export function NextUpRow({ lastWorkout, nextName, onPress }: NextUpRowProps) {
  return (
    <Tappable onPress={onPress} accessibilityLabel={`Next up: ${nextName}`}>
      <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, paddingRight: space.md }}>
          <Text
            style={{
              fontFamily: type.bodySemi,
              fontSize: type.size.caption,
              color: color.inkMuted,
              letterSpacing: 1.2,
            }}
          >
            LAST SESSION
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: type.bodyMedium,
              fontSize: type.size.body,
              color: color.inkSecondary,
              marginTop: space.xs,
            }}
          >
            {lastWorkout
              ? `${relativeDay(lastWorkout.dateISO)} · ${capitalize(lastWorkout.dayType)}`
              : 'No sessions yet'}
          </Text>
        </View>

        <View
          style={{
            width: 1,
            alignSelf: 'stretch',
            backgroundColor: color.border,
            marginRight: space.lg,
          }}
        />

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: type.bodySemi,
              fontSize: type.size.caption,
              color: color.inkMuted,
              letterSpacing: 1.2,
            }}
          >
            NEXT UP
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.xs }}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontFamily: type.bodySemi,
                fontSize: type.size.body,
                color: color.ink,
              }}
            >
              {nextName}
            </Text>
            <Icon name="chevron-right" size={16} color={color.accent} />
          </View>
        </View>
      </Card>
    </Tappable>
  );
}
