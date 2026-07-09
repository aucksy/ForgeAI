/** Per-exercise progress chart with a metric switcher (weight / volume / e1RM / best set). */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { LineChart } from '@/components/charts';
import { Card, Chip, SectionHeader } from '@/components/ui';
import { fmtCompact, kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { chart, motion, space } from '@/theme/tokens';
import type { BestSetPoint } from '@/tracker/services/exerciseAnalytics';
import type { ExerciseProgressPoint, UnitSystem } from '@/types/models';

type Metric = 'weight' | 'volume' | 'e1rm' | 'bestSet';

const METRICS: { key: Metric; label: string; color: string; compact: boolean }[] = [
  { key: 'weight', label: 'Weight', color: chart.series[0], compact: false },
  { key: 'volume', label: 'Volume', color: chart.series[2], compact: true },
  { key: 'e1rm', label: 'e1RM', color: chart.series[1], compact: false },
  { key: 'bestSet', label: 'Best set', color: chart.series[3], compact: true },
];

const noopInspect = () => {
  /* passing a handler enables the chart's press-drag crosshair */
};

export interface ExerciseMetricChartProps {
  progress: ExerciseProgressPoint[];
  bestSet: BestSetPoint[];
  units: UnitSystem;
}

export function ExerciseMetricChart({ progress, bestSet, units }: ExerciseMetricChartProps) {
  const [metric, setMetric] = useState<Metric>('weight');
  const unit = weightUnit(units);
  const active = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  const data = useMemo(() => {
    switch (metric) {
      case 'e1rm':
        return progress.map((p) => ({ x: p.dateISO, y: kgToDisplay(p.e1rmKg, units) }));
      case 'volume':
        return progress.map((p) => ({ x: p.dateISO, y: kgToDisplay(p.volumeKg, units) }));
      case 'bestSet':
        return bestSet.map((p) => ({ x: p.dateISO, y: kgToDisplay(p.bestSetVolumeKg, units) }));
      case 'weight':
      default:
        return progress.map((p) => ({ x: p.dateISO, y: kgToDisplay(p.topWeightKg, units) }));
    }
  }, [metric, progress, bestSet, units]);

  const yFormat = active.compact ? fmtCompact : trimNum;

  return (
    <Animated.View entering={FadeInDown.duration(motion.slow).delay(80)} style={{ marginTop: space.xl }}>
      <SectionHeader title={`${active.label} (${unit})`} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
        {METRICS.map((m) => (
          <Chip key={m.key} label={m.label} selected={metric === m.key} onPress={() => setMetric(m.key)} />
        ))}
      </View>
      <Card>
        <LineChart data={data} height={210} color={active.color} fillGradient yFormat={yFormat} onInspect={noopInspect} />
      </Card>
    </Animated.View>
  );
}
