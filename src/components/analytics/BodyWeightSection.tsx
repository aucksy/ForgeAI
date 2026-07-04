import { useState } from 'react';
import { Text, View } from 'react-native';

import { DeltaPill, LineChart } from '@/components/charts';
import { AnimatedNumber, EmptyState } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { color, space, type } from '@/theme/tokens';

import { InspectReadout, Section } from './Section';

export interface BodyWeightSectionProps {
  data: { dateISO: string; weightKg: number }[];
  index: number;
}

/** Body-weight trend: hero current weight + delta vs range start + crosshair line. */
export function BodyWeightSection({ data, index }: BodyWeightSectionProps) {
  const [inspect, setInspect] = useState<{ x: string; y: number } | null>(null);

  if (data.length === 0) {
    return (
      <Section title="Body Weight" index={index}>
        <EmptyState
          icon="scale"
          title="No data yet"
          body="Tell the coach your weight — “logged 76.4 kg today” — and the trend appears here."
        />
      </Section>
    );
  }

  const current = data[data.length - 1].weightKg;
  const start = data[0].weightKg;
  const delta = Math.round((current - start) * 10) / 10;

  return (
    <Section
      title="Body Weight"
      index={index}
      right={
        inspect ? (
          <InspectReadout value={`${trimNum(inspect.y)} kg`} sub={tinyDate(inspect.x)} />
        ) : undefined
      }
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: space.lg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs + 2 }}>
          <AnimatedNumber
            value={current}
            format={(n) => trimNum(n)}
            style={{ fontSize: type.size.h1 }}
          />
          <Text
            style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}
          >
            kg now
          </Text>
        </View>
        <DeltaPill value={delta} suffix=" kg" />
      </View>
      <LineChart
        data={data.map((d) => ({ x: d.dateISO, y: d.weightKg }))}
        fillGradient
        yFormat={(n) => trimNum(n)}
        onInspect={setInspect}
      />
    </Section>
  );
}
