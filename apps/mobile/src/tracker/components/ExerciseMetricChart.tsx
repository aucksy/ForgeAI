/**
 * The exercise page's Summary chart, as Hevy's (redesign R5): what it shows as ONE control
 * ("Heaviest weight ⌄", which opens a sheet of the choices for how the exercise is logged —
 * `exerciseChart.chartMetrics`), the latest number (or the point under a finger) big with its
 * day, the chart, then the range as a segmented control: 3 months · Year · All time. It opens on
 * 3 months, or the smallest range with something in it.
 *
 * 12 Oct 2026 design pass (owner's emulator): the five choices were chips that wrapped 2 + 2 + 1
 * and left "Total reps" alone on a row, and the range chips looked exactly like them. One point
 * per day now (`bestPerDay`): two workouts on one day drew a cliff straight down.
 */
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card } from '@/components/ui';
import { tinyDateWithYear, todayISO } from '@/lib/date';
import { fmtCompact, trimNum } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { chart, color, motion, space, type } from '@/theme/tokens';
import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';
import type { DistUnit, LogType } from '@/tracker/engine/logTypes';
import { fmtDuration } from '@/tracker/engine/logTypes';
import type { BestSetPoint } from '@/tracker/services/exerciseAnalytics';
import {
  bestPerDay,
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
import { SegmentedControl } from './SegmentedControl';
import { Glyph } from './TrackerGlyph';
import { SheetRow, TrackerSheet } from './TrackerSheet';

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
  const [picking, setPicking] = useState(false);

  const all = useMemo(() => bestPerDay(metric, metricSeries(metric, history, bestSet, units, distUnit)), [metric, history, bestSet, units, distUnit]);
  const data = useMemo(() => pointsInRange(all, range, today), [all, range, today]);
  const shown = inspect ?? data[data.length - 1] ?? null;
  const unit = metricUnit(metric);
  const yFormat = (n: number): string => (unit === 'seconds' ? fmtDuration(n) : unit === 'weight' && n >= 10_000 ? fmtCompact(n) : trimNum(n));

  const words = (m: ChartMetric): string => metricLabel(m, units, { shownAs, cardio });
  const shownLabel = words(metric);

  return (
    <Animated.View entering={FadeInDown.duration(motion.slow).delay(80)} style={{ gap: space.md }}>
      <Card>
        {/* What the chart shows: one control, the choices in a sheet (Hevy's dropdown). */}
        {metrics.length > 1 ? (
          <Pressable
            onPress={() => {
              tap();
              setPicking(true);
            }}
            // The words alone, so a test or a screen reader finds "Heaviest weight" as it reads.
            accessibilityRole="button"
            accessibilityLabel={shownLabel}
            accessibilityHint="Changes what the chart shows"
            hitSlop={4}
            style={({ pressed }) => ({ alignSelf: 'flex-start', maxWidth: '100%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.7 : 1 })}
          >
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ flexShrink: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.accent }}>
              {shownLabel}
            </Text>
            <Glyph name="chevron-down" size={18} color={color.accent} />
          </Pressable>
        ) : (
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.inkSecondary, marginBottom: space.xs }}>{shownLabel}</Text>
        )}
        <View accessible accessibilityLabel={shown ? `${shownLabel}: ${metricValueText(metric, shown.y, units, distUnit)}, ${tinyDateWithYear(shown.x)}` : undefined} style={{ marginBottom: space.sm }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: type.monoBold, fontSize: type.size.h2, color: color.ink }}>
            {shown ? metricValueText(metric, shown.y, units, distUnit) : '—'}
          </Text>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
            {shown ? tinyDateWithYear(shown.x) : 'Nothing in this range yet'}
          </Text>
        </View>
        {data.length > 0 ? (
          <DateLineChart data={data} height={200} color={chart.series[0]} fillGradient yFormat={yFormat} onInspect={setInspect} />
        ) : null}
      </Card>
      <SegmentedControl
        label="Range"
        options={CHART_RANGES}
        value={range}
        onChange={(r) => {
          setInspect(null);
          setRange(r);
        }}
      />
      <TrackerSheet visible={picking} title="Chart shows" onClose={() => setPicking(false)}>
        <View style={{ gap: 2 }}>
          {metrics.map((m) => (
            <SheetRow
              key={m}
              label={words(m)}
              selected={m === metric}
              onPress={() => {
                setPicking(false);
                if (m === metric) return;
                setInspect(null);
                setPicked(m);
              }}
            />
          ))}
        </View>
      </TrackerSheet>
    </Animated.View>
  );
}
