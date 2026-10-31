/**
 * R-248: the one-time "Install MettleUp on your watch" card at the top of the workout screen, the first
 * time the member STARTS a workout with a Wear OS watch connected that lacks the MettleUp watch app
 * (rule: tracker/services/watchInstall.ts watchStartCardShows). Slim, so it never stands between the
 * member and the first set. "Install on watch" opens the watch's Play Store on MettleUp; "Not now"
 * closes it. It is marked shown the moment it appears: it never comes back on a later start.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useOnboarding } from '@/onboarding/store/onboardingStore';
import { color, radius, space, type } from '@/theme/tokens';
import { START_WINDOW_MS } from '@/tracker/services/watchOpen';
import {
  WATCH_WORDS,
  installNote,
  installOnWatch,
  markStartCardDone,
  readStartCardMark,
  readWatchCardMark,
  readWatchStateQuick,
  watchStartCardShows,
} from '@/tracker/services/watchInstall';

const START_CARD_WAIT_MS = 2000;

export interface WatchStartCardProps {
  /** The workout's start time (null = no workout). */
  startedAt: number | null;
  /** A correction of a saved workout or a past log: never a start. */
  editing: boolean;
}

export function WatchStartCard({ startedAt, editing }: WatchStartCardProps) {
  const [shows, setShows] = useState(false);
  const [busy, setBusy] = useState(false);
  // The line after "Install on watch"; the card stays until "Got it".
  const [note, setNote] = useState<string | null>(null);

  // Decided once, when the workout screen opens: a start is a start only at that moment.
  useEffect(() => {
    const freshStart = !editing && startedAt != null && Math.abs(Date.now() - startedAt) <= START_WINDOW_MS;
    const demo = useOnboarding.getState().demo;
    if (!freshStart || demo) return undefined;
    let live = true;
    void (async () => {
      const [startStored, cardStored] = await Promise.all([readStartCardMark(), readWatchCardMark()]);
      if (!live || startStored === 'done' || cardStored === 'done') return;
      // At most 2 s: a later card would push the set rows down after the member has started.
      const state = await readWatchStateQuick(START_CARD_WAIT_MS);
      if (!live || !watchStartCardShows({ state, freshStart, demo, startStored, cardStored })) return;
      setShows(true);
      markStartCardDone().catch((e: unknown) => console.warn('[watch install] could not save the start card mark', e));
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per screen: a later change is not a start
  }, []);

  if (!shows) return null;

  const install = () => {
    if (busy) return;
    setBusy(true);
    void installOnWatch()
      .then((r) => setNote(installNote(r)))
      .finally(() => setBusy(false));
  };
  const close = () => setShows(false);
  const link = { minHeight: 48, minWidth: 48, justifyContent: 'center' as const };
  return (
    <View
      style={{
        paddingHorizontal: space.md,
        paddingTop: space.sm,
        borderRadius: radius.md,
        backgroundColor: color.surfaceRaised,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
        {WATCH_WORDS.startTitle}
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 19, color: color.inkSecondary, marginTop: 2 }}
      >
        {busy ? WATCH_WORDS.opening : (note ?? WATCH_WORDS.startBody)}
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
    </View>
  );
}
