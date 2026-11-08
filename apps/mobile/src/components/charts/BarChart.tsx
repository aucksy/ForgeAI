/**
 * Baseline-zero column chart: 4px rounded tops, 2px gaps, hairline grid.
 *
 * R-404 (owner rule, 8 Nov 2026: "every chart behaves the same"): with `onOpenPicked` (or `onInspect`)
 * a bar taps exactly like a point on `DateLineChart`: ONE tap picks the bar under the finger and keeps
 * it after the finger lifts (the other bars dim), a drag moves it, the same bar again or a tap on the
 * axis labels puts it away, and new bars clear it. Over the picked bar sits the same box as the line
 * chart's (`PickedBox`): its number and period and, when the bar opens something, a "›"; tapping the
 * box opens it. A bar that `canOpen` says no to (default: an empty bar, 0) shows its box without "›"
 * and opens nothing. The touch rules are the line chart's (`chartTap`, `chartTakesMove`, the R-311
 * "did the page really scroll?" check), so scrolling the page across the chart still scrolls it.
 * A chart given none of these props looks and acts exactly as before.
 */
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { fmtCompact } from '@/lib/format';
import { chart, color as palette } from '@/theme/tokens';
import { chartDataKey, chartTakesMove, chartTap } from '@/tracker/lib/chartTime';

import { PickedBox } from './PickedBox';
import { AXIS_FONT, barIndexAt, barTopPath, niceTicks, r2, xLabel } from './util';

type Bar = { x: string; y: number };

export interface BarChartProps {
  data: Bar[];
  height?: number;
  color?: string;
  yFormat?: (n: number) => string;
  /** Show every Nth x label (default 1 = all). */
  labelEvery?: number;
  /** Render the last bar in full accent, the rest muted. */
  highlightLast?: boolean;
  /** R-404: called with the picked bar and its index, and with null when it is put away. */
  onInspect?: (p: Bar | null, index: number | null) => void;
  /** R-404: makes the picked bar's box a button that calls this (the screen opens what is behind it). */
  onOpenPicked?: (p: Bar, index: number) => void;
  /** Whether a bar's box opens anything (default: a bar above 0). */
  canOpen?: (p: Bar, index: number) => boolean;
  /** How the picked bar's number reads in the box (default `yFormat`). */
  pickedValue?: (p: Bar, index: number) => string;
  /** How the picked bar's period reads in the box (default its x label). */
  pickedDate?: (p: Bar, index: number) => string;
  /** What a screen reader says for the box's button. */
  openLabel?: (p: Bar, index: number) => string;
  /** What the chart shows (e.g. `${range}|${grouping}`): a change clears the picked bar. */
  resetKey?: string;
}

const PAD_L = 40;
const PAD_R = 8;
const PAD_T = 16;
const PAD_B = 20;

export function BarChart({
  data,
  height = 180,
  color,
  yFormat,
  labelEvery = 1,
  highlightLast,
  onInspect,
  onOpenPicked,
  canOpen,
  pickedValue,
  pickedDate,
  openLabel,
  resetKey,
}: BarChartProps) {
  const [w, setW] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const fill = color ?? chart.series[0];
  const fmt = yFormat ?? fmtCompact;
  const n = data.length;
  const picking = Boolean(onInspect || onOpenPicked);

  // As DateLineChart (R-311 / R-397): the picked index for the delayed scroll check, the chart's view
  // to measure on the window, and whether the finger went down on the box.
  const activeRef = useRef<number | null>(null);
  activeRef.current = active;
  const viewRef = useRef<View>(null);
  const alive = useRef(true);
  const onBox = useRef(false);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  // New bars (another range, grouping or set of muscles): the picked bar means nothing any more.
  const dataKey = chartDataKey(data, resetKey);
  const firstKey = useRef(dataKey);
  useEffect(() => {
    if (firstKey.current === dataKey) return;
    firstKey.current = dataKey;
    setActive(null);
    onInspect?.(null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  const touch = useRef<{ startIdx: number | null; before: number | null; moved: boolean; outside: boolean; downAt: number; winY?: number } | null>(null);
  const pick = (idx: number | null) => {
    if (!picking) return;
    activeRef.current = idx;
    setActive(idx);
    onInspect?.(idx == null ? null : data[idx] ?? null, idx);
  };
  const onDown = (e: GestureResponderEvent) => {
    if (!picking || n === 0 || w === 0) return;
    const idx = barIndexAt(e.nativeEvent.locationX, w, n, PAD_L, PAD_R);
    const t: NonNullable<typeof touch.current> = { startIdx: idx, before: active, moved: false, outside: idx == null, downAt: Date.now() };
    touch.current = t;
    viewRef.current?.measureInWindow((_x, y) => {
      t.winY = y;
    });
    if (idx != null && idx !== active) pick(idx);
  };
  const onMove = (e: GestureResponderEvent) => {
    if (!picking || n === 0 || w === 0 || !touch.current) return;
    const idx = barIndexAt(e.nativeEvent.locationX, w, n, PAD_L, PAD_R);
    if (idx == null) return;
    if (idx !== touch.current.startIdx) touch.current.moved = true;
    if (idx !== active) pick(idx);
  };
  const onUp = () => {
    const t = touch.current;
    touch.current = null;
    if (!picking || !t) return;
    const next = chartTap({ before: t.before, at: t.startIdx, moved: t.moved, outside: t.outside, now: active, heldMs: Date.now() - t.downAt });
    if (next !== active) pick(next);
  };
  const onTaken = () => {
    const t = touch.current;
    touch.current = null;
    if (!picking || !t) return;
    const heldMs = Date.now() - t.downAt;
    const settle = (scrolled: boolean) => {
      if (!alive.current || touch.current) return;
      const now = activeRef.current;
      const next = chartTap({ before: t.before, at: t.startIdx, moved: t.moved, outside: t.outside, now, heldMs, taken: true, scrolled });
      if (next !== now) pick(next);
    };
    setTimeout(() => {
      const v = viewRef.current;
      if (!v || t.winY == null) {
        settle(true);
        return;
      }
      v.measureInWindow((_x, y) => settle(Math.abs(y - (t.winY ?? y)) > 3));
    }, 150);
  };

  const body = (() => {
    if (w === 0 || n === 0) return null;

    let yMax = 0;
    for (const d of data) if (d.y > yMax) yMax = d.y;
    const hi = (yMax || 1) * 1.08; // bars ALWAYS baseline 0

    const plotW = w - PAD_L - PAD_R;
    const plotH = height - PAD_T - PAD_B;
    const baseY = PAD_T + plotH;
    const slot = plotW / n;
    const barW = Math.min(24, Math.max(2, slot - chart.barGap));
    const yFor = (v: number) => PAD_T + (1 - v / hi) * plotH;

    const ticks = niceTicks(0, hi, 4).filter((t) => t > 0);
    const every = Math.max(1, Math.floor(labelEvery));
    const picked = active !== null && active < n ? active : null;

    // Selective value label: last bar when highlighted, else the max bar.
    let labelIdx = n - 1;
    if (!highlightLast) {
      let best = -Infinity;
      data.forEach((d, i) => {
        if (d.y > best) {
          best = d.y;
          labelIdx = i;
        }
      });
    }

    const pickedDatum = picked !== null ? data[picked] : null;
    const openable = pickedDatum && picked !== null && onOpenPicked ? (canOpen ? canOpen(pickedDatum, picked) : pickedDatum.y > 0) : false;

    return (
      <>
        <Svg width={w} height={height}>
          {ticks.map((t) => (
            <Line
              key={`g${t}`}
              x1={PAD_L}
              x2={w - PAD_R}
              y1={r2(yFor(t))}
              y2={r2(yFor(t))}
              stroke={palette.grid}
              strokeWidth={chart.gridWidth}
            />
          ))}
          {ticks.map((t) => (
            <SvgText
              key={`gl${t}`}
              x={PAD_L - 8}
              y={r2(yFor(t) + 3.5)}
              fill={palette.inkMuted}
              textAnchor="end"
              {...AXIS_FONT}
            >
              {fmt(t)}
            </SvgText>
          ))}

          {data.map((d, i) => {
            const cx = PAD_L + slot * i + slot / 2;
            const x = cx - barW / 2;
            const h = d.y <= 0 ? 0 : (d.y / hi) * plotH;
            // A picked bar stands out, the rest dim (as the last bar does with highlightLast).
            const muted = picked !== null ? i !== picked : Boolean(highlightLast) && i !== n - 1;
            return (
              <Path
                key={`b${i}`}
                d={barTopPath(x, baseY - h, barW, h, chart.barRadius)}
                fill={fill}
                fillOpacity={muted ? 0.38 : 1}
              />
            );
          })}

          {/* baseline */}
          <Line
            x1={PAD_L}
            x2={w - PAD_R}
            y1={r2(baseY)}
            y2={r2(baseY)}
            stroke={palette.axis}
            strokeWidth={1}
          />

          {/* selective value label on the highlighted/max bar (the box says it while a bar is picked) */}
          {picked === null && data[labelIdx].y > 0 ? (
            <SvgText
              x={r2(PAD_L + slot * labelIdx + slot / 2)}
              y={r2(yFor(data[labelIdx].y) - 6)}
              fill={palette.inkSecondary}
              textAnchor="middle"
              {...AXIS_FONT}
            >
              {fmt(data[labelIdx].y)}
            </SvgText>
          ) : null}

          {data.map((d, i) =>
            i % every === 0 ? (
              <SvgText
                key={`x${i}`}
                x={r2(PAD_L + slot * i + slot / 2)}
                y={height - 5}
                fill={palette.inkMuted}
                textAnchor="middle"
                {...AXIS_FONT}
              >
                {xLabel(d.x)}
              </SvgText>
            ) : null,
          )}
        </Svg>

        {/* One screen-reader button per bar ("Oct 2026: 12 workouts"), as on the Profile chart. Touches
            pass through to the chart, which picks the bar under the finger; a test taps them by their words. */}
        {picking
          ? data.map((d, i) => (
              <View
                key={`a${i}`}
                pointerEvents="none"
                accessible
                accessibilityRole="button"
                accessibilityLabel={`${pickedDate ? pickedDate(d, i) : xLabel(d.x)}: ${pickedValue ? pickedValue(d, i) : fmt(d.y)}`}
                accessibilityState={{ selected: picked === i }}
                accessibilityActions={[{ name: 'activate' }]}
                onAccessibilityAction={() => pick(i)}
                onAccessibilityTap={() => pick(i)}
                style={{ position: 'absolute', left: PAD_L + slot * i, top: PAD_T, width: slot, height: plotH }}
              />
            ))
          : null}

        {pickedDatum && picked !== null ? (
          <PickedBox
            x={PAD_L + slot * picked + slot / 2}
            chartW={w}
            value={pickedValue ? pickedValue(pickedDatum, picked) : fmt(pickedDatum.y)}
            date={pickedDate ? pickedDate(pickedDatum, picked) : xLabel(pickedDatum.x)}
            onOpen={openable && onOpenPicked ? () => onOpenPicked(pickedDatum, picked) : undefined}
            openLabel={openLabel ? openLabel(pickedDatum, picked) : undefined}
            onPressIn={() => {
              onBox.current = true;
            }}
            onPressOut={() => {
              onBox.current = false;
            }}
          />
        ) : null}
      </>
    );
  })();

  return (
    <View
      testID={picking ? 'bar-chart' : undefined}
      ref={viewRef}
      style={{ width: '100%', height }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => picking}
      onMoveShouldSetResponder={() => chartTakesMove({ inspecting: picking, onBox: onBox.current })}
      onResponderTerminationRequest={() => false}
      onResponderGrant={onDown}
      onResponderMove={onMove}
      onResponderRelease={onUp}
      onResponderTerminate={onTaken}
    >
      {body}
    </View>
  );
}
