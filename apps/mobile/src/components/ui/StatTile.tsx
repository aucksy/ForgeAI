import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { fmtInt, trimNum } from '@/lib/format';
import { color, motion, radius, shadow, space, type } from '@/theme/tokens';

import { AnimatedNumber } from './AnimatedNumber';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { PressScale } from './PressScale';

export interface StatTileProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: { value: string; good: boolean };
  icon?: IconName;
  onPress?: () => void;
}

const defaultFormat = (n: number) => (Math.abs(n) >= 1000 ? fmtInt(n) : trimNum(n));

/** Compact dashboard stat: label + big numeral (+unit), optional delta + icon. */
export function StatTile({ label, value, unit, delta, icon, onPress }: StatTileProps) {
  const body = (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.border,
        padding: space.lg,
        alignSelf: 'stretch',
        ...shadow.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: type.bodyMedium,
            fontSize: type.size.sub,
            color: color.inkSecondary,
            flex: 1,
            paddingRight: icon ? space.xs : 0,
          }}
        >
          {label}
        </Text>
        {icon ? (
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: color.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={icon} size={14} color={color.accent} />
          </View>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: space.xs,
          marginTop: space.sm,
        }}
      >
        {typeof value === 'number' ? (
          <AnimatedNumber value={value} format={defaultFormat} />
        ) : (
          <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h2, color: color.ink }}>
            {value}
          </Text>
        )}
        {unit ? (
          <Text
            style={{
              fontFamily: type.mono,
              fontSize: type.size.sub,
              color: color.inkMuted,
              marginBottom: 3,
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>

      {delta ? (
        <Text
          style={{
            fontFamily: type.bodySemi,
            fontSize: type.size.caption,
            color: delta.good ? color.goodText : color.criticalText,
            marginTop: space.xs,
          }}
        >
          {delta.value}
        </Text>
      ) : null}
    </View>
  );

  if (onPress) {
    return <PressScale onPress={onPress}>{body}</PressScale>;
  }
  return <Animated.View entering={FadeInDown.duration(motion.base)}>{body}</Animated.View>;
}
