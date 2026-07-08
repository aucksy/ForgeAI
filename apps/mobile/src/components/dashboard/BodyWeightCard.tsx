import { Text, View } from 'react-native';

import { DeltaPill, Sparkline } from '@/components/charts';
import { AnimatedNumber, Card } from '@/components/ui';
import { kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { chart, color, space, type } from '@/theme/tokens';
import type { UnitSystem } from '@/types/models';

interface BodyWeightCardProps {
  weightKg: number;
  /** Last ~30 days of entries, asc. */
  trend: { dateISO: string; weightKg: number }[];
  unitSystem: UnitSystem;
}

const CHART_W = 132;
const CHART_H = 48;
const LINE_COLOR = chart.series[1]; // blue — distinct identity from the ember volume bars

/** Current body weight + 30-day sparkline and signed trend delta. */
export function BodyWeightCard({ weightKg, trend, unitSystem }: BodyWeightCardProps) {
  const unit = weightUnit(unitSystem);
  const deltaKg = trend.length > 1 ? weightKg - trend[0].weightKg : 0;
  const deltaDisplay = Math.round(kgToDisplay(deltaKg, unitSystem) * 10) / 10;

  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}
        >
          Body weight
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: space.xs,
            marginTop: space.sm,
          }}
        >
          <AnimatedNumber
            key={unitSystem} // remount on unit switch — format-only changes don't re-render
            value={weightKg}
            format={(n) => trimNum(kgToDisplay(n, unitSystem))}
            style={{ fontFamily: type.monoBold, fontSize: type.size.h2, color: color.ink }}
          />
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
        </View>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}
        >
          <DeltaPill value={deltaDisplay} suffix={` ${unit}`} />
          <Text
            style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}
          >
            in 30 days
          </Text>
        </View>
      </View>

      <View style={{ width: CHART_W, alignItems: 'flex-end' }}>
        <Sparkline
          data={trend.map((t) => t.weightKg)}
          width={CHART_W}
          height={CHART_H}
          color={LINE_COLOR}
        />
        <Text
          style={{
            fontFamily: type.bodyMedium,
            fontSize: type.size.caption,
            color: color.inkMuted,
            marginTop: space.xs,
          }}
        >
          30-day trend
        </Text>
      </View>
    </Card>
  );
}
