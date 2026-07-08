import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, Skeleton } from '@/components/ui';
import { color, motion, space, type } from '@/theme/tokens';

export interface SectionProps {
  title: string;
  /** Right slot of the header row (inspect readout / mini stat). */
  right?: ReactNode;
  /** Stagger position for the entrance animation. */
  index: number;
  /** Muted caption rendered under the card. */
  caption?: string;
  children?: ReactNode;
}

/**
 * Analytics section shell: header row (title + right slot) above a Card,
 * staggered FadeInDown entrance. The right slot doubles as the crosshair
 * inspect readout for chart sections.
 */
export function Section({ title, right, index, caption, children }: SectionProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(60 * Math.min(index, 8)).duration(motion.slow)}
      style={{ marginBottom: space.xxl }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: space.md,
          minHeight: 30,
        }}
      >
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          {title}
        </Text>
        {right}
      </View>
      <Card>{children}</Card>
      {caption ? (
        <Text
          style={{
            fontFamily: type.body,
            fontSize: type.size.caption,
            color: color.inkMuted,
            marginTop: space.sm,
            marginLeft: space.xs,
          }}
        >
          {caption}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/** Crosshair readout for the section-header right slot: value over date. */
export function InspectReadout({ value, sub }: { value: string; sub: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text
        style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: color.accentBright }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: type.bodyMedium,
          fontSize: 10,
          color: color.inkMuted,
          marginTop: 1,
        }}
      >
        {sub}
      </Text>
    </View>
  );
}

/** Quiet mono mini-stat for the header right slot when nothing is inspected. */
export function HeaderStat({ text }: { text: string }) {
  return (
    <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkSecondary }}>
      {text}
    </Text>
  );
}

/** Shimmer stand-in for a whole section while the bundle loads. */
export function SectionSkeleton({ index }: { index: number }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(60 * Math.min(index, 8)).duration(motion.slow)}
      style={{ marginBottom: space.xxl }}
    >
      <Skeleton width={150} height={16} radius={6} />
      <View style={{ height: space.md }} />
      <Card>
        <Skeleton width="100%" height={170} radius={12} />
      </Card>
    </Animated.View>
  );
}
