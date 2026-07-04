import { useState } from 'react';
import { Text } from 'react-native';

import { LineChart } from '@/components/charts';
import { EmptyState } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { color, type } from '@/theme/tokens';

import { InspectReadout, Section } from './Section';

export interface StrengthSectionProps {
  data: { dateISO: string; score: number }[];
  index: number;
}

/** Strength score trend (0-100 composite of key-lift e1RM vs body weight). */
export function StrengthSection({ data, index }: StrengthSectionProps) {
  const [inspect, setInspect] = useState<{ x: string; y: number } | null>(null);

  const hasData = data.some((d) => d.score > 0);
  const latest = data.length > 0 ? data[data.length - 1].score : 0;

  const right = inspect ? (
    <InspectReadout value={`${Math.round(inspect.y)}`} sub={tinyDate(inspect.x)} />
  ) : hasData ? (
    <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.accentBright }}>
      {Math.round(latest)}
      <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkMuted }}>
        /100
      </Text>
    </Text>
  ) : undefined;

  return (
    <Section
      title="Strength Progress"
      index={index}
      right={right}
      caption={hasData ? 'Key-lift e1RM relative to body weight, scored 0-100.' : undefined}
    >
      {hasData ? (
        <LineChart
          data={data.map((d) => ({ x: d.dateISO, y: d.score }))}
          height={150}
          fillGradient
          yFormat={(n) => `${Math.round(n)}`}
          onInspect={setInspect}
        />
      ) : (
        <EmptyState
          icon="trend"
          title="No data yet"
          body="Log the big lifts — bench, squat, deadlift — to score your strength."
        />
      )}
    </Section>
  );
}
