/**
 * R-228: MettleUp's own QR scanner for the gym poster (and an invite QR). Live camera only (R-152):
 * no photo is taken or saved, and nothing is read from a saved picture. The first gym QR it sees opens the
 * check-in (or join) screen in its place; any other QR says so and scanning goes on.
 * The camera panel is PosterScanner (shared with the welcome screen); the words and the routing are in
 * scanPoster.ts (tested); this file only routes and lays out the screen.
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { Screen } from '@/components/ui';

import { PosterScanner } from './PosterScanner';
import { posterRoute, SCAN_WORDS } from './scanPoster';
import { leave } from './ShopParts';

export function ScanPosterScreen() {
  const router = useRouter();
  const close = useCallback(() => leave(router, '/shop'), [router]);

  const onRead = useCallback(
    (data: string): boolean => {
      const to = posterRoute(data);
      if (!to) return false;
      router.replace(to);
      return true;
    },
    [router],
  );

  return (
    <Screen title={SCAN_WORDS.title} onBack={close}>
      <PosterScanner onRead={onRead} />
    </Screen>
  );
}
