import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DeltaPill } from '@/components/charts';
import { AnimatedNumber, Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { kgToShown, weightUnitOf } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, space, type } from '@/theme/tokens';
import { DateLineChart } from '@/tracker/components/DateLineChart';
import { weightChange, weightChangeShown, weightChangeTone, weightSpanText } from '@/tracker/engine/headline';
import { bodyWeightSub } from '@/tracker/engine/progressTop';
import { todayISO } from '@/lib/date';
import type { Goal } from '@/types/models';

import { InspectReadout, Section } from './Section';

export interface BodyWeightSectionProps {
  data: { dateISO: string; weightKg: number }[];
  index: number;
  /** Phase 3: "Waist 81 cm" — the latest measurement, or null when none is logged. */
  measureLine: string | null;
  photoCount: number;
  /** The newest weigh-in ever (PG-25: "Log it" only when there is none at all). */
  lastWeighIn: { dateISO: string; weightKg: number } | null;
  onWeight: () => void;
  onMeasurements: () => void;
  onPhotos: () => void;
  /** The member's goal: the change's colour follows it (PG-10). */
  goal?: Goal | null;
}

function LinkRow({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, minHeight: 48 }}
    >
      <Icon name={icon} size={18} color={color.accent} />
      <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{title}</Text>
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>{sub}</Text>
      <Icon name="chevron-right" size={16} color={color.inkMuted} />
    </Pressable>
  );
}

/**
 * Body: the weight trend (points at their real dates), then the way into measurements and
 * progress photos (Phase 3).
 */
export function BodyWeightSection({ data, index, measureLine, photoCount, lastWeighIn, onWeight, onMeasurements, onPhotos, goal }: BodyWeightSectionProps) {
  const [inspect, setInspect] = useState<{ x: string; y: number } | null>(null);
  // v0.27.0: kg or lb (stored kg). The chart is drawn in the shown unit.
  const units = useUnits();
  const unit = weightUnitOf(units);
  const has = data.length > 0;
  const current = has ? data[data.length - 1].weightKg : 0;
  // PG-11: the one body-weight rule, always with its span ("+3.6 kg in 90 days").
  const change = weightChange(data);

  return (
    <Section
      index={index}
      right={inspect ? <InspectReadout value={`${trimNum(inspect.y)} ${unit}`} sub={tinyDate(inspect.x)} /> : undefined}
    >
      {has ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs + 2 }}>
              <AnimatedNumber key={units} value={current} format={(n) => trimNum(kgToShown(n, units))} style={{ fontSize: type.size.h1 }} />
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>{unit} now</Text>
            </View>
            {change ? (
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <DeltaPill value={weightChangeShown(change, units)} suffix={` ${unit}`} tone={weightChangeTone(change.changeKg, goal)} />
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{weightSpanText(change)}</Text>
              </View>
            ) : null}
          </View>
          <DateLineChart data={data.map((d) => ({ x: d.dateISO, y: kgToShown(d.weightKg, units) }))} fillGradient yFormat={(n) => trimNum(n)} onInspect={setInspect} />
          <View style={{ height: 1, backgroundColor: color.border, marginVertical: space.md }} />
          <LinkRow icon="scale" title="Body weight" sub="Log today's" onPress={onWeight} />
        </>
      ) : (
        <LinkRow icon="scale" title="Body weight" sub={bodyWeightSub(0, lastWeighIn, units, todayISO()) ?? 'Log it'} onPress={onWeight} />
      )}
      <LinkRow icon="target" title="Measurements" sub={measureLine ?? 'Log them'} onPress={onMeasurements} />
      <LinkRow icon="camera" title="Progress photos" sub={photoCount > 0 ? String(photoCount) : 'Add one'} onPress={onPhotos} />
    </Section>
  );
}
