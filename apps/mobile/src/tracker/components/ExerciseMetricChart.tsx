/**
 * The exercise page's Summary chart, as Hevy's (redesign R5): the latest number (or the point
 * under a finger) big at the top, the chart, then the chips for what it shows — the right ones
 * for how the exercise is logged (`exerciseChart.chartMetrics`) — and the range: 3 months · Year ·
 * All time. It opens on 3 months, or the smallest range with something in it.
 */
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ChoiceRow } from '@/components/stats/parts';
import { Card } from '@/components/ui';
import { tinyDateWithYear, todayISO } from '@/lib/date';
import { fmtCompact, trimNum } from '@/lib/format';
import { chart, color, motion, space, type } from '@/theme/tokens';
import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';
import type { DistUnit, LogType } from '@/tracker/engine/logTypes';
import { fmtDuration } from '@/tracker/engine/logTypes';
import type { BestSetPoint } from '@/tracker/services/exerciseAnalytics';
import {
  CHART_RANGES,
  chartMetrics,
  metricLabel,
  metricSeries,
  metricUnit,
  metricValueText,
  openingRange,
  pointsInRange,
  type ChartMetric,
  type ChartRange,
} from '@/tracker/services/exerciseChart';
import type { UnitSystem } from '@/types/models';

import { DateLineChart } from './DateLineChart';

export interface ExerciseMetricChartProps {
  /** Newest first, volume by the one rule (the page's history). */
  history: ExerciseHistoryEntry[];
  bestSet: BestSetPoint[];
  /** How the numbers read (`ExerciseOverview.shownAs`). */
  shownAs: LogType;
  /** A timed exercise that is cardio (a stair climber): "Longest time", not "Best time". */
  cardio?: boolean;
  units: UnitSystem;
  distUnit: DistUnit;
}

export function ExerciseMetricChart({ history, bestSet, shownAs, cardio = false, units, distUnit }: ExerciseMetricChartProps) {
  const metrics = useMemo(() => chartMetrics(shownAs), [shownAs]);
  const [picked, setPicked] = useState<ChartMetric>(metrics[0]);
  const metric = metrics.includes(picked) ? picked : metrics[0];
  const today = todayISO();
  const [range, setRange] = useState<ChartRange>(() => openingRange(history.map((h) => h.dateISO), today));
  const [inspect, setInspect] = useState<{ x: string; y: number } | null>(null);

  const all = useMemo(() => metricSeries(metric, history, bestSet, units, distUnit), [metric, history, bestSet, units, distUnit]);
  const data = useMemo(() => pointsInRange(all, range, today), [all, range, today]);
  const shown = inspect ?? data[data.length - 1] ?? null;
  const unit = metricUnit(metric);
  const yFormat = (n: number): string => (unit === 'seconds' ? fmtDuration(n) : unit === 'weight' && n >= 10_000 ? fmtCompact(n) : trimNum(n));

  return (
    <Animated.View entering={FadeInDown.duration(motion.slow).delay(80)} style={{ gap: space.md }}>
      <Card>
        <View accessible accessibilityLabel={shown ? `${metricLabel(metric, units, { shownAs, cardio })}: ${metricValueText(metric, shown.y, units, distUnit)}, ${tinyDateWithYear(shown.x)}` : undefined} style={{ marginBottom: space.sm }}>
          <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h2, color: color.ink }}>
            {shown ? metricValueText(metric, shown.y, units, distUnit) : '—'}
          </Text>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
            {shown ? `${metricLabel(metric, units, { shownAs, cardio })} · ${tinyDateWithYear(shown.x)}` : 'Nothing in this range yet'}
          </Text>
        </View>
        {data.length > 0 ? (
          <DateLineChart data={data} height={200} color={chart.series[0]} fillGradient yFormat={yFormat} onInspect={setInspect} />
        ) : null}
      </Card>
      <ChoiceRow
        label="What the chart shows"
        options={metrics.map((m) => ({ id: m, label: metricLabel(m, units, { shownAs, cardio }) }))}
        value={metric}
        onChange={(m) => {
          setInspect(null);
          setPicked(m);
        }}
      />
      <ChoiceRow
        label="Range"
        options={CHART_RANGES}
        value={range}
        onChange={(r) => {
          setInspect(null);
          setRange(r);
        }}
      />
    </Animated.View>
  );
}
