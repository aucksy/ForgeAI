/**
 * Progress → Your lifts → "Any exercise" (audit Phase 5, PG-09): THE exercise list (search,
 * recent first, muscle and gear filters), and the chosen exercise's trend opens on Progress.
 */
import { useRouter } from 'expo-router';
import { useRef } from 'react';

import { goBack } from '@/lib/goBack';
import { Screen } from '@/components/ui';
import { ExercisePickerList } from '@/tracker/components/ExercisePickerList';
import { useProgressPick } from '@/tracker/store/progressPickStore';

export default function PickLiftScreen() {
  const router = useRouter();
  const pick = useProgressPick((s) => s.pick);
  // A double tap never picks twice or pops past Progress.
  const done = useRef(false);

  return (
    <Screen
      scroll={false}
      title="Any exercise"
      subtitle="See its trend on Progress"
      onBack={() => goBack(router, '/analytics')}
    >
      <ExercisePickerList
        actionLabel="Show trend"
        trailing="chevron-right"
        onSelect={(ex) => {
          if (done.current) return;
          done.current = true;
          pick(ex.id);
          router.back();
        }}
      />
    </Screen>
  );
}
