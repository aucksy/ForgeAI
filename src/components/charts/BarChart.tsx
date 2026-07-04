import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { fmtCompact } from '@/lib/format';
import { chart, color as palette } from '@/theme/tokens';

import { AXIS_FONT, barTopPath, niceTicks, r2, xLabel } from './util';

export interface BarChartProps {
  data: { x: string; y: number }[];
  height?: number;
  color?: string;
  yFormat?: (n: number) => string;
  /** Show every Nth x label (default 1 = all). */
  labelEvery?: number;
  /** Render the last bar in full accent, the rest muted. */
  highlightLast?: boolean;
}

const PAD_L = 40;
const PAD_R = 8;
const PAD_T = 16;
const PAD_B = 20;

/** Baseline-zero column chart: 4px rounded tops, 2px gaps, hairline grid. */
export function BarChart({
  data,
  height = 180,
  color,
  yFormat,
  labelEvery = 1,
  highlightLast,
}: BarChartProps) {
  const [w, setW] = useState(0);
  const fill = color ?? chart.series[0];
  const fmt = yFormat ?? fmtCompact;
  const n = data.length;

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

    return (
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
          const muted = Boolean(highlightLast) && i !== n - 1;
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

        {/* selective value label on the highlighted/max bar */}
        {data[labelIdx].y > 0 ? (
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
    );
  })();

  return (
    <View style={{ width: '100%', height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {body}
    </View>
  );
}
