import { BarChart } from '@/components/charts';
import { EmptyState } from '@/components/ui';
import { fmtInt } from '@/lib/format';
import { kgToShown, weightUnitOf } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import type { VolumePoint } from '@/types/models';

import { HeaderStat, Section } from './Section';
import { labelStep, trimLeading } from './util';

export interface VolumeSectionProps {
  data: VolumePoint[];
  index: number;
}

/** Weekly training volume — last week highlighted in full ember. */
export function VolumeSection({ data, index }: VolumeSectionProps) {
  const units = useUnits(); // v0.27.0: kg or lb
  const points = trimLeading(data, (d) => d.volumeKg <= 0);
  const hasData = points.some((d) => d.volumeKg > 0);
  const total = points.reduce((sum, d) => sum + d.volumeKg, 0);

  return (
    <Section
      title="Weekly Volume"
      index={index}
      right={hasData ? <HeaderStat text={`${fmtInt(kgToShown(total, units))} ${weightUnitOf(units)} lifted`} /> : undefined}
    >
      {hasData ? (
        <BarChart
          data={points.map((d) => ({ x: d.dateISO, y: kgToShown(d.volumeKg, units) }))}
          highlightLast
          labelEvery={labelStep(points.length)}
        />
      ) : (
        <EmptyState
          icon="dumbbell"
          title="No data yet"
          body="Logged workouts stack up here, week by week."
        />
      )}
    </Section>
  );
}
