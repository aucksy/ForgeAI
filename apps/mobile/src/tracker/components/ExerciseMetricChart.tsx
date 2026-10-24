/**
 * The exercise page's Summary chart, as Hevy's (redesign R5): what it shows as ONE control
 * ("Heaviest weight ⌄", which opens a sheet of the choices for how the exercise is logged —
 * `exerciseChart.chartMetrics`), the latest number (or the point under a finger) big with its
 * day, the chart, and the range as a segmented control: 3 months · Year · All time (13 Oct 2026:
 * under the title row, inside the card). It opens on 3 months, or the smallest range with
 * something in it. One tap on the chart picks a point and keeps it (DateLineChart).
 *
 * 12 Oct 2026 design pass (owner's emulator): the five choices were chips that wrapped 2 + 2 + 1
 * and left "Total reps" alone on a row, and the range chips looked exactly like them. One point
 * per day now (`bestPerDay`): two workouts on one day drew a cliff straight down.
 *
 * 13 Oct 2026: the History tab shows the same chart at its top. The page passes `metric` /
 * `range` and their setters, so both tabs share what the member picked (switching tabs keeps
 * them); without them the chart keeps its own choice, as before.
 */
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { chartAllowed } from '@/cloud/limitsFlag';
import { explainLimit, monthsOfRange } from '@/cloud/limitsPrompt';
import { Card } from '@/components/ui';
import { tinyDateWithYear, todayISO } from '@/lib/date';
import { tap } from '@/lib/haptics';
import { chart, color, motion, space, type } from '@/theme/tokens';
import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';
import type { DistUnit, LogType } from '@/tracker/engine/logTypes';
import { fmtDuration } from '@/tracker/engine/logTypes';
import type { BestSetPoint } from '@/tracker/services/exerciseAnalytics';
import {
  bestPerDay,
  chartAxisNumber,
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
  /** What the chart shows, held by the page (shared by its tabs); absent/null = the chart's own. */
  metric?: ChartMetric | null;
  onMetricChange?: (m: ChartMetric) => void;
  /** The range, held by the page; absent/null = the chart's own (opening on `openingRange`). */
  range?: ChartRange | null;
  onRangeChange?: (r: ChartRange) => void;
}

export function ExerciseMetricChart({
  history,
  bestSet,
  shownAs,
  cardio = false,
  units,
  distUnit,
  metric: heldMetric,
  onMetricChange,
  range: heldRange,
  onRangeChange,
}: ExerciseMetricChartProps) {
  const metrics = useMemo(() => chartMetrics(shownAs), [shownAs]);
  const [ownMetric, setOwnMetric] = useState<ChartMetric>(metrics[0]);
  const picked = heldMetric ?? ownMetric;
  const metric = metrics.includes(picked) ? picked : metrics[0];
  const setPicked = (m: ChartMetric): void => {
    setOwnMetric(m);
    onMetricChange?.(m);
  };
  const today = todayISO();
  const [ownRange, setOwnRange] = useState<ChartRange>(() => openingRange(history.map((h) => h.dateISO), today));
  const range = heldRange ?? ownRange;
  const setRange = (r: ChartRange): void => {
    setOwnRange(r);
    onRangeChange?.(r);
  };
  const router = useRouter();
  const [inspect, setInspect] = useState<{ x: string; y: number } | null>(null);
  const [picking, setPicking] = useState(false);

  const all = useMemo(() => bestPerDay(metric, metricSeries(metric, history, bestSet, units, distUnit)), [metric, history, bestSet, units, distUnit]);
  const data = useMemo(() => pointsInRange(all, range, today), [all, range, today]);
  const shown = inspect ?? data[data.length - 1] ?? null;
  const unit = metricUnit(metric);
  // 13 Oct 2026: axis labels and the readout grouped the phone's way ("1,330"), as elsewhere.
  const yFormat = (n: number): string => (unit === 'seconds' ? fmtDuration(n) : chartAxisNumber(n));

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
        {/* 13 Oct 2026: the range sits right under what the chart shows, inside the card — under the
            chart it fell below the fold on the owner's phone. */}
        <View style={{ marginTop: space.xs, marginBottom: space.md }}>
          <SegmentedControl
            label="Range"
            options={CHART_RANGES}
            value={range}
            onChange={(r) => {
              // #43: the free plan shows 3 months of charts (switched off at launch; gym members never meet it).
              void chartAllowed(monthsOfRange(r)).then((ok) => {
                if (!ok) {
                  void explainLimit('charts', () => router.push('/settings/gym'));
                  return;
                }
                setInspect(null);
                setRange(r);
              });
            }}
          />
        </View>
        <View testID="chart-readout" accessible accessibilityLabel={shown ? `${shownLabel}: ${metricValueText(metric, shown.y, units, distUnit)}, ${tinyDateWithYear(shown.x)}` : undefined} style={{ marginBottom: space.sm }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: type.monoBold, fontSize: type.size.h2, color: color.ink }}>
            {shown ? metricValueText(metric, shown.y, units, distUnit) : '—'}
          </Text>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
            {shown ? tinyDateWithYear(shown.x) : 'Nothing in this range yet'}
          </Text>
        </View>
        {data.length > 0 ? (
          // resetKey: switching to a metric (or range) with the same numbers still clears the
          // picked point, as it clears the readout above (13 Oct 2026 audit).
          <DateLineChart data={data} height={200} color={chart.series[0]} fillGradient yFormat={yFormat} onInspect={setInspect} resetKey={`${metric}|${range}`} />
        ) : null}
      </Card>
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
