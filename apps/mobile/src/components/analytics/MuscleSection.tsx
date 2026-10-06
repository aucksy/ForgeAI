import { HBarList } from '@/components/charts';
import { EmptyState } from '@/components/ui';
import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import { fmtSets, type MuscleSetsSlice } from '@/tracker/engine/volume';

import { HeaderStat, Section } from './Section';

export interface MuscleSectionProps {
  data: MuscleSetsSlice[];
  index: number;
}

const MAX_ROWS = 10;

/**
 * Working sets per muscle over the range (Phase 2: finer muscles — front, side and rear
 * shoulders and more). A set counts fully for the muscle it mainly trains and half for
 * the ones helping (a bench set = 1 chest, ½ triceps, ½ front shoulders). Timed and
 * distance sets count as sets too, so a plank shows on the abs.
 */
export function MuscleSection({ data, index }: MuscleSectionProps) {
  const slices = data.filter((m) => m.sets > 0).slice(0, MAX_ROWS);
  const muscles = data.filter((m) => m.sets > 0).length;

  return (
    <Section
      title="Sets per Muscle"
      index={index}
      right={slices.length > 0 ? <HeaderStat text={`${muscles} muscles`} /> : undefined}
    >
      {slices.length > 0 ? (
        <HBarList
          data={slices.map((m) => ({ label: MUSCLE_LABEL[m.muscle], value: m.sets }))}
          valueFormat={(n) => `${fmtSets(n)} sets`}
        />
      ) : (
        <EmptyState icon="zap" title="No data yet" body="Sets for each muscle appear once workouts are logged." />
      )}
    </Section>
  );
}
