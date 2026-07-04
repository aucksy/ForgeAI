import { HBarList } from '@/components/charts';
import { EmptyState } from '@/components/ui';
import { fmtCompact, fmtInt } from '@/lib/format';
import type { MuscleVolumeSlice } from '@/types/models';

import { HeaderStat, Section } from './Section';
import { capitalize } from './util';

export interface MuscleSectionProps {
  data: MuscleVolumeSlice[];
  index: number;
}

const MAX_ROWS = 8;

/** Volume by muscle group over the range — one hue, identity in the labels. */
export function MuscleSection({ data, index }: MuscleSectionProps) {
  const slices = data.filter((m) => m.volumeKg > 0).slice(0, MAX_ROWS);
  const totalSets = slices.reduce((sum, m) => sum + m.sets, 0);

  return (
    <Section
      title="Muscle Group Volume"
      index={index}
      right={slices.length > 0 ? <HeaderStat text={`${fmtInt(totalSets)} sets`} /> : undefined}
    >
      {slices.length > 0 ? (
        <HBarList
          data={slices.map((m) => ({ label: capitalize(m.muscleGroup), value: m.volumeKg }))}
          valueFormat={(n) => `${fmtCompact(n)} kg`}
        />
      ) : (
        <EmptyState
          icon="zap"
          title="No data yet"
          body="Muscle-by-muscle volume appears once workouts are logged."
        />
      )}
    </Section>
  );
}
