import { ScrollView, View } from 'react-native';

import { StatTile } from '@/components/ui';
import { kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { space } from '@/theme/tokens';
import type { ExerciseStats, UnitSystem } from '@/types/models';

export interface ExerciseHeroProps {
  stats: ExerciseStats;
  units: UnitSystem;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Hero stat row: Best set / PR e1RM / Avg weight / Avg reps as compact tiles.
 * Full-bleed horizontal scroll so long values ("82.5 kg × 8") never wrap.
 */
export function ExerciseHero({ stats, units }: ExerciseHeroProps) {
  const unit = weightUnit(units);
  const best = stats.bestSet;

  const bestValue = best
    ? `${trimNum(kgToDisplay(best.weightKg, units))} ${unit} × ${best.reps}`
    : '—';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -space.screenX }}
      contentContainerStyle={{ paddingHorizontal: space.screenX, gap: space.md }}
    >
      <View style={{ minWidth: 132 }}>
        <StatTile label="Best set" value={bestValue} icon="dumbbell" />
      </View>
      <View style={{ minWidth: 118 }}>
        <StatTile
          label="PR e1RM"
          value={round1(kgToDisplay(stats.prE1rmKg ?? 0, units))}
          unit={unit}
          icon="trophy"
        />
      </View>
      <View style={{ minWidth: 118 }}>
        <StatTile
          label="Avg weight"
          value={round1(kgToDisplay(stats.avgWeightKg ?? 0, units))}
          unit={unit}
          icon="scale"
        />
      </View>
      <View style={{ minWidth: 112 }}>
        <StatTile label="Avg reps" value={round1(stats.avgReps ?? 0)} icon="target" />
      </View>
    </ScrollView>
  );
}
