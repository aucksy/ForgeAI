/**
 * Line chart with points at their REAL dates (Phase 3).
 *
 * Same look, props and press-and-drag readout as the frozen `components/charts/LineChart`
 * (that file stays untouched), but x follows the calendar (`lib/chartTime`), so a month off
 * shows as a gap instead of looking like the next day. Every line of dated points in the app
 * uses this chart; a test fails if a screen goes back to the index-spaced one.
 *
 * 13 Oct 2026 (owner: the value vanished when his finger lifted): ONE tap picks the nearest
 * point and keeps it shown after the finger lifts; a tap or drag elsewhere moves it; a tap on the
 * same point again, or outside the plot (the axis labels), clears it. New data (another range,
 * metric or entry) clears it too. The rule is `chartTap` (lib/chartTime, PURE, tested).
 *
 * 13 Oct 2026 audit of v0.37.0: a finger that went down to SCROLL the page (the touch is taken by
 * the scroll view) leaves the chart as it was before the touch (B4); a finger HELD on the picked
 * point and lifted keeps it — only a short tap puts it away (B6); `resetKey` (what the chart shows)
 * clears the pick when the member switches between two metrics with identical numbers (B10).
 *
 * R-311 (owner, 3 Nov 2026: the kg pop-up still went away when his finger lifted, and he wants to
 * tap it to jump to that workout, "very, very crucial"): a touch the page took while the page did
 * not actually move (a tap whose finger wobbled past the phone's scroll slop) is a tap after all,
 * so the point stays (`scrolled: false` in `chartTap`). With `onOpenPicked` the picked point's label
 * is a button (at least 44 dp tall, a chevron) that opens the workout behind the point.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { PickedBox } from '@/components/charts/PickedBox';
import { AXIS_FONT, areaPath, monotonePath, niceTicks, padDomain, r2, xLabel } from '@/components/charts/util';
import { fmtCompact } from '@/lib/format';
import { chart, color as palette } from '@/theme/tokens';

import { chartDataKey, chartTakesMove, chartTap, coveringTicks, dateXs, lastLabelY, nearestIndex } from '../lib/chartTime';

/** The frozen `niceTicks`' step for a range (its first gap), for `coveringTicks`. */
const niceStep = (lo: number, hi: number): number => {
  const t = niceTicks(lo, hi, 4);
  return t.length > 1 ? t[1] - t[0] : (hi - lo) / 3;
};

export interface DateLineChartProps {
  /** Oldest first; `x` is a 'YYYY-MM-DD' day. */
  data: { x: string; y: number }[];
  height?: number;
  color?: string;
  /** Soft area wash under the line. */
  fillGradient?: boolean;
  yFormat?: (n: number) => string;
  /** Dashed reference line (e.g. calorie target). */
  target?: number;
  /**
   * Enables tap / drag inspection: called with the picked point (it stays picked after the finger
   * lifts), and with null when it is cleared (a second tap on it, a tap outside the plot, new data).
   */
  onInspect?: (p: { x: string; y: number } | null) => void;
  /**
   * What the chart shows (e.g. `${metric}|${range}`): a change clears the picked point even when the
   * new points equal the old ones (13 Oct 2026 audit).
   */
  resetKey?: string;
  /**
   * R-311 (owner, 3 Nov 2026): makes the picked point's label a button that calls this with the
   * point (the screen opens the workout behind it). Absent = the label is only a label.
   */
  onOpenPicked?: (p: { x: string; y: number }) => void;
  /** How the picked point's day reads (default `xLabel`, "12 Mar"); the exercise chart adds the year. */
  pickedDate?: (x: string) => string;
  /** R-404: how the x-axis end labels read (default `xLabel`, "12 Mar"); a chart of months says "Nov 2025". */
  xAxisLabel?: (x: string) => string;
}

const PAD_L = 40;
const PAD_R = 12;
/** The plot's side margins, so a screen can lay tap or screen-reader areas over the points. */
export const DATE_CHART_PAD = { left: PAD_L, right: PAD_R } as const;
const PAD_T = 16;
const PAD_B = 20;

export function DateLineChart({ data, height = 180, color, fillGradient, yFormat, target, onInspect, resetKey, onOpenPicked, pickedDate, xAxisLabel }: DateLineChartProps) {
  const [w, setW] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  // R-311: the picked index for the delayed "did the page really scroll?" check, and the chart's
  // own view, measured on the window to tell.
  const activeRef = useRef<number | null>(null);
  activeRef.current = active;
  const viewRef = useRef<View>(null);
  const alive = useRef(true);
  // R-397: the finger went down on the picked point's box: the chart leaves that touch to the box.
  const onBox = useRef(false);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const gradId = `dl${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const stroke = color ?? chart.series[0];
  const fmt = yFormat ?? fmtCompact;
  const n = data.length;
  const plotW = Math.max(0, w - PAD_L - PAD_R);
  const xs = dateXs(
    data.map((d) => d.x),
    PAD_L,
    plotW,
  );

  // New data (another range, metric or entry): the picked point means nothing any more.
  const dataKey = chartDataKey(data, resetKey);
  const firstKey = useRef(dataKey);
  useEffect(() => {
    if (firstKey.current === dataKey) return;
    firstKey.current = dataKey;
    setActive(null);
    onInspect?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  // One touch: where and when it went down, which point was picked then, and whether it dragged.
  const touch = useRef<{ startIdx: number | null; before: number | null; moved: boolean; outside: boolean; downAt: number; winY?: number } | null>(null);
  const pick = (idx: number | null) => {
    if (!onInspect) return;
    activeRef.current = idx;
    setActive(idx);
    onInspect(idx == null ? null : data[idx] ?? null);
  };
  const onDown = (e: GestureResponderEvent) => {
    if (!onInspect || n === 0 || w === 0) return;
    const { locationX } = e.nativeEvent;
    const outside = locationX < PAD_L - 4 || locationX > w - PAD_R + 4;
    const idx = outside ? null : nearestIndex(xs, locationX);
    const t: NonNullable<typeof touch.current> = { startIdx: idx != null && idx >= 0 ? idx : null, before: active, moved: false, outside, downAt: Date.now() };
    touch.current = t;
    // R-311: where the chart sits on the screen now, to tell later whether the page really scrolled.
    viewRef.current?.measureInWindow((_x, y) => {
      t.winY = y;
    });
    // A finger on a new point shows it at once (it stays after the finger lifts).
    if (!outside && idx != null && idx >= 0 && idx !== active) pick(idx);
  };
  const onMove = (e: GestureResponderEvent) => {
    if (!onInspect || n === 0 || w === 0 || !touch.current) return;
    const idx = nearestIndex(xs, e.nativeEvent.locationX);
    if (idx < 0) return;
    if (idx !== touch.current.startIdx) touch.current.moved = true;
    if (idx !== active) pick(idx);
  };
  const onUp = () => {
    const t = touch.current;
    touch.current = null;
    if (!onInspect || !t) return;
    const next = chartTap({ before: t.before, at: t.startIdx, moved: t.moved, outside: t.outside, now: active, heldMs: Date.now() - t.downAt });
    if (next !== active) pick(next);
  };
  // Another view took the touch (the page scrolled under the finger): back to what was picked
  // before it went down — the point it brushed on the way is not a pick. R-311: unless the page did
  // not move after all (a wobbly tap): a moment later the chart checks where it sits on the screen.
  const onTaken = () => {
    const t = touch.current;
    touch.current = null;
    if (!onInspect || !t) return;
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

    let yMin = Infinity;
    let yMax = -Infinity;
    for (const d of data) {
      if (d.y < yMin) yMin = d.y;
      if (d.y > yMax) yMax = d.y;
    }
    if (typeof target === 'number') {
      yMin = Math.min(yMin, target);
      yMax = Math.max(yMax, target);
    }
    const [padLo, padHi] = padDomain(yMin, yMax, 0.08);
    // 12 Oct 2026: the grid now runs from a line under the lowest point to a line over the
    // highest, so no dot hangs below the last line or above the first.
    const { lo, hi, ticks } = coveringTicks(padLo, padHi, niceStep, yMin);
    const plotH = height - PAD_T - PAD_B;
    const yFor = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * plotH;

    const pts = data.map((d, i) => ({ x: xs[i], y: yFor(d.y) }));
    const last = data[n - 1];
    const lastPt = pts[n - 1];
    const activePt = active !== null ? pts[active] ?? null : null;
    const activeDatum = active !== null ? data[active] ?? null : null;

    return (
      <>
        <Svg width={w} height={height}>
          {fillGradient ? (
            <Defs>
              <SvgGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={stroke} stopOpacity={0.2} />
                <Stop offset="1" stopColor={stroke} stopOpacity={0} />
              </SvgGradient>
            </Defs>
          ) : null}

          {ticks.map((t) => (
            <Line key={`g${t}`} x1={PAD_L} x2={w - PAD_R} y1={r2(yFor(t))} y2={r2(yFor(t))} stroke={palette.grid} strokeWidth={chart.gridWidth} />
          ))}
          {ticks.map((t) => (
            <SvgText key={`gl${t}`} x={PAD_L - 8} y={r2(yFor(t) + 3.5)} fill={palette.inkMuted} textAnchor="end" {...AXIS_FONT}>
              {fmt(t)}
            </SvgText>
          ))}

          {fillGradient && n > 1 ? <Path d={areaPath(pts, height - PAD_B)} fill={`url(#${gradId})`} /> : null}

          {typeof target === 'number' ? (
            <>
              <Line
                x1={PAD_L}
                x2={w - PAD_R}
                y1={r2(yFor(target))}
                y2={r2(yFor(target))}
                stroke={palette.inkMuted}
                strokeWidth={1}
                strokeDasharray="4 6"
              />
              <SvgText x={w - PAD_R} y={r2(yFor(target) - 5)} fill={palette.inkMuted} textAnchor="end" {...AXIS_FONT}>
                {fmt(target)}
              </SvgText>
            </>
          ) : null}

          <Path d={monotonePath(pts)} stroke={stroke} strokeWidth={chart.lineWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />

          {/* A dot on each point when there are few — the gaps between them are the point of this chart. */}
          {n <= 24
            ? pts.slice(0, -1).map((p, i) => <Circle key={`p${i}`} cx={r2(p.x)} cy={r2(p.y)} r={2.2} fill={stroke} opacity={0.75} />)
            : null}

          {activePt ? <Line x1={r2(activePt.x)} x2={r2(activePt.x)} y1={PAD_T} y2={height - PAD_B} stroke={palette.borderStrong} strokeWidth={1} /> : null}

          <Circle cx={r2(lastPt.x)} cy={r2(lastPt.y)} r={chart.markerRadius} fill={stroke} stroke={palette.surface} strokeWidth={2} />
          {active === null ? (
            <SvgText
              x={r2(Math.min(lastPt.x - 6, w - PAD_R - 2))}
              y={r2(lastLabelY(lastPt.y, n > 1 ? pts[n - 2].y : null, PAD_T, height - PAD_B))}
              fill={palette.inkSecondary}
              textAnchor="end"
              {...AXIS_FONT}
            >
              {fmt(last.y)}
            </SvgText>
          ) : null}

          {activePt ? (
            <Circle cx={r2(activePt.x)} cy={r2(activePt.y)} r={chart.markerRadius + 0.5} fill={stroke} stroke={palette.surface} strokeWidth={2} />
          ) : null}

          <SvgText x={PAD_L} y={height - 5} fill={palette.inkMuted} textAnchor="start" {...AXIS_FONT}>
            {(xAxisLabel ?? xLabel)(data[0].x)}
          </SvgText>
          {n > 1 ? (
            <SvgText x={w - PAD_R} y={height - 5} fill={palette.inkMuted} textAnchor="end" {...AXIS_FONT}>
              {(xAxisLabel ?? xLabel)(last.x)}
            </SvgText>
          ) : null}
        </Svg>

        {activePt && activeDatum ? (
          // R-311: with onOpenPicked the label stays and is a button (minHeight: 44, a "›"): it opens
          // the workout behind the point. R-404: the box is shared with BarChart (`PickedBox`).
          <PickedBox
            x={activePt.x}
            chartW={w}
            value={fmt(activeDatum.y)}
            // Review 8 Nov: an empty week or month names its period too (not only its first day).
            date={(pickedDate ?? xLabel)(activeDatum.x)}
            onOpen={onOpenPicked ? () => onOpenPicked(activeDatum) : undefined}
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
      testID="date-line-chart"
      ref={viewRef}
      style={{ width: '100%', height }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => Boolean(onInspect)}
      onMoveShouldSetResponder={() => chartTakesMove({ inspecting: Boolean(onInspect), onBox: onBox.current })}
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
