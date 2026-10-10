import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, Icon } from '@/components/ui';
import { fmtInt } from '@/lib/format';
import { useUnits } from '@/lib/useUnits';
import { color, motion, space, type } from '@/theme/tokens';
import { todayISO } from '@/lib/date';
import { topLiftText, usualByText, type WeekVsUsual } from '@/tracker/engine/progressTop';

export interface WeekCardProps {
  week: WeekVsUsual;
  onOpenExercise: (exerciseId: string) => void;
}

function Stat({ value, label, sub }: { value: string; label: string; sub: string | null }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h2, color: color.ink }}>{value}</Text>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>{label}</Text>
      {sub ? <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{sub}</Text> : null}
    </View>
  );
}

/**
 * The answer first (audit Phase 5, UX-1): this week against the member's usual week —
 * workouts, working sets, lifts that beat a best (D10) — and the lift that went up most.
 * Review fix (Phase 5): "so far" against the usual week up to the same weekday ("usually 1 by
 * Wednesday"); before, Monday's numbers were set against a whole week and always read behind.
 */
export function WeekCard({ week, onOpenExercise }: WeekCardProps) {
  const units = useUnits();
  const { week: w, usual, usualByNow, topLift } = week;
  const today = todayISO();
  const by = usual && usualByNow ? usualByNow : null;
  return (
    <Animated.View entering={FadeInDown.duration(motion.slow)} style={{ marginBottom: space.xl }}>
      <Card style={{ gap: space.lg }}>
        <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          This week so far vs your usual
        </Text>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Stat value={fmtInt(w.workouts)} label={w.workouts === 1 ? 'workout' : 'workouts'} sub={by ? usualByText(by.workouts, today) : null} />
          <Stat value={fmtInt(w.sets)} label={w.sets === 1 ? 'set' : 'sets'} sub={by ? usualByText(by.sets, today) : null} />
          <Stat value={fmtInt(w.liftsUp)} label={w.liftsUp === 1 ? 'lift up' : 'lifts up'} sub="beat a best" />
        </View>
        {!usual ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>Your usual week shows after your first full week.</Text>
        ) : null}
        {topLift ? (
          <Pressable
            onPress={() => onOpenExercise(topLift.exerciseId)}
            accessibilityRole="button"
            accessibilityLabel={`Up most: ${topLift.name}. ${topLiftText(topLift, units)}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              minHeight: 48,
              paddingTop: space.md,
              borderTopWidth: 1,
              borderTopColor: color.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="trend" size={18} color={color.accentBright} />
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
                Up most: {topLift.name}
              </Text>
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkSecondary, marginTop: 2 }}>
                {topLiftText(topLift, units)}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={color.inkMuted} />
          </Pressable>
        ) : null}
      </Card>
    </Animated.View>
  );
}
