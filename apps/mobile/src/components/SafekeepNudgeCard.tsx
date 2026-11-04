/**
 * Launch audit, 3 Nov 2026 (member app #3): the Workout tab's "Your workouts are only on this phone"
 * card for a member with no account and no backup, from their 3rd workout (lib/safekeepNudge.ts).
 * R-320: "Sign in to keep them safe" opens Settings -> Backup and restore (the MettleUp account, the one
 * backup); "Hide for 30 days" hides it for 30 days. Read again on every visit, so the card goes by itself
 * once the member signs in.
 */
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { navigateOnce } from '@/lib/guardedAction';
import { SAFEKEEP_WORDS, hideSafekeep, ownWorkoutCount, readSafekeepHidden, safekeepDue } from '@/lib/safekeepNudge';
import { useAccount } from '@/store/accountStore';
import { color, space, type } from '@/theme/tokens';

import { useReportWant, type NoticeSlotProps } from './noticeSlot';

export function SafekeepNudgeCard({ hidden = false, onWant, onDone }: NoticeSlotProps = {}) {
  const router = useRouter();
  const busy = useRef(false);
  const signedIn = useAccount((s) => s.account != null);
  const [due, setDue] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        await useAccount
          .getState()
          .init()
          .catch((e: unknown) => console.warn('[safekeep] could not read the account', e));
        const [workouts, hiddenUntil] = await Promise.all([ownWorkoutCount(), readSafekeepHidden()]);
        if (!live) return;
        const a = useAccount.getState();
        setDue(safekeepDue({ workouts, signedIn: a.account != null, accountAvailable: a.configured, hiddenUntil, now: Date.now() }));
      })();
      return () => {
        live = false;
      };
    }, []),
  );

  const shows = due && !signedIn;
  useReportWant(shows, onWant);
  if (!shows || hidden) return null;

  const open = () => navigateOnce(busy, () => router.push('/settings/backup' as Href));
  const hide = () => {
    setDue(false);
    onDone?.();
    hideSafekeep().catch((e: unknown) => console.warn('[safekeep] could not save Hide for 30 days', e));
  };
  const link = { minHeight: 48, minWidth: 48, justifyContent: 'center' as const };
  return (
    <Card style={{ gap: space.xs }}>
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, lineHeight: 20, color: color.ink }}>{SAFEKEEP_WORDS.body}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl }}>
        <Pressable onPress={open} accessibilityRole="button" style={link}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{SAFEKEEP_WORDS.button}</Text>
        </Pressable>
        <Pressable onPress={hide} accessibilityRole="button" style={link}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>{SAFEKEEP_WORDS.hide}</Text>
        </Pressable>
      </View>
    </Card>
  );
}
