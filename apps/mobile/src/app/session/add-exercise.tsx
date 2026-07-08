/** Mid-workout exercise picker (full-screen over the active workout). */
import { useRouter } from 'expo-router';
import { useRef } from 'react';

import { IconButton, Screen } from '@/components/ui';

import { ExercisePickerList } from '@/tracker/components/ExercisePickerList';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

export default function AddExerciseScreen() {
  const router = useRouter();
  const addExercise = useActiveWorkout((s) => s.addExercise);
  // Guard against a rapid double-tap adding twice + popping past the active screen.
  const picked = useRef(false);

  return (
    <Screen
      scroll={false}
      title="Add exercise"
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      <ExercisePickerList
        onSelect={(ex) => {
          if (picked.current) return;
          picked.current = true;
          void addExercise(ex).then(() => router.back());
        }}
      />
    </Screen>
  );
}
