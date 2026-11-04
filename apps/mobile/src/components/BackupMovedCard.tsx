/**
 * R-320: the Workout tab's one-off "Backups now go to your MettleUp account" card, for a phone that has
 * Google Drive linked from an older version (lib/backupMoved.ts). It took the place of the old "last
 * backed up to Google Drive N days ago" card (BackupNudgeCard, removed with Drive backups).
 * "Sign in" opens Settings -> Backup and restore; "Got it" closes it. Either ends it on this phone.
 */
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { BACKUP_MOVED_WORDS, backupMovedDue, markBackupMovedSeen, readBackupMoved } from '@/lib/backupMoved';
import { navigateOnce } from '@/lib/guardedAction';
import { useAccount } from '@/store/accountStore';
import { color, space, type } from '@/theme/tokens';

import { useReportWant, type NoticeSlotProps } from './noticeSlot';

export function BackupMovedCard({ hidden = false, onWant, onDone }: NoticeSlotProps = {}) {
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
          .catch((e: unknown) => console.warn('[backup moved] could not read the account', e));
        const m = await readBackupMoved();
        if (!live) return;
        const a = useAccount.getState();
        setDue(backupMovedDue({ ...m, signedIn: a.account != null, accountAvailable: a.configured }));
      })();
      return () => {
        live = false;
      };
    }, []),
  );

  const shows = due && !signedIn;
  useReportWant(shows, onWant);
  if (!shows || hidden) return null;

  const close = (): void => {
    setDue(false);
    onDone?.();
    markBackupMovedSeen().catch((e: unknown) => console.warn('[backup moved] could not save that the card was closed', e));
  };
  const signIn = (): void => {
    close();
    navigateOnce(busy, () => router.push('/settings/backup' as Href));
  };
  const link = { minHeight: 48, minWidth: 48, justifyContent: 'center' as const };
  return (
    <Card style={{ gap: space.xs }}>
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, lineHeight: 20, color: color.ink }}>{BACKUP_MOVED_WORDS.body}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl }}>
        <Pressable onPress={signIn} accessibilityRole="button" style={link}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{BACKUP_MOVED_WORDS.button}</Text>
        </Pressable>
        <Pressable onPress={close} accessibilityRole="button" style={link}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>{BACKUP_MOVED_WORDS.close}</Text>
        </Pressable>
      </View>
    </Card>
  );
}
