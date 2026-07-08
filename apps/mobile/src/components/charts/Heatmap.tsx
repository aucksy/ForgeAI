import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { fromISO } from '@/lib/date';
import { chart, color as palette, space, type } from '@/theme/tokens';
import type { ConsistencyCell } from '@/types/models';

export interface HeatmapProps {
  /** Every day present, ascending (see workoutRepo.getConsistency). */
  cells: ConsistencyCell[];
  weeks: number;
}

/** level 0 recedes into the surface; 1..4 climb the ember ramp. */
const LEVEL_FILL: Record<ConsistencyCell['level'], string> = {
  0: palette.surfaceSunken,
  1: chart.ramp[1],
  2: chart.ramp[3],
  3: chart.ramp[4],
  4: chart.ramp[5],
};

const GAP = 3;
const DAY_GUTTER = 18;
const DAY_HINTS: { row: number; label: string }[] = [
  { row: 0, label: 'M' },
  { row: 2, label: 'W' },
  { row: 4, label: 'F' },
];

/** GitHub-style consistency grid: columns = weeks (Mon-Sun rows). */
export function Heatmap({ cells, weeks }: HeatmapProps) {
  const [w, setW] = useState(0);

  // Row offset of the first cell (Mon = row 0).
  const first = cells[0];
  const offset = first ? (fromISO(first.dateISO).getDay() + 6) % 7 : 0;

  // Derive column count from the actual data, not just the weeks prop: cells are
  // ascending, so trusting `weeks` alone would cull the NEWEST days (incl. today)
  // whenever offset pushes the last cells past weeks*7. Cell size flows from cols,
  // so the grid simply shrinks to fit.
  const cols = Math.max(1, weeks, Math.ceil((offset + cells.length) / 7));
  const gridW = Math.max(0, w - DAY_GUTTER);
  const cell = Math.min(16, (gridW - (cols - 1) * GAP) / cols);
  const gridH = cell * 7 + GAP * 6;
  const rx = Math.min(3, cell / 3);

  const body =
    w === 0 || cells.length === 0 || cell <= 0 ? null : (
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: DAY_GUTTER, height: gridH }}>
          {DAY_HINTS.map((h) => (
            <Text
              key={h.label}
              style={{
                position: 'absolute',
                top: h.row * (cell + GAP) + cell / 2 - 6,
                fontFamily: type.mono,
                fontSize: 9,
                color: palette.inkMuted,
              }}
            >
              {h.label}
            </Text>
          ))}
        </View>
        <Svg width={gridW} height={gridH}>
          {cells.map((c, i) => {
            const pos = offset + i;
            const col = Math.floor(pos / 7);
            const row = pos % 7;
            if (col >= cols) return null;
            return (
              <Rect
                key={c.dateISO}
                x={col * (cell + GAP)}
                y={row * (cell + GAP)}
                width={cell}
                height={cell}
                rx={rx}
                fill={LEVEL_FILL[c.level]}
              />
            );
          })}
        </Svg>
      </View>
    );

  return (
    <View style={{ width: '100%' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {body}
      {/* legend: Less -> More */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 4,
          marginTop: space.sm,
        }}
      >
        <Text
          style={{
            fontFamily: type.mono,
            fontSize: 9,
            color: palette.inkMuted,
            marginRight: 2,
          }}
        >
          Less
        </Text>
        {([0, 1, 2, 3, 4] as const).map((lvl) => (
          <View
            key={lvl}
            style={{ width: 9, height: 9, borderRadius: 2.5, backgroundColor: LEVEL_FILL[lvl] }}
          />
        ))}
        <Text
          style={{
            fontFamily: type.mono,
            fontSize: 9,
            color: palette.inkMuted,
            marginLeft: 2,
          }}
        >
          More
        </Text>
      </View>
    </View>
  );
}
