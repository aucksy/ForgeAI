/**
 * Redesign R2 — the Profile's history chart, laid out like Hevy's (PLAN §3 item 4):
 *
 *   41,230 kg                                Last 12 weeks ⌄
 *   Kg lifted in the last 12 weeks · 27 workouts
 *   200k kg ┤ ╱╲__╱ …
 *   [Duration] [Kg lifted] [Reps]
 *
 * R-319 item 7 (owner, 4 Nov 2026: "line graphs give you a much clearer quicker impression on
 * whether you're progressing or not"): a LINE now, one point per week or month, drawn by the same
 * `DateLineChart` as the exercise chart, so every dated chart looks and taps alike. Tap a point →
 * it stays picked; the big number and the caption show that week or month, and "See these
 * workouts" opens the workout history for exactly that period ("/history?from=…&to=…"). "Show
 * 12-week total" (or the same point again) goes back to the total. A week with no workout is a
 * point on zero, so a gap in training shows as a dip.
 *
 * 13 Oct 2026 audit of v0.37.0: "No workouts yet" only for a member with NO workouts (a range with
 * none in it draws its points and "· 0 workouts" — `chartCardBody`); the big number is a dash
 * until the points are read (`chartBigNumberText`). The numbers come from the pure engine
 * (`engine/historyChart.ts`). Screen reader: the chart says its summary (latest and highest), and
 * every point is a button that says its period and number. Large text wraps the top line.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Chip, Skeleton } from '@/components/ui';
import { tap } from '@/lib/haptics';
import type { UnitSystem } from '@/lib/units';
import { color, radius, space, type } from '@/theme/tokens';

import {
  barValue,
  CHART_RANGES,
  chartAxisText,
  chartBackText,
  chartBigNumberText,
  chartCardBody,
  chartHintText,
  chartMetricLabel,
  chartCaptionText,
  chartPeriodText,
  chartSummary,
  chartTotalCaptionText,
  chartValueText,
  type ChartBar,
  type ChartMetric,
  type ChartRange,
} from '../../engine/historyChart';
import { dateXs } from '../../lib/chartTime';
import { historyRangeParams } from '../../lib/historyRange';
import { DATE_CHART_PAD, DateLineChart } from '../DateLineChart';
import { Glyph } from '../TrackerGlyph';
import { SheetRow, TrackerSheet } from '../TrackerSheet';

const METRICS: readonly ChartMetric[] = ['duration', 'volume', 'reps'];
const CHART_H = 170;

export function HistoryChartCard({
  bars,
  metric,
  range,
  units,
  today,
  loading,
  failed,
  workoutsEver,
  onMetric,
  onRange,
  onRetry,
  showChips = true,
}: {
  /** R-132: false on the Progress tab, whose tabs at the top choose what the chart counts. */
  showChips?: boolean;
  bars: ChartBar[] | null;
  metric: ChartMetric;
  range: ChartRange;
  units: UnitSystem;
  today: string;
  loading: boolean;
  failed: boolean;
  /** The member's workout count (Profile's header); null while it is unknown. */
  workoutsEver: number | null;
  onMetric: (m: ChartMetric) => void;
  onRange: (r: ChartRange) => void;
  onRetry: () => void;
}) {
  const router = useRouter();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  // "Show 12-week total" clears the line's picked point too (the pick lives in the chart).
  const [clears, setClears] = useState(0);
  // A new range, chip or set of points (a reread, a new week) starts from the total again: a tap
  // is a position, and in new points that position can be another week.
  const [shownFor, setShownFor] = useState<{ key: string; bars: ChartBar[] | null }>({ key: `${range}|${metric}`, bars });
  if (shownFor.key !== `${range}|${metric}` || shownFor.bars !== bars) {
    setShownFor({ key: `${range}|${metric}`, bars });
    setSelected(null);
    setClears((c) => c + 1);
  }

  const list = bars ?? [];
  // Nothing to draw yet (reading, or a failed read), or nothing ever logged: no caption, no hint.
  const empty = !bars || chartCardBody(bars, workoutsEver) === 'none';
  // The picked week or month, or null = the whole range's total.
  const idx = selected != null && selected >= 0 && selected < list.length ? selected : -1;
  const bar = idx >= 0 ? list[idx] : null;
  const rangeLabel = CHART_RANGES.find((r) => r.id === range)?.label ?? '';

  const values = list.map((b) => barValue(b, metric));
  // One point per week or month, at its first day.
  const points = list.map((b, i) => ({ x: b.start, y: values[i] }));
  // Where each point sits (as the line chart places them), for the screen-reader buttons.
  const plotW = Math.max(0, width - DATE_CHART_PAD.left - DATE_CHART_PAD.right);
  const xs = dateXs(
    list.map((b) => b.start),
    DATE_CHART_PAD.left,
    plotW,
  );
  const slot = list.length > 0 ? Math.max(8, plotW / list.length) : 0;

  const pickPoint = (p: { x: string; y: number } | null): void => {
    if (!p) {
      setSelected(null);
      return;
    }
    const i = list.findIndex((b) => b.start === p.x);
    setSelected(i >= 0 ? i : null);
  };
  const showTotal = (): void => {
    tap();
    setSelected(null);
    setClears((c) => c + 1);
  };
  const openWorkouts = (b: ChartBar): void => {
    tap();
    router.push({ pathname: '/history', params: { ...historyRangeParams(b.start, b.end) } });
  };

  return (
    <View style={{ gap: space.md }}>
      {/* The big number and the range, then one line saying what the number counts. */}
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
          <Text
            accessibilityLiveRegion="polite"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ flex: 1, fontFamily: type.display, fontSize: type.size.h2, color: color.ink }}
          >
            {chartBigNumberText(bars, idx >= 0 ? idx : null, metric, units)}
          </Text>
          <Pressable
            onPress={() => {
              tap();
              setRangeOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Range: ${rangeLabel}. Change`}
            hitSlop={4}
            style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.7 : 1 })}
          >
            <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.accent }}>{rangeLabel}</Text>
            <Glyph name="chevron-down" size={18} color={color.accent} />
          </Pressable>
        </View>
        {!empty ? (
          // One line always (it shrinks before it wraps), so a tap never moves the bars.
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>
            {bar ? chartCaptionText(bar, metric, units, today) : chartTotalCaptionText(list, range, metric, units)}
          </Text>
        ) : null}
        {/* One fixed-height line: the hint before a tap; after it, the way back and the way to
            that period's workouts. It never appears or disappears, so the chart doesn't jump. */}
        {!empty && bar ? (
          <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: space.md }}>
            <Pressable
              onPress={showTotal}
              accessibilityRole="button"
              hitSlop={4}
              style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.7 : 1 })}
            >
              <Glyph name="chevron-left" size={16} color={color.accent} />
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{chartBackText(range)}</Text>
            </Pressable>
            {bar.workouts > 0 ? (
              <Pressable
                testID="chart-see-workouts"
                onPress={() => openWorkouts(bar)}
                accessibilityRole="button"
                accessibilityLabel={`See these workouts, ${chartPeriodText(bar, today)}`}
                hitSlop={4}
                style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>See these workouts</Text>
                <Glyph name="chevron-right" size={16} color={color.accent} />
              </Pressable>
            ) : null}
          </View>
        ) : !empty ? (
          <View style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>{chartHintText(range)}</Text>
          </View>
        ) : null}
      </View>

      {/* The line. */}
      {loading && !bars ? (
        <Skeleton width="100%" height={CHART_H} radius={radius.md} />
      ) : failed && !bars ? (
        <Pressable onPress={onRetry} accessibilityRole="button" style={{ minHeight: CHART_H, justifyContent: 'center', alignItems: 'center', gap: space.xs }}>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>Couldn’t load your history.</Text>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>Try again</Text>
        </Pressable>
      ) : empty ? (
        <View style={{ minHeight: CHART_H * 0.6, justifyContent: 'center' }}>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted, textAlign: 'center' }}>
            No workouts yet. Your history shows here.
          </Text>
        </View>
      ) : (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: CHART_H }}>
          <View accessible accessibilityLabel={chartSummary(list, metric, range, units, today)} style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1 }} />
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <DateLineChart
              data={points}
              height={CHART_H}
              fillGradient
              // The axis is narrow: "12.5k", no unit (the line above says "Kg lifted").
              yFormat={(n) => chartAxisText(n, metric, units).replace(/ (kg|lb)$/, '')}
              onInspect={pickPoint}
              resetKey={`${range}|${metric}|${clears}`}
            />
          </View>
          {/* One screen-reader button per point ("5–11 Oct: 4,200 kg"). Touches pass through to
              the line, which picks the nearest point; a test taps them by their words too. */}
          {width > 0
            ? list.map((b, i) => (
                <View
                  key={`p${b.start}`}
                  pointerEvents="none"
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`${chartPeriodText(b, today)}: ${chartValueText(values[i], metric, units)}`}
                  accessibilityState={{ selected: idx === i }}
                  accessibilityActions={[{ name: 'activate' }]}
                  onAccessibilityAction={() => setSelected(i)}
                  onAccessibilityTap={() => setSelected(i)}
                  style={{ position: 'absolute', left: (xs[i] ?? 0) - slot / 2, top: 0, width: slot, height: CHART_H - 20 }}
                />
              ))
            : null}
        </View>
      )}

      {/* The chips: Duration · Kg lifted · Reps. */}
      {showChips ? (
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {METRICS.map((m) => (
          <Chip
            key={m}
            role="radio"
            label={chartMetricLabel(m, units)}
            selected={metric === m}
            onPress={() => {
              if (m === metric) return;
              tap();
              onMetric(m);
            }}
          />
        ))}
      </View>
      ) : null}

      <TrackerSheet visible={rangeOpen} title="Show" onClose={() => setRangeOpen(false)}>
        <View style={{ gap: 2 }}>
          {CHART_RANGES.map((r) => (
            <SheetRow
              key={r.id}
              label={r.label}
              selected={r.id === range}
              onPress={() => {
                setRangeOpen(false);
                if (r.id !== range) onRange(r.id);
              }}
            />
          ))}
        </View>
      </TrackerSheet>
    </View>
  );
}
