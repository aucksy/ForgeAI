/**
 * F186: "Make your first routine" on the Workout tab, under the Routines buttons (where "No
 * routines yet" stood), for a member with no routines who never skipped or finished the guide.
 * "Make a routine" opens the four steps (`app/routines/first.tsx`); "Skip" hides it for good.
 * A member seen with routines is marked done, so the card never shows to them later.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, PrimaryButton } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { useOnboarding } from '@/onboarding/store/onboardingStore';
import { color, space, type } from '@/theme/tokens';

import { CARD_WORDS, GUIDE_DONE, guideCardShows, shouldMarkDone } from '../lib/firstRoutine';
import { markGuideDone, readGuideMark } from '../services/firstRoutineGuide';

/** The card, or null; `onShows` says whether it is on screen (the tab's empty line steps aside). */
export function FirstRoutineCard({ routineCount, onShows }: { routineCount: number | null; onShows?: (shows: boolean) => void }) {
  const router = useRouter();
  const demo = useOnboarding((s) => s.demo);
  const [stored, setStored] = useState<string | null | undefined>(undefined);
  // One tap opens one guide.
  const lastOpen = useRef(0);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void readGuideMark().then((m) => {
        if (live) setStored(m);
      });
      return () => {
        live = false;
      };
    }, []),
  );

  useEffect(() => {
    if (!shouldMarkDone({ stored, routineCount })) return;
    setStored(GUIDE_DONE);
    void markGuideDone();
  }, [stored, routineCount]);

  const shows = guideCardShows({ stored, routineCount, demo });
  useEffect(() => {
    onShows?.(shows);
  }, [shows, onShows]);
  if (!shows) return null;

  const open = (): void => {
    const now = Date.now();
    if (now - lastOpen.current < 800) return;
    lastOpen.current = now;
    tap();
    router.push('/routines/first');
  };
  const skip = (): void => {
    tap();
    setStored(GUIDE_DONE);
    void markGuideDone();
  };

  return (
    <Card style={{ gap: space.sm }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.body, color: color.ink }}>
        {CARD_WORDS.title}
      </Text>
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 19, color: color.inkSecondary }}>{CARD_WORDS.line}</Text>
      <PrimaryButton label={CARD_WORDS.go} icon="list" onPress={open} />
      <View style={{ alignItems: 'center' }}>
        <Pressable
          onPress={skip}
          accessibilityRole="button"
          accessibilityLabel="Skip making a routine now"
          style={{ minHeight: 48, minWidth: 96, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>{CARD_WORDS.skip}</Text>
        </Pressable>
      </View>
    </Card>
  );
}
