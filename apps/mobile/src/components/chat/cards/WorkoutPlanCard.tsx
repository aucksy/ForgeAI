import { Text, View } from 'react-native';

import { Badge } from '@/components/ui';
import type { BadgeProps } from '@/components/ui';
import { trimNum } from '@/lib/format';
import { targetBadge, targetLine } from '@/tracker/engine/progression';
import { color, space, type } from '@/theme/tokens';

import { planRowView, type PlanTargetView, type WorkoutPlanView } from '../payload';
import { CardShell, Divider } from './CardShell';

const ACTION_BADGE: Record<PlanTargetView['action'], { label: string; tone: BadgeProps['tone'] }> =
  {
    increase: { label: 'Progress', tone: 'accent' },
    hold: { label: 'Hold', tone: 'neutral' },
    deload: { label: 'Deload', tone: 'warn' },
    start: { label: 'Start', tone: 'good' },
  };

const NEW_BADGE = {
  Up: { label: 'Up', tone: 'accent' },
  Lighter: { label: 'Lighter', tone: 'warn' },
} as const satisfies Record<string, { label: string; tone: BadgeProps['tone'] }>;

/** Cards saved before the v2 engine keep their old badge; new ones show a word only on a change. */
function badgeFor(t: PlanTargetView): { label: string; tone: BadgeProps['tone'] } | null {
  if (t.action === 'start') return null; // the line already says "First time"
  if (t.change === undefined) return ACTION_BADGE[t.action];
  const b = targetBadge(t);
  return b ? NEW_BADGE[b] : null;
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
        const badge = badgeFor(t);
        const { line, showReason } = planRowView(t);
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
              {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
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
                ? t.bodyweightOnly
                  ? `Last: ${t.last.topReps} ${t.last.topReps === 1 ? 'rep' : 'reps'}`
                  : `Last: ${trimNum(t.last.weightKg)} kg × ${t.last.topReps}`
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
              {`Target: ${targetLine(line)} · ${t.targetSets} sets`}
            </Text>
            {showReason ? (
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
