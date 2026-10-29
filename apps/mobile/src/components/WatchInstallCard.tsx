/**
 * F67: the Workout tab's one-time "MettleUp works on your watch too" card (tracker/services/watchInstall.ts).
 * After the member's first finished workout, with a Wear OS watch connected that lacks the MettleUp
 * watch app. "Install on watch" opens the watch's Play Store on MettleUp; "Not now" hides it for good.
 * No watch (or Wear OS cannot say), no card.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';
import {
  WATCH_WORDS,
  installNote,
  installOnWatch,
  markWatchCardDone,
  readWatchCardMark,
  readWatchState,
  watchCardShows,
  type WatchState,
} from '@/tracker/services/watchInstall';

import { useReportWant, type NoticeSlotProps } from './noticeSlot';

export interface WatchInstallCardProps extends NoticeSlotProps {
  /** The member has a saved workout (null = not read yet). */
  hasWorkouts: boolean | null;
  /** The welcome demo's sample workouts are loaded. */
  demo: boolean;
}

export function WatchInstallCard({ hidden = false, onWant, onDone, hasWorkouts, demo }: WatchInstallCardProps) {
  const [state, setState] = useState<WatchState>('unknown');
  const [stored, setStored] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // The line after "Install on watch"; the card stays until "Got it".
  const [note, setNote] = useState<string | null>(null);
  const eligible = hasWorkouts === true && !demo;

  // Each visit: Wear OS is asked again (a watch paired or the app installed meanwhile). Only once a
  // workout of the member's own is saved: no question to Wear OS before then.
  useFocusEffect(
    useCallback(() => {
      if (!eligible) return undefined;
      let live = true;
      void readWatchCardMark().then((m) => {
        if (!live) return;
        setStored(m);
        if (m === 'done') return;
        void readWatchState().then((s) => {
          if (live) setState(s);
        });
      });
      return () => {
        live = false;
      };
    }, [eligible]),
  );

  const shows = watchCardShows({ state, hasWorkouts, demo, stored }) || note != null;
  useReportWant(shows, onWant);
  if (!shows || hidden) return null;

  const install = () => {
    if (busy) return;
    setBusy(true);
    void installOnWatch()
      .then((r) => setNote(installNote(r)))
      .finally(() => setBusy(false));
  };
  const close = () => {
    setNote(null);
    setStored('done');
    onDone?.();
    markWatchCardDone().catch((e: unknown) => console.warn('[watch install] could not save Not now', e));
  };
  const link = { minHeight: 48, minWidth: 48, justifyContent: 'center' as const };
  return (
    <Card style={{ gap: space.xs }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
        {WATCH_WORDS.cardTitle}
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 19, color: color.inkSecondary }}
      >
        {busy ? WATCH_WORDS.opening : (note ?? WATCH_WORDS.cardBody)}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl }}>
        {note == null ? (
          <Pressable onPress={install} disabled={busy} accessibilityRole="button" accessibilityState={{ busy }} style={link}>
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{WATCH_WORDS.install}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={close} accessibilityRole="button" style={link}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: note == null ? color.inkSecondary : color.accent }}>
            {note == null ? WATCH_WORDS.notNow : WATCH_WORDS.gotIt}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}
