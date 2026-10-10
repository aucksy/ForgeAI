/**
 * Mid-workout exercise picker (full-screen over the active workout).
 *
 * LW-15: tick SEVERAL exercises, then one "Add 3" — with the last few workouts' exercises
 * first under "Recent". A failed add says so and the list keeps working (EX-10).
 * LW-31: with `?swap=<card key>` it is the "Swap exercise" picker for any exercise (custom
 * ones too): one tap swaps it for this workout only.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { IconButton, PrimaryButton, Screen } from '@/components/ui';
import { ADD_EXERCISE_FAILED, navigateOnce, runGuarded } from '@/lib/guardedAction';
import { space } from '@/theme/tokens';

import { ExercisePickerList } from '@/tracker/components/ExercisePickerList';
import type { TrackerExercise } from '@/tracker/db/exerciseInfo';
import { getRecentExerciseIds } from '@/tracker/db/recentExercises';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

const SWAP_FAILED = "Couldn't swap it. Try again.";

export default function AddExerciseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ swap?: string }>();
  const swapKey = typeof params.swap === 'string' && params.swap ? params.swap : null;
  const swapName = useActiveWorkout((s) => (swapKey ? s.exercises.find((e) => e.key === swapKey)?.name ?? null : null));
  const addExercises = useActiveWorkout((s) => s.addExercises);
  const swapExercise = useActiveWorkout((s) => s.swapExercise);
  // Guard against a rapid double-tap adding twice + popping past the active screen.
  const busy = useRef(false);
  // EX-18: a double tap on "Create …" opens one form, not two.
  const nav = useRef(false);
  // EX-10: a failed add says so and the picker keeps working (the guard is always released).
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<TrackerExercise[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    // A failed read just means no Recent band.
    getRecentExerciseIds()
      .then((ids) => {
        if (alive) setRecent(ids);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const isMarked = useCallback((ex: TrackerExercise) => picked.some((p) => p.id === ex.id), [picked]);

  const onSelect = (ex: TrackerExercise): void => {
    if (swapKey) {
      void runGuarded(
        busy,
        async () => {
          setError(null);
          if (!(await swapExercise(swapKey, ex))) throw new Error('card gone');
          router.back();
          return 'left' as const;
        },
        () => setError(SWAP_FAILED),
      );
      return;
    }
    setError(null);
    setPicked((cur) => (cur.some((p) => p.id === ex.id) ? cur.filter((p) => p.id !== ex.id) : [...cur, ex]));
  };

  const onAdd = (): void => {
    if (picked.length === 0) return;
    void runGuarded(
      busy,
      async () => {
        setError(null);
        await addExercises(picked);
        router.back();
        return 'left' as const;
      },
      () => setError(ADD_EXERCISE_FAILED),
    );
  };

  const n = picked.length;
  return (
    <Screen
      scroll={false}
      title={swapKey ? 'Swap exercise' : 'Add exercise'}
      subtitle={swapKey ? (swapName ? `Instead of ${swapName}, for this workout only` : 'For this workout only') : undefined}
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      <ExercisePickerList
        error={error}
        recentIds={recent}
        actionLabel={swapKey ? 'Swap to' : 'Select'}
        markedLabel="Unselect"
        isMarked={swapKey ? undefined : isMarked}
        onSelect={onSelect}
        // v0.28.0: not in the list? Make it here (the form adds it to this workout on Save).
        onCreate={
          swapKey
            ? undefined
            : (typed) => navigateOnce(nav, () => router.push({ pathname: '/library/new', params: { for: 'workout', name: typed } }))
        }
      />
      {swapKey ? null : (
        <View style={{ paddingTop: space.sm }}>
          <PrimaryButton
            label={n === 0 ? 'Pick exercises to add' : `Add ${n}`}
            icon="plus"
            disabled={n === 0}
            onPress={onAdd}
          />
        </View>
      )}
    </Screen>
  );
}
