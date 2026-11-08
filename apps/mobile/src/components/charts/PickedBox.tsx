/**
 * The box over a chart's picked point or bar (R-311 / R-404). One look for every chart (owner rule,
 * 8 Nov 2026: "every chart behaves the same"): the number, the day or period under it, and, when the
 * point opens something, a "›" and a 44 dp tall button (`chart-open-workout`). Without `onOpen` it is
 * only a label (`chart-picked`), as the Profile chart's empty week. Used by DateLineChart and BarChart.
 *
 * `onPressIn` / `onPressOut` tell the chart the finger went down on the box (R-397), so the chart does
 * not take the touch away from the box when the finger moves a few pixels in a real tap.
 */
import { useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';

import { Icon } from '@/components/ui';
import { clamp } from '@/lib/format';
import { color as palette, radius, type } from '@/theme/tokens';

export function PickedBox({
  x,
  chartW,
  value,
  date,
  onOpen,
  openLabel,
  onPressIn,
  onPressOut,
}: {
  /** The picked point's (or bar's middle) x in the chart. */
  x: number;
  /** The chart's width, so the box never leaves it. */
  chartW: number;
  value: string;
  date: string;
  /** Makes the box a button that opens what is behind the point. Absent = only a label. */
  onOpen?: () => void;
  /** What a screen reader says for the button. */
  openLabel?: string;
  onPressIn?: () => void;
  onPressOut?: () => void;
}) {
  // The label's own width, so it centres on the point and never leaves the chart.
  const [tipW, setTipW] = useState(98);
  if (onOpen) {
    return (
      // R-311: the label stays and is a button: it opens the workout(s) behind the point.
      <Pressable
        testID="chart-open-workout"
        onLayout={(e) => setTipW(e.nativeEvent.layout.width)}
        onPress={onOpen}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={openLabel ?? `Open the workout from ${date}. ${value}`} // member-words
        hitSlop={6}
        style={({ pressed }) => ({
          position: 'absolute',
          top: 0,
          left: clamp(x - tipW / 2, 2, Math.max(2, chartW - tipW - 2)),
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: palette.surfaceRaised,
          borderWidth: 1,
          borderColor: palette.accent,
          borderRadius: radius.sm,
          paddingLeft: 10,
          paddingRight: 6,
          paddingVertical: 4,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View style={{ alignItems: 'flex-start' }}>
          <RNText style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: palette.ink }}>{value}</RNText>
          <RNText style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: palette.inkMuted }}>{date}</RNText>
        </View>
        <Icon name="chevron-right" size={18} color={palette.accent} />
      </Pressable>
    );
  }
  return (
    <View
      testID="chart-picked"
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: clamp(x - 48, 2, Math.max(2, chartW - 98)),
        backgroundColor: palette.surfaceRaised,
        borderWidth: 1,
        borderColor: palette.borderStrong,
        borderRadius: radius.sm,
        paddingHorizontal: 9,
        paddingVertical: 5,
        alignItems: 'center',
        minWidth: 72,
      }}
    >
      <RNText style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: palette.ink }}>{value}</RNText>
      <RNText style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: palette.inkMuted }}>{date}</RNText>
    </View>
  );
}
