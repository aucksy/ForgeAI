/** Workout tab — start a workout (empty or from plan) or resume one in progress. */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { GhostButton, HeroCard, Icon, PrimaryButton, Screen } from '@/components/ui';
import { getTodaysWorkout } from '@/services/coach';
import { color, gradients, space, type } from '@/theme/tokens';

import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

interface PlanPreview {
  dayName: string;
  count: number;
  hasPlan: boolean;
}

export default function WorkoutScreen() {
  const router = useRouter();

  const active = useActiveWorkout((s) => s.active);
  const exerciseCount = useActiveWorkout((s) => s.exercises.length);
  const hydrate = useActiveWorkout((s) => s.hydrate);
  const startEmpty = useActiveWorkout((s) => s.startEmpty);
  const startFromPlan = useActiveWorkout((s) => s.startFromPlan);
  const discard = useActiveWorkout((s) => s.discard);

  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [starting, setStarting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void hydrate();
      let alive = true;
      getTodaysWorkout()
        .then((tw) => {
          if (alive) {
            setPreview({ dayName: tw.dayName, count: tw.targets.length, hasPlan: tw.targets.length > 0 });
          }
        })
        .catch(() => {
          if (alive) setPreview({ dayName: 'Full Body', count: 0, hasPlan: false });
        });
      return () => {
        alive = false;
      };
    }, [hydrate]),
  );

  const goActive = (): void => router.push('/session/active');

  const onStartPlan = async (): Promise<void> => {
    setStarting(true);
    try {
      await startFromPlan();
      goActive();
    } finally {
      setStarting(false);
    }
  };

  const onStartEmpty = (): void => {
    startEmpty();
    goActive();
  };

  const onDiscard = (): void => {
    Alert.alert('Discard workout?', 'Your in-progress workout will be deleted.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void discard() },
    ]);
  };

  return (
    <Screen title="Workout" subtitle="Log a session — offline, one tap per set.">
      <View style={{ gap: space.lg }}>
        {active ? (
          <HeroCard gradient={gradients.ember}>
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Icon name="clock" size={22} color="#1F0D05" />
                <Text style={{ fontFamily: type.displaySemi, fontSize: type.size.h2, color: '#1F0D05' }}>
                  Workout in progress
                </Text>
              </View>
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: 'rgba(31,13,5,0.72)' }}>
                {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'} logged so far.
              </Text>
              <PrimaryButton label="Resume workout" icon="dumbbell" onPress={goActive} />
              <GhostButton label="Discard" icon="close" onPress={onDiscard} />
            </View>
          </HeroCard>
        ) : (
          <>
            <HeroCard>
              <View style={{ gap: space.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Icon name="target" size={20} color={color.accent} />
                  <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
                    {preview?.hasPlan ? `Today: ${preview.dayName}` : 'Start a workout'}
                  </Text>
                </View>
                <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
                  {preview?.hasPlan
                    ? `${preview.count} exercises from your plan, pre-filled with last time's numbers.`
                    : 'No plan for today — start empty and add exercises as you go.'}
                </Text>
                {preview?.hasPlan ? (
                  <PrimaryButton
                    label={`Start ${preview.dayName}`}
                    icon="dumbbell"
                    loading={starting}
                    onPress={() => void onStartPlan()}
                  />
                ) : null}
              </View>
            </HeroCard>

            <GhostButton label="Start empty workout" icon="plus" onPress={onStartEmpty} />
            <GhostButton label="Routines" icon="target" onPress={() => router.push('/routines')} />
            <GhostButton label="Exercise library" icon="dumbbell" onPress={() => router.push('/library')} />
          </>
        )}
      </View>
    </Screen>
  );
}
