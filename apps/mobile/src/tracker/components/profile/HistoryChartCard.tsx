/**
 * Redesign R2 — the Profile's history chart, laid out like Hevy's (PLAN §3 item 4):
 *
 *   9,201 kg  Oct                         Last 12 weeks ⌄
 *   200k kg ┤ ▂ ▅ █ ▃ …
 *   [Duration] [Kg lifted] [Reps]
 *
 * Tap a bar → the big number shows that bar and its period; the same bar again → the latest.
 * The numbers come from the pure engine (`engine/historyChart.ts`). Screen reader: the chart
 * says its summary (latest and highest), and every bar is a button that says its period and
 * number. Large text wraps the top line instead of cutting it.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { Chip, Skeleton } from '@/components/ui';
import { barTopPath } from '@/components/charts/util';
import { tap } from '@/lib/haptics';
import type { UnitSystem } from '@/lib/units';
import { chart, color, radius, space, type } from '@/theme/tokens';

import {
  barValue,
  CHART_RANGES,
  chartAxisText,
  chartMetricLabel,
  chartPeriodText,
  chartSummary,
  chartTicks,
  chartValueText,
  chartXLabelIndexes,
  chartXText,
  shownBar,
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
  onMetric: (m: ChartMetric) => void;
  onRange: (r: ChartRange) => void;
  onRetry: () => void;
}) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  // A new range or chip starts from the latest bar again.
  const [shownFor, setShownFor] = useState(`${range}|${metric}`);
  if (shownFor !== `${range}|${metric}`) {
    setShownFor(`${range}|${metric}`);
    setSelected(null);
  }

  const list = bars ?? [];
  const empty = list.length === 0 || list.every((b) => b.workouts === 0);
  const idx = shownBar(list, selected);
  const bar = idx >= 0 ? list[idx] : null;
  const rangeLabel = CHART_RANGES.find((r) => r.id === range)?.label ?? '';

  const values = list.map((b) => barValue(b, metric));
  const ticks = chartTicks(Math.max(0, ...values), metric, units);
  const top = ticks[ticks.length - 1] || 1;
  const plotW = Math.max(0, width - AXIS_W);
  const plotH = CHART_H - PAD_T - PAD_B;
  const slot = list.length > 0 ? plotW / list.length : 0;
  const barW = Math.max(2, Math.min(28, slot * 0.62));
  const y = (v: number) => PAD_T + plotH - (Math.max(0, v) / top) * plotH;
  const labels = new Set(chartXLabelIndexes(list.length, list.length > 12 ? 5 : 4));

  return (
    <View style={{ gap: space.md }}>
      {/* The big number and the range. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
        <Text accessibilityLiveRegion="polite" style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: type.display, fontSize: type.size.h2, color: color.ink }}>
            {bar && !empty ? chartValueText(barValue(bar, metric), metric, units) : chartValueText(0, metric, units)}
          </Text>
          {bar && !empty ? (
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkMuted }}>{`  ${chartPeriodText(bar, today)}`}</Text>
          ) : null}
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
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.accent }}>{rangeLabel}</Text>
          <Glyph name="chevron-down" size={18} color={color.accent} />
        </Pressable>
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
                if (v <= 0) return null;
                const x = AXIS_W + slot * i + (slot - barW) / 2;
                const yt = y(v);
                const dim = selected != null && i !== idx;
                return (
                  <Path
                    key={b.start}
                    d={barTopPath(x, yt, barW, PAD_T + plotH - yt, chart.barRadius)}
                    fill={i === idx && selected != null ? color.accentBright : chart.series[0]}
                    opacity={dim ? 0.45 : 1}
                  />
                );
              })}
              {list.map((b, i) =>
                labels.has(i) ? (
                  <SvgText
                    key={`x${b.start}`}
                    x={Math.min(width - 2, Math.max(AXIS_W + 2, AXIS_W + slot * i + slot / 2))}
                    y={CHART_H - 6}
                    fontSize={11}
                    fontFamily={type.mono}
                    fill={color.inkMuted}
                    textAnchor={i === list.length - 1 ? 'end' : 'middle'}
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
                  onPress={() => {
                    tap();
                    setSelected((s) => tapBar(s, i));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${chartPeriodText(b, today)}: ${chartValueText(values[i], metric, units)}`}
                  accessibilityState={{ selected: selected === i }}
                  style={{ position: 'absolute', left: AXIS_W + slot * i, top: 0, width: slot, height: CHART_H - PAD_B }}
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
