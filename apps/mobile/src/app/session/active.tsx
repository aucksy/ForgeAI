/** Active workout — the live logging screen (full-screen over the tabs). */
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, GhostButton, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { useDashboard } from '@/store/dashboardStore';
import { color, radius, space, type } from '@/theme/tokens';

import type { OverloadTarget } from '@/types/models';

import { ExerciseLogCard } from '@/tracker/components/ExerciseLogCard';
import { RestTimerBar } from '@/tracker/components/RestTimerBar';
import { getTargetsForPlanDay } from '@/tracker/services/coachTargets';
import { formatDuration } from '@/tracker/services/finishSummary';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';

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
  const planDayId = useActiveWorkout((s) => s.planDayId);
  const exercises = useActiveWorkout((s) => s.exercises);
  const committing = useActiveWorkout((s) => s.committing);
  const finish = useActiveWorkout((s) => s.finish);
  const discard = useActiveWorkout((s) => s.discard);
  const lastDeleted = useActiveWorkout((s) => s.lastDeleted);
  const undoDelete = useActiveWorkout((s) => s.undoDelete);
  const dismissUndo = useActiveWorkout((s) => s.dismissUndo);
  const loadRestDefault = useRestTimer((s) => s.loadDefault);
  const skipRest = useRestTimer((s) => s.skip);

  // Keep the screen awake and load the rest-timer default while logging.
  useKeepAwake();
  useEffect(() => {
    void loadRestDefault();
    // Clear any running rest timer on leaving the workout (finish/discard/exit) so a
    // stale timer can't leak a phantom countdown/haptic into the next session.
    return () => skipRest();
  }, [loadRestDefault, skipRest]);

  // Coach targets (Phase C1) — the progressive-overload prescription per plan-day
  // exercise, surfaced inline in each card. Derived/offline (SQLite only), never
  // persisted in the draft. Recomputes when the plan day or exercise list changes
  // (e.g. adding a plan exercise mid-session). Empty for Start-Empty / repeats.
  const [targets, setTargets] = useState<Map<string, OverloadTarget>>(() => new Map());
  const exerciseIdsKey = exercises.map((e) => e.exerciseId).join(',');
  useEffect(() => {
    let cancelled = false;
    void getTargetsForPlanDay(planDayId)
      .then((map) => {
        if (!cancelled) setTargets(map);
      })
      .catch(() => {
        if (!cancelled) setTargets(new Map());
      });
    return () => {
      cancelled = true;
    };
    // exerciseIdsKey re-runs the load when the roster changes; planDayId scopes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planDayId, exerciseIdsKey]);

  // Auto-dismiss the undo snackbar after a few seconds.
  useEffect(() => {
    if (!lastDeleted) return;
    const id = setTimeout(() => dismissUndo(), 4000);
    return () => clearTimeout(id);
  }, [lastDeleted, dismissUndo]);

  const elapsed = useElapsed(startedAt);

  // We navigate away explicitly on finish/discard; suppress the safety redirect then.
  const leaving = useRef(false);

  // Nothing in progress (e.g. deep-linked with no draft) — bounce to the tab.
  useEffect(() => {
    if (!active && !leaving.current) router.replace('/workout');
  }, [active, router]);

  // At least one WORKING (non-warm-up) set with weight + reps.
  const canFinish = exercises.some((e) =>
    e.sets.some((s) => !s.isWarmup && s.reps != null && s.reps > 0 && s.weightKg != null),
  );

  // Distinct superset groups in this workout (for the per-card chooser).
  const existingGroups = [
    ...new Set(exercises.map((e) => e.supersetGroup).filter((g): g is number => g != null)),
  ].sort((a, b) => a - b);

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
            exercises.map((ex) => (
              <ExerciseLogCard
                key={ex.key}
                exercise={ex}
                existingGroups={existingGroups}
                target={targets.get(ex.exerciseId) ?? null}
              />
            ))
          )}
          <GhostButton
            label="Add exercise"
            icon="plus"
            onPress={() => router.push('/session/add-exercise')}
          />
        </ScrollView>

        {/* rest timer · undo · finish */}
        <View style={{ paddingTop: space.md, paddingBottom: Math.max(insets.bottom, space.md) }}>
          <RestTimerBar />
          {lastDeleted ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
                marginBottom: space.sm,
                borderRadius: radius.lg,
                backgroundColor: color.surfaceRaised,
                borderWidth: 1,
                borderColor: color.border,
              }}
            >
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>
                Set removed
              </Text>
              <Pressable onPress={() => undoDelete()} hitSlop={8}>
                <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.sub, color: color.accent }}>Undo</Text>
              </Pressable>
            </View>
          ) : null}
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
