/**
 * Settings → Phone and watch → "Your watch" (R-284, 2 Nov 2026 UAT: the watch settings were in two
 * places). Installing the watch app (F67: Installed / Install on watch, which opens the watch's Play
 * Store on MettleUp) and "Open MettleUp on my watch" (it was inside Rest timer and sounds).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { SettingsPage } from '@/components/settings/SettingsPage';
import { LinkRow } from '@/components/stats/parts';
import { tell } from '@/lib/tell';
import { WatchOpenSwitch } from '@/tracker/components/WorkoutPrefsCard';
import { WATCH_WORDS, installNote, installOnWatch, readWatchState, watchRowLine, type WatchState } from '@/tracker/services/watchInstall';

export default function WatchPage() {
  const [watch, setWatch] = useState<WatchState>('unknown');
  const installing = useRef(false);
  useFocusEffect(
    useCallback(() => {
      void readWatchState().then(setWatch);
    }, []),
  );
  const line = watchRowLine(watch);

  // F67: missing = open the watch's Play Store on MettleUp, then say what happened.
  const onInstall = (): void => {
    if (watch === 'installed') {
      void tell(WATCH_WORDS.already);
      return;
    }
    if (installing.current) return;
    installing.current = true;
    void installOnWatch()
      .then((r) => {
        if (r === 'installed') setWatch('installed');
        return tell(installNote(r));
      })
      .finally(() => {
        installing.current = false;
      });
  };

  return (
    <SettingsPage title="Your watch">
      {line ? <LinkRow title={WATCH_WORDS.cardTitle} sub={line} onPress={onInstall} /> : null}
      <WatchOpenSwitch />
    </SettingsPage>
  );
}
