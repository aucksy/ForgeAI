import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BarChart } from '@/components/charts';
import { Card, SectionHeader } from '@/components/ui';
import { fmtCompact, kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { chart, motion, space } from '@/theme/tokens';
import { DateLineChart } from '@/tracker/components/DateLineChart';
import type { ExerciseProgressPoint, UnitSystem } from '@/types/models';

export interface ExerciseChartsProps {
  progress: ExerciseProgressPoint[];
  units: UnitSystem;
}

const noopInspect = () => {
  /* passing a handler enables the chart's press-drag crosshair */
};

/**
 * The three progress sections: top-set weight line (ember), e1RM line (blue,
 * its own card — never dual-axis) and session-volume bars.
 */
export function ExerciseCharts({ progress, units }: ExerciseChartsProps) {
  const unit = weightUnit(units);

  const weightData = useMemo(
    () => progress.map((p) => ({ x: p.dateISO, y: kgToDisplay(p.topWeightKg, units) })),
    [progress, units],
  );
  const e1rmData = useMemo(
    () => progress.map((p) => ({ x: p.dateISO, y: kgToDisplay(p.e1rmKg, units) })),
    [progress, units],
  );
  const volumeData = useMemo(
    () => progress.map((p) => ({ x: p.dateISO, y: kgToDisplay(p.volumeKg, units) })),
    [progress, units],
  );

  const fmtW = (n: number) => trimNum(n);
  const labelEvery = Math.max(1, Math.ceil(volumeData.length / 5));

  return (
    <View>
      <Animated.View
        entering={FadeInDown.duration(motion.slow).delay(80)}
        style={{ marginTop: space.xl }}
      >
        <SectionHeader title={`Heaviest weight (${unit})`} />
        <Card>
          <DateLineChart
            data={weightData}
            height={200}
            fillGradient
            yFormat={fmtW}
            onInspect={noopInspect}
          />
        </Card>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(motion.slow).delay(160)}
        style={{ marginTop: space.xl }}
      >
        <SectionHeader title={`Estimated 1-rep max (${unit})`} />
        <Card>
          <DateLineChart
            data={e1rmData}
            height={200}
            color={chart.series[1]}
            fillGradient
            yFormat={fmtW}
            onInspect={noopInspect}
          />
        </Card>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(motion.slow).delay(240)}
        style={{ marginTop: space.xl }}
      >
        <SectionHeader title={`${unit === 'lb' ? 'Lb' : 'Kg'} lifted per workout`} />
        <Card>
          <BarChart
            data={volumeData}
            height={190}
            yFormat={fmtCompact}
            labelEvery={labelEvery}
            highlightLast
          />
        </Card>
      </Animated.View>
    </View>
  );
}
