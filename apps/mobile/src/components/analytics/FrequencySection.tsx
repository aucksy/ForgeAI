import { BarChart } from '@/components/charts';
import { EmptyState } from '@/components/ui';
import { trimNum } from '@/lib/format';
import { chart } from '@/theme/tokens';

import { HeaderStat, Section } from './Section';
import { labelStep, trimLeading } from './util';

export interface FrequencySectionProps {
  data: { weekISO: string; sessions: number }[];
  index: number;
}

/** Sessions per week — shows the training rhythm at a glance. */
export function FrequencySection({ data, index }: FrequencySectionProps) {
  const points = trimLeading(data, (d) => d.sessions <= 0);
  const hasData = points.some((d) => d.sessions > 0);
  const total = points.reduce((sum, d) => sum + d.sessions, 0);
  const avg = points.length > 0 ? total / points.length : 0;

  return (
    <Section
      title="Workout Frequency"
      index={index}
      right={hasData ? <HeaderStat text={`${trimNum(avg)}/wk avg`} /> : undefined}
    >
      {hasData ? (
        <BarChart
          data={points.map((d) => ({ x: d.weekISO, y: d.sessions }))}
          height={150}
          color={chart.series[0]}
          yFormat={(n) => `${Math.round(n)}`}
          labelEvery={Math.max(2, labelStep(points.length))}
        />
      ) : (
        <EmptyState
          icon="calendar"
          title="No data yet"
          body="Each training week shows up as a bar once you start logging."
        />
      )}
    </Section>
  );
}
