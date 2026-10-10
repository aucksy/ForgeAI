/** Per-exercise progress chart with a metric switcher (weight / kg lifted / estimated 1-rep max / best set). */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, Chip, SectionHeader } from '@/components/ui';
import { fmtCompact, kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { liftedWords } from '@/lib/units';
import { chart, motion, space } from '@/theme/tokens';
import type { BestSetPoint } from '@/tracker/services/exerciseAnalytics';
import type { ExerciseProgressPoint, UnitSystem } from '@/types/models';

import { DateLineChart } from './DateLineChart';

type Metric = 'weight' | 'volume' | 'e1rm' | 'bestSet';

const METRICS: { key: Metric; label: string; color: string; compact: boolean }[] = [
  { key: 'weight', label: 'Weight', color: chart.series[0], compact: false },
  // Packet B (one word per idea): "Kg lifted" / "Lb lifted", never "Volume" (set per unit below).
  { key: 'volume', label: 'Kg lifted', color: chart.series[2], compact: true },
  { key: 'e1rm', label: 'Est. 1-rep max', color: chart.series[1], compact: false },
  { key: 'bestSet', label: 'Best set', color: chart.series[3], compact: true },
];

/** A metric's chip and heading words in the member's unit. */
function metricLabel(m: Metric, fallback: string, units: UnitSystem): string {
  return m === 'volume' ? liftedWords(units, true) : fallback;
}

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
      {/* "Kg lifted" already names its unit; the others say it in brackets. */}
      <SectionHeader title={active.key === 'volume' ? metricLabel('volume', active.label, units) : `${active.label} (${unit})`} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
        {METRICS.map((m) => (
          <Chip key={m.key} role="radio" label={metricLabel(m.key, m.label, units)} selected={metric === m.key} onPress={() => setMetric(m.key)} />
        ))}
      </View>
      <Card>
        <DateLineChart data={data} height={210} color={active.color} fillGradient yFormat={yFormat} onInspect={noopInspect} />
      </Card>
    </Animated.View>
  );
}
