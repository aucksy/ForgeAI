/** Add an exercise to a routine (full-screen picker; routine-scoped via ?dayId=). */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { Alert } from 'react-native';

import { EmptyState, IconButton, Screen } from '@/components/ui';

import { ExercisePickerList } from '@/tracker/components/ExercisePickerList';
import { addExerciseToRoutine } from '@/tracker/db/routineRepo';

export default function RoutineAddExerciseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ dayId?: string | string[] }>();
  const dayId = typeof params.dayId === 'string' ? params.dayId : params.dayId?.[0];
  // Guard a rapid double-tap adding twice + popping past the editor.
  const picked = useRef(false);

  if (!dayId) {
    return (
      <Screen
        title="Add exercise"
        right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
      >
        <EmptyState icon="dumbbell" title="No routine" body="Open a routine, then add exercises." />
      </Screen>
    );
  }

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
          void addExerciseToRoutine(dayId, ex.id)
            .then(() => router.back())
            .catch(() => {
              picked.current = false;
              Alert.alert('Could not add exercise', 'Please try again.');
            });
        }}
      />
    </Screen>
  );
}
