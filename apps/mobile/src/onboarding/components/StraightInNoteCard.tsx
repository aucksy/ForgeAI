/**
 * R-587 review: the Workout tab's one-time line for a member who went straight into the gym: they were set up as
 * "New to lifting" and "Build muscle", and both change in Profile (onboarding/straightInNote.ts). One notice at a
 * time (lib/workoutNotices.ts, kind 'setupGuess'). "Open Profile" and "Got it" both end it on this phone.
 */
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { useReportWant, type NoticeSlotProps } from '@/components/noticeSlot';
import { navigateOnce } from '@/lib/guardedAction';
import { color, space, type } from '@/theme/tokens';

import { STRAIGHT_IN_NOTE, markStraightInNote, readStraightInNote } from '../straightInNote';

export function StraightInNoteCard({ hidden = false, onWant, onDone }: NoticeSlotProps = {}) {
  const router = useRouter();
  const busy = useRef(false);
  const [due, setDue] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void readStraightInNote().then((d) => {
        if (live) setDue(d);
      });
      return () => {
        live = false;
      };
    }, []),
  );

  useReportWant(due, onWant);
  if (!due || hidden) return null;

  const close = (): void => {
    setDue(false);
    onDone?.();
    markStraightInNote('done').catch((e: unknown) => console.warn('[straight-in note] could not save that it was closed', e));
  };
  const open = (): void => {
    close();
    navigateOnce(busy, () => router.push('/profile' as Href));
  };
  const link = { minHeight: 48, minWidth: 48, justifyContent: 'center' as const };
  return (
    <Card style={{ gap: space.xs }}>
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, lineHeight: 20, color: color.ink }}>{STRAIGHT_IN_NOTE.body}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl }}>
        <Pressable onPress={open} accessibilityRole="button" style={link}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{STRAIGHT_IN_NOTE.open}</Text>
        </Pressable>
        <Pressable onPress={close} accessibilityRole="button" style={link}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>{STRAIGHT_IN_NOTE.close}</Text>
        </Pressable>
      </View>
    </Card>
  );
}
