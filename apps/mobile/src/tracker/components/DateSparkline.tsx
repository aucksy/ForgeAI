/**
 * Axis-less micro trend line with points at their REAL dates (Phase 3) — the frozen
 * `components/charts/Sparkline` spaces points by index, so a week with no weigh-in looked
 * like a day. Same look: end dot and a soft wash.
 */
import { useId, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import { areaPath, monotonePath, r2 } from '@/components/charts/util';
import { chart, color as palette } from '@/theme/tokens';

import { dateXs } from '../lib/chartTime';

export interface DateSparklineProps {
  /** Oldest first; `x` is a 'YYYY-MM-DD' day. */
  data: { x: string; y: number }[];
  /** Fixed width; omit to fill the parent. */
  width?: number;
  height?: number;
  color?: string;
}

export function DateSparkline({ data, width, height = 36, color }: DateSparklineProps) {
  const [measured, setMeasured] = useState(0);
  const gradId = `ds${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const w = width ?? measured;
  const stroke = color ?? chart.series[0];
  const n = data.length;

  const body = (() => {
    if (w === 0 || n === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const d of data) {
      if (d.y < min) min = d.y;
      if (d.y > max) max = d.y;
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const padX = 4;
    const padY = 5;
    const xs = dateXs(
      data.map((d) => d.x),
      padX,
      w - padX * 2,
    );
    const yFor = (v: number) => padY + (1 - (v - min) / (max - min)) * (height - padY * 2);
    const pts = data.map((d, i) => ({ x: xs[i], y: yFor(d.y) }));
    const lastPt = pts[n - 1];
    return (
      <Svg width={w} height={height}>
        <Defs>
          <SvgGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity={0.14} />
            <Stop offset="1" stopColor={stroke} stopOpacity={0} />
          </SvgGradient>
        </Defs>
        {n > 1 ? <Path d={areaPath(pts, height - 1)} fill={`url(#${gradId})`} /> : null}
        <Path d={monotonePath(pts)} stroke={stroke} strokeWidth={chart.lineWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Circle cx={r2(lastPt.x)} cy={r2(lastPt.y)} r={3} fill={stroke} stroke={palette.surface} strokeWidth={2} />
      </Svg>
    );
  })();

  return (
    <View
      style={{ width: width ?? '100%', height }}
      onLayout={width === undefined ? (e) => setMeasured(e.nativeEvent.layout.width) : undefined}
    >
      {body}
    </View>
  );
}
