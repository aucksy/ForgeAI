import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { HeroCard, Icon } from '@/components/ui';
import { fmtWeight } from '@/lib/format';
import { targetLine } from '@/tracker/engine/progression';
import { todayAction } from '@/tracker/lib/todayLink';
import { color, gradients, radius, shadow, space, type } from '@/theme/tokens';
import type { TodaysWorkout, UnitSystem } from '@/types/models';

import { Tappable } from './Tappable';

interface HeroWorkoutCardProps {
  workout: TodaysWorkout;
  unitSystem: UnitSystem;
  onPress: () => void;
}

/**
 * Flagship dashboard card: today's session with the first three overload
 * targets. Ember glow + gradient top edge; tapping opens today's workout (v0.28.0: its
 * exercises first, then Start).
 */
export function HeroWorkoutCard({ workout, unitSystem, onPress }: HeroWorkoutCardProps) {
  // Audit Phase 3: the one "Today" answer's words — "Done today: Push 1 · Next: Pull 1",
  // "No plan yet · Pick a program or build one" (SH-03 / SH-04 / RP-10 / RP-11).
  const done = workout.today?.status === 'doneToday';
  const title = workout.today ? workout.today.title : workout.dayName;
  const line = workout.today ? workout.today.line : workout.headline;
  // Once today's routine is done the card says so and what is next — not its exercise list.
  const shown = done ? [] : workout.targets;
  const targets = shown.slice(0, 3);
  const extra = shown.length - targets.length;

  return (
    <Tappable onPress={onPress} accessibilityLabel={`Today's workout: ${line ? `${title}. ${line}` : title}`}>
      <HeroCard
        gradient={gradients.steel}
        style={{
          ...shadow.glow,
          backgroundColor: color.surface,
          borderRadius: radius.xl,
        }}
      >
        {/* ember gradient top edge */}
        <LinearGradient
          colors={gradients.ember}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3 }}
        />
        {/* soft ember bloom, echoing the screen backdrop */}
        <LinearGradient
          colors={gradients.emberSubtle}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={{
            position: 'absolute',
            top: -48,
            right: -48,
            width: 170,
            height: 170,
            borderRadius: 85,
            opacity: 0.7,
          }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text
            style={{
              fontFamily: type.bodySemi,
              fontSize: type.size.caption,
              color: color.accentBright,
              letterSpacing: 1.6,
            }}
          >
            TODAY&apos;S SESSION
          </Text>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: color.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="dumbbell" size={16} color={color.accent} />
          </View>
        </View>

        <Text
          style={{
            fontFamily: type.display,
            fontSize: type.size.h1,
            color: color.ink,
            letterSpacing: -0.5,
            marginTop: space.sm,
          }}
        >
          {title}
        </Text>
        {line ? (
          <Text
            style={{
              fontFamily: type.body,
              fontSize: type.size.sub,
              lineHeight: 19,
              color: color.inkSecondary,
              marginTop: space.xs,
            }}
          >
            {line}
          </Text>
        ) : null}

        {targets.length > 0 ? (
          <View
            style={{
              marginTop: space.lg,
              paddingTop: space.lg,
              borderTopWidth: 1,
              borderTopColor: color.border,
              gap: space.sm,
            }}
          >
            {/* SH-18: the exercise's name first, on its own line; the Target under it, shortened —
                a long Target ("First time · find a weight for 8–12 reps") never hides the name. */}
            {targets.map((t, i) => (
              <View
                key={`${t.exerciseId}-${i}`}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}
              >
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 2.5,
                    backgroundColor: color.accent,
                    marginTop: 9,
                  }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: type.bodyMedium,
                      fontSize: type.size.body,
                      color: color.ink,
                    }}
                  >
                    {t.exerciseName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: type.mono,
                      fontSize: type.size.caption,
                      color: color.inkSecondary,
                    }}
                  >
                    {targetLine(t, (kg) => fmtWeight(kg, unitSystem))}
                  </Text>
                </View>
              </View>
            ))}
            {extra > 0 ? (
              <Text
                style={{
                  fontFamily: type.bodyMedium,
                  fontSize: type.size.caption,
                  color: color.inkMuted,
                  marginLeft: 5 + space.sm,
                }}
              >
                +{extra} more exercise{extra === 1 ? '' : 's'}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 2,
            marginTop: space.lg,
          }}
        >
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>
            {todayAction(workout)}
          </Text>
          <Icon name="chevron-right" size={14} color={color.accent} />
        </View>
      </HeroCard>
    </Tappable>
  );
}
