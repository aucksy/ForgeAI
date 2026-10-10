import { useState } from 'react';
import { Text, View } from 'react-native';

import { EmptyState, GhostButton } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { color, space, type } from '@/theme/tokens';
import { DateLineChart } from '@/tracker/components/DateLineChart';
import { InfoHeading } from '@/tracker/components/InfoHeading';
import { strengthEmpty } from '@/tracker/engine/progressTop';

import { InspectReadout, Section } from './Section';

export interface StrengthSectionProps {
  data: { dateISO: string; score: number }[];
  /** Any weigh-in ever (PG-08: without one there is no score — say so). */
  hasBodyWeight: boolean;
  onAddWeight: () => void;
  index: number;
}

/** Strength score trend (0-100 composite of key-lift estimated 1-rep maxes vs body weight). */
export function StrengthSection({ data, hasBodyWeight, onAddWeight, index }: StrengthSectionProps) {
  const [inspect, setInspect] = useState<{ x: string; y: number } | null>(null);

  // SH-08 / PG-07: a score of 0 means "can't be worked out yet" (no body weight, or no key
  // lift by then) — it is never drawn, so the line starts at the first real score.
  const scored = data.filter((d) => d.score > 0);
  const hasData = scored.length > 0;
  const latest = hasData ? scored[scored.length - 1].score : 0;
  const empty = strengthEmpty(hasBodyWeight);

  const right = inspect ? (
    <InspectReadout value={`${Math.round(inspect.y)}`} sub={tinyDate(inspect.x)} />
  ) : hasData ? (
    <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.accentBright }}>
      {Math.round(latest)}
      <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkMuted }}>/100</Text>
    </Text>
  ) : undefined;

  return (
    <Section index={index}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <InfoHeading
            title="Strength score"
            info="Your bench press, squat, deadlift, overhead press and row, each as an estimated 1-rep max against your body weight, scored 0 to 100."
          />
        </View>
        <View style={{ minHeight: 48, justifyContent: 'center' }}>{right}</View>
      </View>
      {hasData ? (
        <DateLineChart
          data={scored.map((d) => ({ x: d.dateISO, y: d.score }))}
          height={150}
          fillGradient
          yFormat={(n) => `${Math.round(n)}`}
          onInspect={setInspect}
        />
      ) : (
        <View>
          <EmptyState icon="trend" title={empty.title} body={empty.body} />
          {empty.action === 'weight' ? <GhostButton label="Add body weight" icon="scale" onPress={onAddWeight} /> : null}
        </View>
      )}
    </Section>
  );
}
