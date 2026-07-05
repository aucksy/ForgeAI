import { useState } from 'react';

import { LineChart } from '@/components/charts';
import { EmptyState } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { fmtCompact, fmtInt } from '@/lib/format';
import type { NutritionDay } from '@/types/models';

import { HeaderStat, InspectReadout, Section } from './Section';
import { trimLeading } from './util';

export interface ProteinSectionProps {
  data: NutritionDay[];
  /** Daily protein target (g) from the user profile (dashed reference line). */
  target: number | null;
  index: number;
}

/** Daily protein (g) vs target — the seed ramps this 120 -> 158g over 13 weeks. */
export function ProteinSection({ data, target, index }: ProteinSectionProps) {
  const [inspect, setInspect] = useState<{ x: string; y: number } | null>(null);

  const points = trimLeading(data, (d) => d.proteinG <= 0);
  const hasData = points.some((d) => d.proteinG > 0);

  const right = inspect ? (
    <InspectReadout value={`${fmtInt(inspect.y)} g`} sub={tinyDate(inspect.x)} />
  ) : hasData && target !== null ? (
    <HeaderStat text={`target ${fmtInt(target)}g`} />
  ) : undefined;

  return (
    <Section title="Protein" index={index} right={right}>
      {hasData ? (
        <LineChart
          data={points.map((d) => ({ x: d.dateISO, y: d.proteinG }))}
          fillGradient
          yFormat={(n) => `${fmtCompact(n)}g`}
          target={target ?? undefined}
          onInspect={setInspect}
        />
      ) : (
        <EmptyState
          icon="meal"
          title="No data yet"
          body="Log protein-rich meals with the coach and your daily trend appears here."
        />
      )}
    </Section>
  );
}
