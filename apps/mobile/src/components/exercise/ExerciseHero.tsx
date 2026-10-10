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
 * Hero stat row: Heaviest weight / Est. 1-rep max / Avg weight / Avg reps as compact tiles.
 * Packet B (Phase 7): the two records carry the medal; the two averages carry no icon.
 * Full-bleed horizontal scroll so long values ("82.5 kg × 8") never wrap.
 *
 * Phase 3: the first tile was called "Best set" but shows the HEAVIEST set; "Best set" is
 * now a record of its own (most volume in one set, Hevy's meaning), so the tile says what
 * it shows — now "Heaviest weight" (design language: never "heaviest set").
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
        <StatTile label="Heaviest weight" value={bestValue} icon="medal" />
      </View>
      <View style={{ minWidth: 118 }}>
        <StatTile
          label="Est. 1-rep max"
          value={round1(kgToDisplay(stats.prE1rmKg ?? 0, units))}
          unit={unit}
          icon="medal"
        />
      </View>
      <View style={{ minWidth: 118 }}>
        <StatTile
          label="Avg weight"
          value={round1(kgToDisplay(stats.avgWeightKg ?? 0, units))}
          unit={unit}
        />
      </View>
      <View style={{ minWidth: 112 }}>
        <StatTile label="Avg reps" value={round1(stats.avgReps ?? 0)} />
      </View>
    </ScrollView>
  );
}
