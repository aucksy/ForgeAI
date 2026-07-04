import { useId, useState } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Stop,
} from 'react-native-svg';

import { chart, color as palette } from '@/theme/tokens';

import { areaPath, monotonePath, r2 } from './util';

export interface SparklineProps {
  data: number[];
  /** Fixed width; omit to fill the parent via onLayout. */
  width?: number;
  height?: number;
  color?: string;
}

/** Axis-less micro trend line with end dot + soft wash. */
export function Sparkline({ data, width, height = 36, color }: SparklineProps) {
  const [measured, setMeasured] = useState(0);
  const gradId = `sp${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const w = width ?? measured;
  const stroke = color ?? chart.series[0];
  const n = data.length;

  const body = (() => {
    if (w === 0 || n === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const v of data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const padX = 4;
    const padY = 5;
    const xFor = (i: number) => padX + (n === 1 ? (w - padX * 2) / 2 : (i / (n - 1)) * (w - padX * 2));
    const yFor = (v: number) => padY + (1 - (v - min) / (max - min)) * (height - padY * 2);
    const pts = data.map((v, i) => ({ x: xFor(i), y: yFor(v) }));
    const lastPt = pts[n - 1];

    return (
      <Svg width={w} height={height}>
        <Defs>
          <SvgGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity={0.14} />
            <Stop offset="1" stopColor={stroke} stopOpacity={0} />
          </SvgGradient>
        </Defs>
        <Path d={areaPath(pts, height - 1)} fill={`url(#${gradId})`} />
        <Path
          d={monotonePath(pts)}
          stroke={stroke}
          strokeWidth={chart.lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Circle
          cx={r2(lastPt.x)}
          cy={r2(lastPt.y)}
          r={3}
          fill={stroke}
          stroke={palette.surface}
          strokeWidth={2}
        />
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
