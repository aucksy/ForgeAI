/** Exercise library — browse/search all exercises, or create a custom one. */
import { useRouter } from 'expo-router';
import { useRef } from 'react';

import { IconButton, Screen } from '@/components/ui';
import { navigateOnce } from '@/lib/guardedAction';

import { LibraryList } from '@/tracker/components/LibraryList';

export default function LibraryScreen() {
  const router = useRouter();
  // EX-18: a quick double tap opens one page, not two stacked copies.
  const busy = useRef(false);
  const go = (to: () => void): void => {
    navigateOnce(busy, to);
  };

  return (
    <Screen
      scroll={false}
      title="Exercise library"
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      <LibraryList
        onSelectExercise={(ex) => go(() => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } }))}
        onCreateNew={() => go(() => router.push('/library/new'))}
        onCreateNamed={(typed) => go(() => router.push({ pathname: '/library/new', params: { name: typed } }))}
        onOpenHidden={() => go(() => router.push('/library/hidden'))}
      />
    </Screen>
  );
}
