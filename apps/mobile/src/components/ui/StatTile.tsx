import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { fmtInt, trimNum } from '@/lib/format';
import { color, motion, radius, shadow, space, type } from '@/theme/tokens';

import { deltaDirection, statLabel } from './a11y';
import { AnimatedNumber } from './AnimatedNumber';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { PressScale } from './PressScale';
import { useReduceMotion } from './useReduceMotion';

export interface StatTileProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: { value: string; good: boolean };
  icon?: IconName;
  onPress?: () => void;
}

const defaultFormat = (n: number) => (Math.abs(n) >= 1000 ? fmtInt(n) : trimNum(n));

/**
 * Compact dashboard stat: label + big numeral (+unit), optional delta + icon.
 *
 * Phase 7: a screen reader hears the tile as ONE line with its final number ("Kg lifted,
 * 12,400 kg, up 12 %"); the change carries an arrow, so it never relies on green/red alone,
 * and "Same" is grey; the number and unit wrap instead of running past the tile at large text.
 */
export function StatTile({ label, value, unit, delta, icon, onPress }: StatTileProps) {
  const reduced = useReduceMotion();
  const shown = typeof value === 'number' ? defaultFormat(value) : value;
  const spoken = statLabel({ label, value: shown, unit, delta: delta?.value });
  const dir = delta ? deltaDirection(delta.value) : 'same';
  const deltaColor = !delta || dir === 'same' ? color.inkSecondary : delta.good ? color.goodText : color.criticalText;

  const body = (
    <View
      accessible={onPress ? undefined : true}
      accessibilityLabel={onPress ? undefined : spoken}
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
          numberOfLines={2}
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
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          columnGap: space.xs,
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: space.xs }}>
          {dir === 'same' ? null : (
            <View style={{ transform: [{ rotate: dir === 'up' ? '-90deg' : '90deg' }] }}>
              <Icon name="chevron-right" size={12} color={deltaColor} />
            </View>
          )}
          <Text
            style={{
              fontFamily: type.bodySemi,
              fontSize: type.size.caption,
              color: deltaColor,
            }}
          >
            {delta.value}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <PressScale onPress={onPress} accessibilityLabel={spoken}>
        {body}
      </PressScale>
    );
  }
  return <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base)}>{body}</Animated.View>;
}
