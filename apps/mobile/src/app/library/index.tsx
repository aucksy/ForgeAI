/** Exercise library — browse/search all exercises, or create a custom one. */
import { useRouter } from 'expo-router';

import { IconButton, Screen } from '@/components/ui';

import { LibraryList } from '@/tracker/components/LibraryList';

export default function LibraryScreen() {
  const router = useRouter();

  return (
    <Screen
      scroll={false}
      title="Exercise library"
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      <LibraryList
        onSelectExercise={(ex) => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } })}
        onCreateNew={() => router.push('/library/new')}
      />
    </Screen>
  );
}
