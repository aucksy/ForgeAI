/** Workout tab: "last backed up N days ago · Back up now", for members who linked Drive (cloud/autoBackup). */
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Card, GhostButton } from '@/components/ui';
import { AUTO_BACKUP_WORDS, staleBackupDays } from '@/cloud/autoBackup';
import { shownBackupError } from '@/cloud/backupWords';
import { useBackup } from '@/store/backupStore';
import { color, space, type } from '@/theme/tokens';

export function BackupNudgeCard() {
  const linked = useBackup((s) => Boolean(s.configured && s.googleEmail));
  const lastAt = useBackup((s) => s.lastBackupAt);
  const busy = useBackup((s) => s.busy);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    useBackup
      .getState()
      .init()
      .catch((e: unknown) => console.warn('[backup nudge] could not read the backup state', e));
  }, []);
  const days = staleBackupDays(linked, lastAt, Date.now());
  if (days == null && !note) return null;

  const backUp = () => {
    if (busy) return;
    setNote(null);
    useBackup
      .getState()
      .backupNow()
      .then(
        () => setNote(AUTO_BACKUP_WORDS.done),
        (e: unknown) => {
          console.warn('[backup nudge] backup failed', e);
          setNote(shownBackupError(e, AUTO_BACKUP_WORDS.failed, 'backup'));
        },
      );
  };
  return (
    <Card style={{ gap: space.sm }}>
      {days != null ? (
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>
          {AUTO_BACKUP_WORDS.stale(days)}
        </Text>
      ) : null}
      {note ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: note === AUTO_BACKUP_WORDS.done ? color.goodText : color.criticalText }}>
          {note}
        </Text>
      ) : null}
      {days != null ? <GhostButton label={busy ? 'Backing up…' : AUTO_BACKUP_WORDS.button} icon="check" onPress={backUp} /> : null}
    </Card>
  );
}
