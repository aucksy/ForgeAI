/** Mid-workout exercise picker (full-screen over the active workout). */
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { IconButton, Screen } from '@/components/ui';
import { ADD_EXERCISE_FAILED, runGuarded } from '@/lib/guardedAction';

import { ExercisePickerList } from '@/tracker/components/ExercisePickerList';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

export default function AddExerciseScreen() {
  const router = useRouter();
  const addExercise = useActiveWorkout((s) => s.addExercise);
  // Guard against a rapid double-tap adding twice + popping past the active screen.
  const picked = useRef(false);
  // EX-10: a failed add says so and the picker keeps working (the guard is always released).
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen
      scroll={false}
      title="Add exercise"
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      <ExercisePickerList
        error={error}
        onSelect={(ex) => {
          void runGuarded(
            picked,
            async () => {
              setError(null);
              await addExercise(ex);
              router.back();
              return 'left' as const;
            },
            () => setError(ADD_EXERCISE_FAILED),
          );
        }}
        // v0.28.0: not in the list? Make it here (the form adds it to this workout on Save).
        onCreate={(typed) => router.push({ pathname: '/library/new', params: { for: 'workout', name: typed } })}
      />
    </Screen>
  );
}
