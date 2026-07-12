import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { HeroCard, Icon } from '@/components/ui';
import { fmtWeight } from '@/lib/format';
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
 * targets. Ember glow + gradient top edge; tapping starts the workout.
 */
export function HeroWorkoutCard({ workout, unitSystem, onPress }: HeroWorkoutCardProps) {
  const targets = workout.targets.slice(0, 3);
  const extra = workout.targets.length - targets.length;

  return (
    <Tappable onPress={onPress} accessibilityLabel={`Today's workout: ${workout.dayName}`}>
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
          {workout.dayName}
        </Text>
        <Text
          style={{
            fontFamily: type.body,
            fontSize: type.size.sub,
            lineHeight: 19,
            color: color.inkSecondary,
            marginTop: space.xs,
          }}
        >
          {workout.headline}
        </Text>

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
            {targets.map((t) => (
              <View
                key={t.exerciseId}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
              >
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 2.5,
                    backgroundColor: color.accent,
                  }}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontFamily: type.bodyMedium,
                    fontSize: type.size.body,
                    color: color.ink,
                  }}
                >
                  {t.exerciseName}
                </Text>
                <Text
                  style={{
                    fontFamily: type.mono,
                    fontSize: type.size.sub,
                    color: color.inkSecondary,
                  }}
                >
                  {fmtWeight(t.targetWeightKg, unitSystem)} × {t.targetRepsMin}–{t.targetRepsMax}
                </Text>
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
            Start workout
          </Text>
          <Icon name="chevron-right" size={14} color={color.accent} />
        </View>
      </HeroCard>
    </Tappable>
  );
}
