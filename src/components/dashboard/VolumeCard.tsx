import { Text, View } from 'react-native';

import { DeltaPill, MiniBars } from '@/components/charts';
import { AnimatedNumber, Card, Skeleton } from '@/components/ui';
import { fmtCompact, kgToDisplay, weightUnit } from '@/lib/format';
import { color, space, type } from '@/theme/tokens';
import type { UnitSystem } from '@/types/models';

interface VolumeCardProps {
  volumeKg: number;
  deltaPct: number;
  /** Weekly totals (kg) for the trailing 8 weeks, asc; null while loading. */
  series: number[] | null;
  unitSystem: UnitSystem;
}

const CHART_W = 132;
const CHART_H = 48;

/** Weekly training volume: big compact number + delta pill + 8-week mini bars. */
export function VolumeCard({ volumeKg, deltaPct, series, unitSystem }: VolumeCardProps) {
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}
        >
          Weekly volume
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
            value={volumeKg}
            format={(n) => fmtCompact(kgToDisplay(n, unitSystem))}
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
            {weightUnit(unitSystem)}
          </Text>
        </View>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}
        >
          <DeltaPill value={deltaPct} />
          <Text
            style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}
          >
            vs last week
          </Text>
        </View>
      </View>

      <View style={{ width: CHART_W, alignItems: 'flex-end' }}>
        {series ? (
          <MiniBars data={series} width={CHART_W} height={CHART_H} />
        ) : (
          <Skeleton width={CHART_W} height={CHART_H} />
        )}
        <Text
          style={{
            fontFamily: type.bodyMedium,
            fontSize: type.size.caption,
            color: color.inkMuted,
            marginTop: space.xs,
          }}
        >
          last 8 weeks
        </Text>
      </View>
    </Card>
  );
}
