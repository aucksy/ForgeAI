import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { chart } from '@/theme/tokens';

import { barTopPath } from './util';

export interface MiniBarsProps {
  data: number[];
  /** Fixed width; omit to fill the parent via onLayout. */
  width?: number;
  height?: number;
  color?: string;
}

/** Tiny baseline-zero bars for stat tiles; latest bar in full accent. */
export function MiniBars({ data, width, height = 34, color }: MiniBarsProps) {
  const [measured, setMeasured] = useState(0);
  const w = width ?? measured;
  const fill = color ?? chart.series[0];
  const n = data.length;

  const body = (() => {
    if (w === 0 || n === 0) return null;
    let max = 0;
    for (const v of data) if (v > max) max = v;
    const safeMax = max || 1;
    const slot = w / n;
    const barW = Math.min(14, Math.max(2, slot - chart.barGap));
    return (
      <Svg width={w} height={height}>
        {data.map((v, i) => {
          const h = v <= 0 ? 0 : Math.max(2, (v / safeMax) * (height - 2));
          const x = slot * i + (slot - barW) / 2;
          return (
            <Path
              key={i}
              d={barTopPath(x, height - h, barW, h, 3)}
              fill={fill}
              fillOpacity={i === n - 1 ? 1 : 0.38}
            />
          );
        })}
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
