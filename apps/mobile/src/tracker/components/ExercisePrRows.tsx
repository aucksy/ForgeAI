/** Personal records (heaviest weight, best est. 1RM) + xRM "Set Records" for one exercise. Tap a record → its session. */
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, Icon, SectionHeader } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { color, motion, space, type } from '@/theme/tokens';
import type { XrmRecord } from '@/tracker/services/exerciseAnalytics';
import type { PersonalRecord, UnitSystem } from '@/types/models';

export interface ExercisePrRowsProps {
  prs: PersonalRecord[];
  ladder: XrmRecord[];
  units: UnitSystem;
  onOpenSession: (sessionId: string) => void;
}

/** "12 Jun" for the current year, else "12 Jun 2024" (records can be old). */
function recDate(iso: string): string {
  const year = iso.slice(0, 4);
  const nowYear = String(new Date().getFullYear());
  return year === nowYear ? tinyDate(iso) : `${tinyDate(iso)} ${year}`;
}

function bestOf(list: PersonalRecord[], kind: PersonalRecord['kind']): PersonalRecord | null {
  let best: PersonalRecord | null = null;
  for (const p of list) {
    if (p.kind === kind && (best === null || p.value > best.value)) best = p;
  }
  return best;
}

function RecordRow({
  icon,
  label,
  value,
  sub,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}. Open session.`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: color.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={16} color={color.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{label}</Text>
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{sub}</Text>
      </View>
      <Text style={{ fontFamily: type.mono, fontSize: type.size.body, color: color.ink }}>{value}</Text>
      <Icon name="chevron-right" size={16} color={color.inkMuted} />
    </Pressable>
  );
}

export function ExercisePrRows({ prs, ladder, units, onOpenSession }: ExercisePrRowsProps) {
  const unit = weightUnit(units);
  const weightPr = useMemo(() => bestOf(prs, 'weight'), [prs]);
  const e1rmPr = useMemo(() => bestOf(prs, 'e1rm'), [prs]);

  if (weightPr === null && e1rmPr === null && ladder.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.duration(motion.slow).delay(160)} style={{ marginTop: space.xl }}>
      <SectionHeader title="Records" />
      <Card>
        {weightPr ? (
          <RecordRow
            icon="trophy"
            label="Heaviest weight"
            value={`${trimNum(kgToDisplay(weightPr.weightKg, units))} ${unit}`}
            sub={`${weightPr.reps} reps · ${recDate(weightPr.dateISO)}`}
            onPress={() => onOpenSession(weightPr.sessionId)}
          />
        ) : null}
        {e1rmPr ? (
          <RecordRow
            icon="trend"
            label="Best est. 1RM"
            value={`${trimNum(kgToDisplay(e1rmPr.value, units))} ${unit}`}
            sub={recDate(e1rmPr.dateISO)}
            onPress={() => onOpenSession(e1rmPr.sessionId)}
          />
        ) : null}

        {ladder.length > 0 ? (
          <>
            <View style={{ height: 1, backgroundColor: color.border, marginVertical: space.sm }} />
            <Text
              style={{
                fontFamily: type.heading,
                fontSize: type.size.sub,
                color: color.inkSecondary,
                marginBottom: space.xs,
              }}
            >
              Set records
            </Text>
            {ladder.map((r) => (
              <RecordRow
                key={`x-${r.reps}`}
                icon="target"
                label={`${r.reps} ${r.reps === 1 ? 'rep' : 'reps'}`}
                value={`${trimNum(kgToDisplay(r.weightKg, units))} ${unit}`}
                sub={recDate(r.dateISO)}
                onPress={() => onOpenSession(r.sessionId)}
              />
            ))}
          </>
        ) : null}
      </Card>
    </Animated.View>
  );
}
