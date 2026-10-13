/**
 * Redesign R2 — the Profile's history chart, laid out like Hevy's (PLAN §3 item 4):
 *
 *   41,230 kg                                Last 12 weeks ⌄
 *   Kg lifted in the last 12 weeks · 27 workouts
 *   200k kg ┤ ▂ ▅ █ ▃ …
 *   [Duration] [Kg lifted] [Reps]
 *
 * The big number is the range's total. Tap a bar → it shows that bar and its period; the line
 * under the caption turns from "Tap a bar to see one week" into "Show … total"; that, or the
 * same bar again → the total. A week or month with no
 * workout keeps a faint mark on the baseline, so the bars stay evenly spaced to the eye; bars
 * sit on whole pixels, so 40+ thin bars don't blur into uneven gaps.
 *
 * 13 Oct 2026 audit of v0.37.0: "No workouts yet" only for a member with NO workouts (a range with
 * none in it draws its empty bars and "· 0 workouts" — `chartCardBody`); the big number is a dash
 * until the bars are read (`chartBigNumberText`); the slot is whole device pixels, so every gap is
 * identical (`barLayout`); a finger HELD on the shown bar and lifted keeps it (`tapBar`).
 * The numbers come from the pure engine (`engine/historyChart.ts`). Screen reader: the chart
 * says its summary (latest and highest), and every bar is a button that says its period and
 * number. Large text wraps the top line instead of cutting it.
 */
import { useRef, useState } from 'react';
import { PixelRatio, Pressable, Text, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { Chip, Skeleton } from '@/components/ui';
import { barTopPath } from '@/components/charts/util';
import { tap } from '@/lib/haptics';
import type { UnitSystem } from '@/lib/units';
import { chart, color, radius, space, type } from '@/theme/tokens';

import {
  barLayout,
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
  chartTicks,
  chartTotalCaptionText,
  chartValueText,
  chartXLabelIndexes,
  chartXText,
  tapBar,
  type ChartBar,
  type ChartMetric,
  type ChartRange,
} from '../../engine/historyChart';
import { Glyph } from '../TrackerGlyph';
import { SheetRow, TrackerSheet } from '../TrackerSheet';

const METRICS: readonly ChartMetric[] = ['duration', 'volume', 'reps'];
const CHART_H = 170;
const PAD_T = 8;
const PAD_B = 22;
const AXIS_W = 58;

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
}: {
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
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  // A new range, chip or set of bars (a reread, a new week) starts from the total again: a tap
  // is a position, and in new bars that position can be another week.
  const [shownFor, setShownFor] = useState<{ key: string; bars: ChartBar[] | null }>({ key: `${range}|${metric}`, bars });
  if (shownFor.key !== `${range}|${metric}` || shownFor.bars !== bars) {
    setShownFor({ key: `${range}|${metric}`, bars });
    setSelected(null);
  }

  // When the finger went down on a bar: a short tap on the shown bar puts it away, a hold keeps it.
  const pressedAt = useRef(0);

  const list = bars ?? [];
  // Nothing to draw yet (reading, or a failed read), or nothing ever logged: no caption, no hint.
  const empty = !bars || chartCardBody(bars, workoutsEver) === 'none';
  // The tapped bar, or null = the whole range's total.
  const idx = selected != null && selected >= 0 && selected < list.length ? selected : -1;
  const bar = idx >= 0 ? list[idx] : null;
  const rangeLabel = CHART_RANGES.find((r) => r.id === range)?.label ?? '';

  const values = list.map((b) => barValue(b, metric));
  const ticks = chartTicks(Math.max(0, ...values), metric, units);
  const top = ticks[ticks.length - 1] || 1;
  const plotW = Math.max(0, width - AXIS_W);
  const plotH = CHART_H - PAD_T - PAD_B;
  // Whole device pixels for the slot AND each bar, so every gap is the same (13 Oct 2026 audit).
  const layout = barLayout(plotW, list.length, PixelRatio.get());
  const { slot, barW } = layout;
  const slotX = (i: number) => AXIS_W + layout.left + slot * i;
  const base = PAD_T + plotH;
  const y = (v: number) => base - (Math.max(0, v) / top) * plotH;
  // The last label sits under its own bar, kept inside the card (about 6.5 dp a letter at 11).
  const labelX = (i: number, text: string) => {
    const half = (text.length * 6.5) / 2;
    return Math.min(width - half, Math.max(AXIS_W + half, slotX(i) + slot / 2));
  };
  const labels = new Set(chartXLabelIndexes(list.length, list.length > 12 ? 5 : 4));

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
        {/* One fixed-height line: the hint before a tap, the way back after it. It never appears
            or disappears, so the bars don't jump under the finger that tapped them. */}
        {!empty && bar ? (
          <Pressable
            onPress={() => {
              tap();
              setSelected(null);
            }}
            accessibilityRole="button"
            hitSlop={4}
            style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.7 : 1 })}
          >
            <Glyph name="chevron-left" size={16} color={color.accent} />
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{chartBackText(range)}</Text>
          </Pressable>
        ) : !empty ? (
          <View style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>{chartHintText(range)}</Text>
          </View>
        ) : null}
      </View>

      {/* The bars. */}
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
        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessible={false}
          style={{ height: CHART_H }}
        >
          <View accessible accessibilityLabel={chartSummary(list, metric, range, units, today)} style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1 }} />
          {width > 0 ? (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Svg width={width} height={CHART_H}>
              {ticks.map((t) => (
                <Line key={`g${t}`} x1={AXIS_W} x2={width} y1={y(t)} y2={y(t)} stroke={color.grid} strokeWidth={chart.gridWidth} />
              ))}
              {ticks.map((t) => (
                <SvgText key={`t${t}`} x={AXIS_W - 6} y={y(t) + 4} fontSize={11} fontFamily={type.mono} fill={color.inkMuted} textAnchor="end">
                  {chartAxisText(t, metric, units)}
                </SvgText>
              ))}
              {list.map((b, i) => {
                const v = values[i];
                // Every bar is a whole number of slots from the first, so one rounding moves all alike.
                const x = PixelRatio.roundToNearestPixel(AXIS_W + layout.xs[i]);
                const dim = idx >= 0 && i !== idx;
                if (v <= 0) {
                  // Nothing that week or month: a faint mark, so the gap reads as empty, not missing.
                  return <Path key={b.start} d={barTopPath(x, base - 2, barW, 2, 1)} fill={chart.series[0]} opacity={0.3} />;
                }
                // A small but real number is never thinner than the empty mark.
                const yt = Math.min(base - 3, y(v));
                return (
                  <Path
                    key={b.start}
                    d={barTopPath(x, yt, barW, base - yt, chart.barRadius)}
                    fill={i === idx ? color.accentBright : chart.series[0]}
                    opacity={dim ? 0.45 : 1}
                  />
                );
              })}
              {list.map((b, i) =>
                labels.has(i) ? (
                  <SvgText
                    key={`x${b.start}`}
                    x={labelX(i, chartXText(b))}
                    y={CHART_H - 6}
                    fontSize={11}
                    fontFamily={type.mono}
                    fill={color.inkMuted}
                    textAnchor="middle"
                  >
                    {chartXText(b)}
                  </SvgText>
                ) : null,
              )}
            </Svg>
            </View>
          ) : null}
          {/* A tap area over each bar (the whole column, not only the bar). */}
          {width > 0
            ? list.map((b, i) => (
                <Pressable
                  key={`p${b.start}`}
                  onPressIn={() => {
                    pressedAt.current = Date.now();
                  }}
                  onPress={() => {
                    tap();
                    const held = pressedAt.current > 0 ? Date.now() - pressedAt.current : 0;
                    setSelected((s) => tapBar(s, i, held));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${chartPeriodText(b, today)}: ${chartValueText(values[i], metric, units)}`}
                  accessibilityState={{ selected: selected === i }}
                  style={{ position: 'absolute', left: slotX(i), top: 0, width: slot, height: CHART_H - PAD_B }}
                />
              ))
            : null}
        </View>
      )}

      {/* The chips: Duration · Kg lifted · Reps. */}
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
