import { useState } from 'react';

import { LineChart } from '@/components/charts';
import { EmptyState } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { fmtCompact, fmtInt } from '@/lib/format';
import type { NutritionDay } from '@/types/models';

import { HeaderStat, InspectReadout, Section } from './Section';
import { trimLeading } from './util';

export interface CaloriesSectionProps {
  data: NutritionDay[];
  /** Daily calorie target from the user profile (dashed reference line). */
  target: number | null;
  index: number;
}

/** Daily calories vs target — crosshair scrubbing shows the exact day. */
export function CaloriesSection({ data, target, index }: CaloriesSectionProps) {
  const [inspect, setInspect] = useState<{ x: string; y: number } | null>(null);

  const points = trimLeading(data, (d) => d.calories <= 0);
  const hasData = points.some((d) => d.calories > 0);

  const right = inspect ? (
    <InspectReadout value={`${fmtInt(inspect.y)} kcal`} sub={tinyDate(inspect.x)} />
  ) : hasData && target !== null ? (
    <HeaderStat text={`target ${fmtInt(target)}`} />
  ) : undefined;

  return (
    <Section title="Calories" index={index} right={right}>
      {hasData ? (
        <LineChart
          data={points.map((d) => ({ x: d.dateISO, y: d.calories }))}
          fillGradient
          yFormat={fmtCompact}
          target={target ?? undefined}
          onInspect={setInspect}
        />
      ) : (
        <EmptyState
          icon="meal"
          title="No data yet"
          body="Log meals with the coach — even “2 rotis and dal” — to track intake."
        />
      )}
    </Section>
  );
}
