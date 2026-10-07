/**
 * The exercise's records (Phase 3: every kind it keeps — heaviest weight, best 1-rep max,
 * best set, best session, most reps, longest time, longest distance) + the xRM "Set Records"
 * ladder for weight exercises. Tap a record → the workout it was set in.
 */
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, Icon, SectionHeader } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { color, motion, space, type } from '@/theme/tokens';
import { RECORD_LABEL, type RecordHit, type RecordKind } from '@/tracker/engine/records';
import type { XrmRecord } from '@/tracker/services/exerciseAnalytics';
import { recordDetailText, recordValueText, type RecordTextContext } from '@/tracker/services/recordText';
import type { UnitSystem } from '@/types/models';

export interface ExercisePrRowsProps {
  bests: RecordHit[];
  ctx: RecordTextContext;
  ladder: XrmRecord[];
  units: UnitSystem;
  onOpenSession: (sessionId: string) => void;
}

const ICON: Record<RecordKind, IconName> = {
  weight: 'trophy',
  e1rm: 'trend',
  best_set: 'dumbbell',
  best_session: 'flame',
  reps: 'target',
  duration: 'clock',
  distance: 'zap',
};

/** "12 Jun" for the current year, else "12 Jun 2024" (records can be old). */
function recDate(iso: string): string {
  const year = iso.slice(0, 4);
  const nowYear = String(new Date().getFullYear());
  return year === nowYear ? tinyDate(iso) : `${tinyDate(iso)} ${year}`;
}

function RecordRow({ icon, label, value, sub, onPress }: { icon: IconName; label: string; value: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}. Open the workout.`}
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
        <Text numberOfLines={1} style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
          {sub}
        </Text>
      </View>
      <Text style={{ fontFamily: type.mono, fontSize: type.size.body, color: color.ink }}>{value}</Text>
      <Icon name="chevron-right" size={16} color={color.inkMuted} />
    </Pressable>
  );
}

export function ExercisePrRows({ bests, ctx, ladder, units, onOpenSession }: ExercisePrRowsProps) {
  const unit = weightUnit(units);
  if (bests.length === 0 && ladder.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.duration(motion.slow).delay(160)} style={{ marginTop: space.xl }}>
      <SectionHeader title="Records" />
      <Card>
        {bests.map((b) => {
          const detail = recordDetailText(b, { ...ctx, units });
          return (
            <RecordRow
              key={b.kind}
              icon={ICON[b.kind]}
              label={RECORD_LABEL[b.kind]}
              value={recordValueText(b, { ...ctx, units })}
              sub={detail ? `${detail} · ${recDate(b.dateISO)}` : recDate(b.dateISO)}
              onPress={() => onOpenSession(b.sessionId)}
            />
          );
        })}

        {ladder.length > 0 ? (
          <>
            <View style={{ height: 1, backgroundColor: color.border, marginVertical: space.sm }} />
            <Text style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.inkSecondary, marginBottom: space.xs }}>
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
