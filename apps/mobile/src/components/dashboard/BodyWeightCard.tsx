import { Text, View } from 'react-native';

import { DeltaPill } from '@/components/charts';
import { AnimatedNumber, Card } from '@/components/ui';
import { kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { chart, color, space, type } from '@/theme/tokens';
import { DateSparkline } from '@/tracker/components/DateSparkline';
import { weightChange, weightChangeShown, weightChangeTone, weightSpanText } from '@/tracker/engine/headline';
import type { Goal, UnitSystem } from '@/types/models';

interface BodyWeightCardProps {
  weightKg: number;
  /** Last ~30 days of entries, asc. */
  trend: { dateISO: string; weightKg: number }[];
  unitSystem: UnitSystem;
  /** The member's goal: the change's colour follows it (PG-10). */
  goal?: Goal | null;
}

const CHART_W = 132;
const CHART_H = 48;
const LINE_COLOR = chart.series[1]; // blue — distinct identity from the ember volume bars

/**
 * Current body weight + 30-day sparkline and the change, by the one body-weight rule
 * (`engine/headline`): it always says over what span ("+1.2 kg in 30 days", PG-11) and its
 * colour follows the member's goal (PG-10).
 */
export function BodyWeightCard({ weightKg, trend, unitSystem, goal }: BodyWeightCardProps) {
  const unit = weightUnit(unitSystem);
  const change = weightChange(trend);

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
        {change ? (
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}
          >
            <DeltaPill
              value={weightChangeShown(change, unitSystem)}
              suffix={` ${unit}`}
              tone={weightChangeTone(change.changeKg, goal)}
            />
            <Text
              style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}
            >
              {weightSpanText(change)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ width: CHART_W, alignItems: 'flex-end' }}>
        <DateSparkline
          data={trend.map((t) => ({ x: t.dateISO, y: t.weightKg }))}
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
