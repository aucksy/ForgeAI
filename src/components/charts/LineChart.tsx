import { useId, useState } from 'react';
import { Text as RNText, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient as SvgGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { clamp, fmtCompact } from '@/lib/format';
import { chart, color as palette, radius, type } from '@/theme/tokens';

import { AXIS_FONT, areaPath, monotonePath, niceTicks, padDomain, r2, xLabel } from './util';

export interface LineChartProps {
  data: { x: string; y: number }[];
  height?: number;
  color?: string;
  /** Soft area wash under the line. */
  fillGradient?: boolean;
  yFormat?: (n: number) => string;
  /** Dashed reference line (e.g. calorie target). */
  target?: number;
  /** Enables press-drag crosshair inspection; called with null on release. */
  onInspect?: (p: { x: string; y: number } | null) => void;
}

const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 20;

/** Smooth monotone line chart with optional area fill, target line and crosshair. */
export function LineChart({
  data,
  height = 180,
  color,
  fillGradient,
  yFormat,
  target,
  onInspect,
}: LineChartProps) {
  const [w, setW] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const gradId = `lc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const stroke = color ?? chart.series[0];
  const fmt = yFormat ?? fmtCompact;
  const n = data.length;

  const handleTouch = (e: GestureResponderEvent) => {
    if (!onInspect || n === 0 || w === 0) return;
    const plotW = w - PAD_L - PAD_R;
    const rel = (e.nativeEvent.locationX - PAD_L) / (plotW || 1);
    const idx = Math.round(clamp(rel, 0, 1) * (n - 1));
    setActive(idx);
    onInspect(data[idx]);
  };
  const clear = () => {
    if (!onInspect) return;
    setActive(null);
    onInspect(null);
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
    const [lo, hi] = padDomain(yMin, yMax, 0.08); // tight domain is fine for lines

    const plotW = w - PAD_L - PAD_R;
    const plotH = height - PAD_T - PAD_B;
    const xFor = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yFor = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * plotH;

    const pts = data.map((d, i) => ({ x: xFor(i), y: yFor(d.y) }));
    const ticks = niceTicks(lo, hi, 4);
    const last = data[n - 1];
    const lastPt = pts[n - 1];
    const activePt = active !== null ? pts[active] : null;
    const activeDatum = active !== null ? data[active] : null;

    return (
      <>
        <Svg width={w} height={height}>
          {fillGradient ? (
            <Defs>
              <SvgGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={stroke} stopOpacity={0.20} />
                <Stop offset="1" stopColor={stroke} stopOpacity={0} />
              </SvgGradient>
            </Defs>
          ) : null}

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

          {fillGradient ? (
            <Path d={areaPath(pts, height - PAD_B)} fill={`url(#${gradId})`} />
          ) : null}

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
              <SvgText
                x={w - PAD_R}
                y={r2(yFor(target) - 5)}
                fill={palette.inkMuted}
                textAnchor="end"
                {...AXIS_FONT}
              >
                {fmt(target)}
              </SvgText>
            </>
          ) : null}

          <Path
            d={monotonePath(pts)}
            stroke={stroke}
            strokeWidth={chart.lineWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* crosshair */}
          {activePt ? (
            <Line
              x1={r2(activePt.x)}
              x2={r2(activePt.x)}
              y1={PAD_T}
              y2={height - PAD_B}
              stroke={palette.borderStrong}
              strokeWidth={1}
            />
          ) : null}

          {/* end marker + selective direct label (last value only) */}
          <Circle
            cx={r2(lastPt.x)}
            cy={r2(lastPt.y)}
            r={chart.markerRadius}
            fill={stroke}
            stroke={palette.surface}
            strokeWidth={2}
          />
          {active === null ? (
            <SvgText
              x={r2(Math.min(lastPt.x, w - PAD_R - 2))}
              y={r2(Math.max(lastPt.y - 10, 10))}
              fill={palette.inkSecondary}
              textAnchor="end"
              {...AXIS_FONT}
            >
              {fmt(last.y)}
            </SvgText>
          ) : null}

          {activePt ? (
            <Circle
              cx={r2(activePt.x)}
              cy={r2(activePt.y)}
              r={chart.markerRadius + 0.5}
              fill={stroke}
              stroke={palette.surface}
              strokeWidth={2}
            />
          ) : null}

          {/* x labels: first + last only */}
          <SvgText
            x={PAD_L}
            y={height - 5}
            fill={palette.inkMuted}
            textAnchor="start"
            {...AXIS_FONT}
          >
            {xLabel(data[0].x)}
          </SvgText>
          {n > 1 ? (
            <SvgText
              x={w - PAD_R}
              y={height - 5}
              fill={palette.inkMuted}
              textAnchor="end"
              {...AXIS_FONT}
            >
              {xLabel(last.x)}
            </SvgText>
          ) : null}
        </Svg>

        {/* floating inspect label */}
        {activePt && activeDatum ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: clamp(activePt.x - 48, 2, Math.max(2, w - 98)),
              backgroundColor: palette.surfaceRaised,
              borderWidth: 1,
              borderColor: palette.borderStrong,
              borderRadius: radius.sm,
              paddingHorizontal: 9,
              paddingVertical: 5,
              alignItems: 'center',
              minWidth: 72,
            }}
          >
            <RNText
              style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: palette.ink }}
            >
              {fmt(activeDatum.y)}
            </RNText>
            <RNText
              style={{
                fontFamily: type.bodyMedium,
                fontSize: type.size.caption,
                color: palette.inkMuted,
              }}
            >
              {xLabel(activeDatum.x)}
            </RNText>
          </View>
        ) : null}
      </>
    );
  })();

  return (
    <View
      style={{ width: '100%', height }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => Boolean(onInspect)}
      onMoveShouldSetResponder={() => Boolean(onInspect)}
      onResponderTerminationRequest={() => false}
      onResponderGrant={handleTouch}
      onResponderMove={handleTouch}
      onResponderRelease={clear}
      onResponderTerminate={clear}
    >
      {body}
    </View>
  );
}
