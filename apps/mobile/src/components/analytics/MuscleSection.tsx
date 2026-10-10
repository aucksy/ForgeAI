import { HBarList } from '@/components/charts';
import { EmptyState } from '@/components/ui';
import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import { countWord } from '@/lib/words';
import { musclesForList } from '@/tracker/engine/progressTop';
import { setsText, type MuscleSetsSlice } from '@/tracker/engine/volume';

import { HeaderStat, Section } from './Section';

export interface MuscleSectionProps {
  data: MuscleSetsSlice[];
  index: number;
}

const MAX_ROWS = 10;

/**
 * Working sets per finer muscle over the range (Phase 2: finer muscles — front, side and rear
 * shoulders and more). A set counts fully for the muscle it mainly trains and half for
 * the ones helping (a bench set = 1 chest, ½ triceps, ½ front shoulders). Timed sets count
 * too, so a plank shows on the abs. PG-28: cardio is not a muscle here, as on the report.
 */
export function MuscleSection({ data, index }: MuscleSectionProps) {
  const muscles = musclesForList(data);
  const slices = muscles.slice(0, MAX_ROWS);

  return (
    <Section title="Sets per muscle" index={index} right={slices.length > 0 ? <HeaderStat text={countWord(muscles.length, 'muscle')} /> : undefined}>
      {slices.length > 0 ? (
        <HBarList data={slices.map((m) => ({ label: MUSCLE_LABEL[m.muscle], value: m.sets }))} valueFormat={(n) => setsText(n)} />
      ) : (
        <EmptyState icon="zap" title="No sets in this range" body="Sets for each muscle show once you do a workout." />
      )}
    </Section>
  );
}
