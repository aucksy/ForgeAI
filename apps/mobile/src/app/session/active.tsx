/** Active workout — the live logging screen (full-screen over the tabs). */
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, GhostButton, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { useDashboard } from '@/store/dashboardStore';
import { color, radius, space, type } from '@/theme/tokens';

import type { OverloadTarget } from '@/types/models';

import { SessionGoneError } from '@/tracker/db/sessionEdit';
import { EditSessionHeader } from '@/tracker/components/EditSessionHeader';
import { ElapsedClock } from '@/tracker/components/ElapsedClock';
import { ExerciseLogCard } from '@/tracker/components/ExerciseLogCard';
import { RestTimerBar } from '@/tracker/components/RestTimerBar';
import { getTargetsForPlanDay } from '@/tracker/services/coachTargets';
import { draftToRichSets, hasWorkingSet } from '@/tracker/services/draftSets';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';

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
  // Phase W4 — the same screen doubles as the editor for a saved workout.
  const editingSessionId = useActiveWorkout((s) => s.editingSessionId);
  const editDateISO = useActiveWorkout((s) => s.editDateISO);
  const editNotes = useActiveWorkout((s) => s.editNotes);
  const dayType = useActiveWorkout((s) => s.dayType);
  const setEditDate = useActiveWorkout((s) => s.setEditDate);
  const setEditDayType = useActiveWorkout((s) => s.setEditDayType);
  const setEditNotes = useActiveWorkout((s) => s.setEditNotes);
  const saveEdits = useActiveWorkout((s) => s.saveEdits);
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

  // We navigate away explicitly on finish/discard; suppress the safety redirect then.
  const leaving = useRef(false);

  // Nothing in progress (e.g. deep-linked with no draft) — bounce to the tab.
  useEffect(() => {
    if (!active && !leaving.current) router.replace('/workout');
  }, [active, router]);

  // Exactly what a save would write — the same helper the store commits through,
  // so the button can never enable on a set the save then silently drops.
  const canFinish = hasWorkingSet(draftToRichSets(exercises));
  const isEditing = editingSessionId != null;

  // Distinct superset groups in this workout (for the per-card chooser). Memoised on a
  // primitive key, NOT on `exercises`: the store replaces that array on every keystroke,
  // so a plain dep would hand every card a fresh array and defeat their React.memo.
  const groupsKey = exercises.map((e) => e.supersetGroup ?? '').join(',');
  const existingGroups = useMemo(
    () =>
      [
        ...new Set(exercises.map((e) => e.supersetGroup).filter((g): g is number => g != null)),
      ].sort((a, b) => a - b),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupsKey],
  );

  const onDiscard = (): void => {
    const back = (): void => {
      leaving.current = true;
      // Leaving an edit returns to the workout it came from, unchanged.
      const to = editingSessionId ? `/session/${editingSessionId}` : '/workout';
      void discard().then(() => router.replace(to));
    };
    if (isEditing) {
      Alert.alert('Discard changes?', 'Your edits will be thrown away. The saved workout stays as it was.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard changes', style: 'destructive', onPress: back },
      ]);
      return;
    }
    Alert.alert('Discard workout?', 'This workout and its sets will be deleted. This cannot be undone.', [
      { text: 'Keep logging', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: back },
    ]);
  };

  const onSaveEdits = async (): Promise<void> => {
    if (useActiveWorkout.getState().committing) return; // ignore double-tap while saving
    leaving.current = true;
    try {
      const id = await saveEdits();
      if (!id) {
        leaving.current = false;
        Alert.alert(
          'Nothing to save',
          'A workout needs at least one set. To get rid of it entirely, discard these changes and delete the workout instead.',
        );
        return;
      }
      // Saved. Nothing past this point may report failure — a refresh error must
      // not strand the member on an editor whose workout is already written.
      await useDashboard.getState().refresh().catch(() => undefined);
      if (!useActiveWorkout.getState().lastSaveReconciled) {
        Alert.alert(
          'Changes saved',
          'Your personal records will catch up the next time you log or edit a workout.',
        );
      }
      router.replace({ pathname: '/session/[id]', params: { id } });
    } catch (err) {
      if (err instanceof SessionGoneError) {
        // Deleted from elsewhere while this draft sat open — there is nothing to
        // save back to. Drop the draft rather than leave an editor that can only fail.
        leaving.current = true;
        await discard();
        Alert.alert('Workout deleted', 'This workout was deleted, so your changes were discarded.');
        router.replace('/history');
        return;
      }
      leaving.current = false;
      Alert.alert(
        'Could not save',
        'Something went wrong saving your changes. The workout is unchanged — tap Save to try again.',
      );
    }
  };

  const onPrimary = (): void => {
    void (isEditing ? onSaveEdits() : onFinish());
  };

  const onFinish = async (): Promise<void> => {
    if (useActiveWorkout.getState().committing) return; // ignore double-tap while saving
    leaving.current = true;
    try {
      const id = await finish(null);
      if (id) {
        await useDashboard.getState().refresh();
        router.replace({ pathname: '/session/finish', params: { id } });
      } else {
        leaving.current = false;
        Alert.alert('Nothing to save', 'Log at least one set (weight and reps) before finishing.');
      }
    } catch {
      // Commit rolled back atomically (nothing saved) — let the user retry.
      leaving.current = false;
      Alert.alert('Could not save', 'Something went wrong saving your workout. Your sets are still here — tap ✓ to try again.');
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
        <IconButton
          icon="close"
          onPress={onDiscard}
          accessibilityLabel={isEditing ? 'Discard changes' : 'Discard workout'}
        />
        {/* Owns its own 1 Hz tick — the rest of this tree no longer re-renders per second. */}
        <ElapsedClock startedAt={startedAt} />
        <IconButton
          icon="check"
          tint={canFinish && !committing ? color.accent : color.inkFaint}
          onPress={onPrimary}
          accessibilityLabel={isEditing ? 'Save changes' : 'Finish workout'}
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
          {isEditing ? (
            <EditSessionHeader
              dateISO={editDateISO ?? ''}
              dayType={dayType}
              notes={editNotes ?? ''}
              onDateChange={setEditDate}
              onDayTypeChange={setEditDayType}
              onNotesChange={setEditNotes}
            />
          ) : null}

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
            label={
              isEditing
                ? canFinish
                  ? 'Save changes'
                  : 'Keep at least one set'
                : canFinish
                  ? 'Finish workout'
                  : 'Log a set to finish'
            }
            icon="check"
            loading={committing}
            disabled={!canFinish || committing}
            onPress={onPrimary}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
