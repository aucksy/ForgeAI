import { Text, View } from 'react-native';

import { Badge } from '@/components/ui';
import type { BadgeProps } from '@/components/ui';
import { trimNum } from '@/lib/format';
import { color, space, type } from '@/theme/tokens';

import type { PlanTargetView, WorkoutPlanView } from '../payload';
import { CardShell, Divider } from './CardShell';

const ACTION_BADGE: Record<PlanTargetView['action'], { label: string; tone: BadgeProps['tone'] }> =
  {
    increase: { label: 'Progress', tone: 'accent' },
    hold: { label: 'Hold', tone: 'neutral' },
    deload: { label: 'Deload', tone: 'warn' },
    start: { label: 'Start', tone: 'good' },
  };

function repRange(min: number, max: number): string {
  return min === max ? `${min}` : `${min}–${max}`;
}

/**
 * The flagship card: per-exercise Last / Target / Reason rows with a
 * progressive-overload action badge.
 */
export function WorkoutPlanCard({ plan }: { plan: WorkoutPlanView }) {
  return (
    <CardShell
      icon="dumbbell"
      title={plan.dayName}
      subtitle={`${plan.targets.length} exercises · overload targets`}
    >
      <Divider mt={space.lg} mb={0} />
      {plan.targets.map((t, i) => {
        const badge = ACTION_BADGE[t.action];
        const isLast = i === plan.targets.length - 1;
        return (
          <View
            key={`${t.exerciseName}-${i}`}
            style={{
              paddingTop: space.md + 2,
              paddingBottom: isLast ? 0 : space.md + 2,
              borderBottomWidth: isLast ? 0 : 1,
              borderBottomColor: color.border,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: space.sm,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontFamily: type.bodySemi,
                  fontSize: type.size.body,
                  color: color.ink,
                }}
              >
                {t.exerciseName}
              </Text>
              <Badge label={badge.label} tone={badge.tone} />
            </View>
            <Text
              style={{
                marginTop: 5,
                fontFamily: type.bodyMedium,
                fontSize: type.size.sub,
                color: color.inkMuted,
              }}
            >
              {t.last
                ? `Last: ${trimNum(t.last.weightKg)} kg × ${t.last.topReps}`
                : 'First session — no history yet'}
            </Text>
            <Text
              style={{
                marginTop: 3,
                fontFamily: type.bodySemi,
                fontSize: type.size.sub + 1,
                color: color.accentBright,
              }}
            >
              {`Target: ${trimNum(t.targetWeightKg)} kg × ${repRange(t.targetRepsMin, t.targetRepsMax)} · ${t.targetSets} sets`}
            </Text>
            {t.reason ? (
              <Text
                style={{
                  marginTop: 4,
                  fontFamily: type.body,
                  fontSize: type.size.sub,
                  fontStyle: 'italic',
                  color: color.inkSecondary,
                  lineHeight: 18,
                }}
              >
                {t.reason}
              </Text>
            ) : null}
          </View>
        );
      })}
    </CardShell>
  );
}
