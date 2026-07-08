/** Active workout — the live logging screen (full-screen over the tabs). */
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, GhostButton, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { useDashboard } from '@/store/dashboardStore';
import { color, space, type } from '@/theme/tokens';

import { ExerciseLogCard } from '@/tracker/components/ExerciseLogCard';
import { formatDuration } from '@/tracker/services/finishSummary';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (startedAt == null) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const active = useActiveWorkout((s) => s.active);
  const startedAt = useActiveWorkout((s) => s.startedAt);
  const exercises = useActiveWorkout((s) => s.exercises);
  const committing = useActiveWorkout((s) => s.committing);
  const finish = useActiveWorkout((s) => s.finish);
  const discard = useActiveWorkout((s) => s.discard);

  const elapsed = useElapsed(startedAt);

  // We navigate away explicitly on finish/discard; suppress the safety redirect then.
  const leaving = useRef(false);

  // Nothing in progress (e.g. deep-linked with no draft) — bounce to the tab.
  useEffect(() => {
    if (!active && !leaving.current) router.replace('/workout');
  }, [active, router]);

  const canFinish = exercises.some((e) =>
    e.sets.some((s) => s.reps != null && s.reps > 0 && s.weightKg != null),
  );

  const onDiscard = (): void => {
    Alert.alert('Discard workout?', 'This workout and its sets will be deleted. This cannot be undone.', [
      { text: 'Keep logging', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          leaving.current = true;
          void discard().then(() => router.replace('/workout'));
        },
      },
    ]);
  };

  const onFinish = async (): Promise<void> => {
    if (useActiveWorkout.getState().committing) return; // ignore double-tap while saving
    leaving.current = true;
    const id = await finish(null);
    if (id) {
      await useDashboard.getState().refresh();
      router.replace({ pathname: '/session/finish', params: { id } });
    } else {
      leaving.current = false;
      Alert.alert('Nothing to save', 'Log at least one set (weight and reps) before finishing.');
    }
  };

  return (
    <Screen scroll={false}>
      {/* header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: space.md,
        }}
      >
        <IconButton icon="close" onPress={onDiscard} accessibilityLabel="Discard workout" />
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: type.mono, fontSize: type.size.caption, color: color.inkMuted }}>
            ELAPSED
          </Text>
          <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink }}>
            {formatDuration(elapsed)}
          </Text>
        </View>
        <IconButton
          icon="check"
          tint={canFinish && !committing ? color.accent : color.inkFaint}
          onPress={() => void onFinish()}
          accessibilityLabel="Finish workout"
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 8}
      >
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }}
        >
          {exercises.length === 0 ? (
            <EmptyState
              icon="dumbbell"
              title="Add your first exercise"
              body="Pick an exercise to start logging sets."
            />
          ) : (
            exercises.map((ex) => <ExerciseLogCard key={ex.key} exercise={ex} />)
          )}
          <GhostButton
            label="Add exercise"
            icon="plus"
            onPress={() => router.push('/session/add-exercise')}
          />
        </ScrollView>

        {/* finish bar */}
        <View style={{ paddingTop: space.md, paddingBottom: Math.max(insets.bottom, space.md) }}>
          <PrimaryButton
            label={canFinish ? 'Finish workout' : 'Log a set to finish'}
            icon="check"
            loading={committing}
            disabled={!canFinish || committing}
            onPress={() => void onFinish()}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
