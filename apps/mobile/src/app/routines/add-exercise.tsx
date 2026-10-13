/**
 * Add an exercise to a routine (full-screen picker; routine-scoped via ?dayId=).
 * 13 Oct 2026: "Create" in the top bar, always, and "Create “typed”" under a search that finds
 * nothing — the new-exercise form (`?for=routine`) adds it to this routine on Save.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { EmptyState, IconButton, Screen } from '@/components/ui';
import { navigateOnce } from '@/lib/guardedAction';
import { space } from '@/theme/tokens';

import { ExercisePickerList } from '@/tracker/components/ExercisePickerList';
import { HeaderCreateButton } from '@/tracker/components/HeaderCreateButton';
import { addExerciseToRoutine } from '@/tracker/db/routineRepo';
import { tell } from '@/lib/tell';

export default function RoutineAddExerciseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ dayId?: string | string[] }>();
  const dayId = typeof params.dayId === 'string' ? params.dayId : params.dayId?.[0];
  // Guard a rapid double-tap adding twice + popping past the editor.
  const picked = useRef(false);
  // A double tap on "Create" opens one form.
  const nav = useRef(false);
  const [typed, setTyped] = useState('');

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

  const create = (name: string): void => {
    navigateOnce(nav, () => router.push({ pathname: '/library/new', params: { for: 'routine', dayId, name: name.trim() } }));
  };

  return (
    <Screen
      scroll={false}
      title="Add exercise"
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <HeaderCreateButton onPress={() => create(typed)} />
          <IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />
        </View>
      }
    >
      <ExercisePickerList
        onCreate={create}
        onQueryChange={setTyped}
        onSelect={(ex) => {
          if (picked.current) return;
          picked.current = true;
          void addExerciseToRoutine(dayId, ex.id)
            .then(() => router.back())
            .catch(() => {
              picked.current = false;
              void tell('Could not add exercise', 'Please try again.');
            });
        }}
      />
    </Screen>
  );
}
