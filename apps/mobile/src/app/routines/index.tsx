/** Routines — the editable list of the active plan's days. Start any one, or edit. */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Badge, EmptyState, GhostButton, Icon, IconButton, Screen, Skeleton } from '@/components/ui';
import type { PlanDayFull } from '@/db/repos/planRepo';
import { color, radius, space, type } from '@/theme/tokens';

import { createRoutine, listRoutines } from '@/tracker/db/routineRepo';
import { dayTypeLabel } from '@/tracker/services/finishSummary';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

export default function RoutinesScreen() {
  const router = useRouter();
  const hydrate = useActiveWorkout((s) => s.hydrate);
  const startFromPlanDay = useActiveWorkout((s) => s.startFromPlanDay);
  const starting = useRef(false);

  const [routines, setRoutines] = useState<PlanDayFull[] | null>(null);

  const reload = useCallback(() => {
    let alive = true;
    listRoutines()
      .then((list) => {
        if (alive) setRoutines(list);
      })
      .catch(() => {
        if (alive) setRoutines([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useFocusEffect(reload);

  const onNew = async (): Promise<void> => {
    try {
      const id = await createRoutine({ name: 'New routine', dayType: 'full' });
      router.push(`/routines/${id}`);
    } catch {
      Alert.alert('Could not create routine', 'Please try again.');
    }
  };

  const onStart = async (dayId: string): Promise<void> => {
    if (starting.current) return;
    starting.current = true;
    // Hydrate first: a persisted in-progress draft may exist but not be in memory yet
    // (it only loads on the Workout tab) — starting would overwrite it.
    await hydrate();
    if (useActiveWorkout.getState().active) {
      starting.current = false;
      Alert.alert('Finish your current workout first', 'You already have a workout in progress.');
      return;
    }
    try {
      await startFromPlanDay(dayId);
      router.replace('/session/active');
    } finally {
      starting.current = false;
    }
  };

  return (
    <Screen
      title="Routines"
      subtitle="Your reusable workout templates — start one in a tap."
      right={
        <IconButton icon="plus" onPress={() => void onNew()} accessibilityLabel="New routine" />
      }
    >
      {routines == null ? (
        <View style={{ gap: space.md }}>
          <Skeleton width="100%" height={92} radius={radius.lg} />
          <Skeleton width="100%" height={92} radius={radius.lg} />
        </View>
      ) : routines.length === 0 ? (
        <View style={{ gap: space.lg }}>
          <EmptyState
            icon="dumbbell"
            title="No routines yet"
            body="Create a routine to save an exercise line-up you can start any day."
          />
          <GhostButton label="New routine" icon="plus" onPress={() => void onNew()} />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          {routines.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => router.push(`/routines/${r.id}`)}
              style={{
                backgroundColor: color.surface,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: color.border,
                padding: space.lg,
                gap: space.md,
              }}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${r.name}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}
                  >
                    {r.name}
                  </Text>
                  <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Badge label={dayTypeLabel(r.dayType)} tone="accent" />
                    <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
                      {r.exercises.length} {r.exercises.length === 1 ? 'exercise' : 'exercises'}
                    </Text>
                  </View>
                </View>
                <Icon name="chevron-right" size={20} color={color.inkMuted} />
              </View>
              {r.exercises.length > 0 ? (
                <GhostButton
                  label="Start routine"
                  icon="dumbbell"
                  onPress={() => void onStart(r.id)}
                />
              ) : (
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
                  Add exercises to start this routine.
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
