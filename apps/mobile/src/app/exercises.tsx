/**
 * Profile → Exercises (redesign R5, PLAN §4.2) — Hevy's Exercises screen, the old Exercise
 * library merged in: search, Equipment and Muscle, "Create" top right; the exercises the member
 * has done first (newest first, "Last: 12 Oct"), then their own, then the library; "Hidden
 * exercises" at the bottom. Tap one → its page (Summary · History · How to).
 */
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Pressable, Text } from 'react-native';

import { Icon, Screen } from '@/components/ui';
import { navigateOnce } from '@/lib/guardedAction';
import { goBack } from '@/lib/goBack';
import { color, radius, space, type } from '@/theme/tokens';

import { LibraryList } from '@/tracker/components/LibraryList';

export default function ExercisesScreen() {
  const router = useRouter();
  // EX-18: a quick double tap opens one page, not two stacked copies.
  const busy = useRef(false);
  const go = (to: () => void): void => {
    navigateOnce(busy, to);
  };

  return (
    <Screen
      scroll={false}
      title="Exercises"
      onBack={() => goBack(router, '/profile')}
      right={
        <Pressable
          onPress={() => go(() => router.push('/library/new'))}
          accessibilityRole="button"
          accessibilityLabel="Create an exercise"
          style={({ pressed }) => ({
            minHeight: 48,
            minWidth: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.xs,
            paddingHorizontal: space.sm,
            borderRadius: radius.pill,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="plus" size={18} color={color.accent} />
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.accent }}>Create</Text>
        </Pressable>
      }
    >
      <LibraryList
        onSelectExercise={(ex) => go(() => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } }))}
        onCreateNamed={(typed) => go(() => router.push({ pathname: '/library/new', params: { name: typed } }))}
        onOpenHidden={() => go(() => router.push('/library/hidden'))}
      />
    </Screen>
  );
}
