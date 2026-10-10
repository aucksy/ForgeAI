/**
 * Plan builder — exercises to leave out (Phase 4). Tap an exercise to keep it out of the plan;
 * tap it again to let it back in. Library exercises only: the builder never picks your own
 * ones. The list lives in the builder's memory (`planBuilderStore`) until the plan is followed.
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, Screen } from '@/components/ui';
import { countWord } from '@/lib/words';
import { goBack } from '@/lib/goBack';
import { color, space, type } from '@/theme/tokens';

import { ExercisePickerList } from '@/tracker/components/ExercisePickerList';
import type { TrackerExercise } from '@/tracker/db/exerciseInfo';
import { usePlanBuilder } from '@/tracker/store/planBuilderStore';

const inLibrary = (ex: TrackerExercise): boolean => ex.catalogKey != null;

export default function LeaveOutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const avoid = usePlanBuilder((s) => s.input.avoid);
  const toggleAvoid = usePlanBuilder((s) => s.toggleAvoid);
  // A new function each time the list changes, so the rows redraw their ticks.
  const isMarked = useCallback((ex: TrackerExercise) => ex.catalogKey != null && avoid.includes(ex.catalogKey), [avoid]);

  return (
    <Screen
      scroll={false}
      title="Leave out"
      subtitle={avoid.length > 0 ? `${countWord(avoid.length, 'exercise')} left out` : 'Tap the exercises you never want.'}
      onBack={() => goBack(router, '/workout')}
    >
      <ExercisePickerList
        actionLabel="Leave out"
        only={inLibrary}
        isMarked={isMarked}
        onSelect={(ex) => {
          if (ex.catalogKey) toggleAvoid(ex.catalogKey, ex.name);
        }}
      />
      <View style={{ paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.md), gap: space.sm }}>
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
          The plan picks another exercise for the same muscles.
        </Text>
        <PrimaryButton label="Done" icon="check" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
