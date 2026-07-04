import { Text, View } from 'react-native';

import { RingGauge } from '@/components/ui';
import { clamp, fmtInt } from '@/lib/format';
import { chart, color, radius, space, type } from '@/theme/tokens';

import type { NutritionSummaryView } from '../payload';
import { CardShell, Divider } from './CardShell';

function MacroBar({
  label,
  value,
  max,
  fill,
}: {
  label: string;
  value: number;
  max: number;
  fill: string;
}) {
  const pct = max > 0 ? clamp(value / max, 0, 1) : 0;
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text
          style={{
            fontFamily: type.bodyMedium,
            fontSize: type.size.caption,
            color: color.inkSecondary,
          }}
        >
          {label}
        </Text>
        <Text
          style={{ fontFamily: type.mono, fontSize: type.size.caption, color: color.inkMuted }}
        >
          {`${Math.round(value)} / ${Math.round(max)} g`}
        </Text>
      </View>
      <View
        style={{
          height: 7,
          borderRadius: radius.pill,
          backgroundColor: color.surfaceSunken,
          overflow: 'hidden',
          flexDirection: 'row',
        }}
      >
        {pct > 0 ? (
          <View style={{ flex: pct, backgroundColor: fill, borderRadius: radius.pill }} />
        ) : null}
        <View style={{ flex: 1 - pct }} />
      </View>
    </View>
  );
}

/** Day nutrition card: kcal + protein rings, carb/fat bars, remaining line. */
export function NutritionSummaryCard({ data }: { data: NutritionSummaryView }) {
  const { day, targets, remaining } = data;
  return (
    <CardShell
      icon="flame"
      title="Nutrition today"
      subtitle={`${fmtInt(day.calories)} of ${fmtInt(targets.calories)} kcal`}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-evenly',
          marginTop: space.lg,
        }}
      >
        <RingGauge
          value={day.calories}
          max={targets.calories}
          size={104}
          label={fmtInt(day.calories)}
          sublabel={`/ ${fmtInt(targets.calories)} kcal`}
          color={color.accent}
        />
        <RingGauge
          value={day.proteinG}
          max={targets.proteinG}
          size={104}
          label={`${Math.round(day.proteinG)}g`}
          sublabel={`/ ${Math.round(targets.proteinG)}g protein`}
          color={chart.series[2]}
        />
      </View>

      <View style={{ marginTop: space.lg, gap: space.md }}>
        <MacroBar label="Carbs" value={day.carbsG} max={targets.carbsG} fill={chart.series[1]} />
        <MacroBar label="Fat" value={day.fatG} max={targets.fatG} fill={chart.series[3]} />
      </View>

      <Divider mt={space.lg} mb={space.sm} />
      <Text
        style={{
          fontFamily: type.bodyMedium,
          fontSize: type.size.sub,
          color: color.inkSecondary,
          lineHeight: 18,
        }}
      >
        {remaining.calories > 0
          ? `${fmtInt(remaining.calories)} kcal · ${Math.round(remaining.proteinG)} g protein still to go today.`
          : 'Daily calorie target hit — nice work.'}
      </Text>
    </CardShell>
  );
}
