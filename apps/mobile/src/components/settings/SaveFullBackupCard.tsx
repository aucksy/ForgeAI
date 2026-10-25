/**
 * ForgeAI 0.55.2 — the old app's last update (R-123, owner 25 Oct 2026): Settings → Export & import →
 * "Save full backup" writes the SAME backup file MettleUp restores (src/backup: one ZIP with the
 * workouts, routines in their order, own exercises, rest times, body weight, measurements, photos,
 * profile and settings), so the member's ForgeAI data moves into MettleUp. Opens the share sheet.
 */
import Constants from 'expo-constants';
import * as Sharing from 'expo-sharing';
import { useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { deviceBackupIo } from '@/backup/backupIo';
import { saveBackupZip, sizeWords } from '@/backup/backupSave';
import { deviceSettingsIo } from '@/backup/backupSettings';
import { Card, PrimaryButton } from '@/components/ui';
import { success, warn } from '@/lib/haptics';
import { isDemoData } from '@/onboarding/db/dataActions';
import { useSettings } from '@/store/settingsStore';
import { color, space, type } from '@/theme/tokens';

export const MOVING_LINE =
  'Moving to MettleUp? Save a full backup here, then in MettleUp open Settings → Back up and restore → Restore from a backup.';
export const FULL_BACKUP_ABOUT =
  'One file with your workouts, routines in their order, your own exercises, rest times, body weight, measurements, photos, profile and settings. Your phone number and gym membership are never in it.';

/** "Saving 37 of 210 photos…". PURE. */
export function savingText(done: number, total: number): string {
  if (total <= 0) return 'Saving…';
  return `Saving ${Math.min(done, total)} of ${total} ${total === 1 ? 'photo' : 'photos'}…`;
}

function Line({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'error' | 'good' | 'lead' }) {
  return (
    <Text
      accessibilityLiveRegion={tone === 'error' || tone === 'good' ? 'polite' : undefined}
      style={{
        fontFamily: tone === 'lead' || tone === 'muted' ? type.body : type.bodyMedium,
        fontSize: type.size.sub,
        color: tone === 'error' ? color.criticalText : tone === 'lead' || tone === 'good' ? color.ink : color.inkSecondary,
        lineHeight: 19,
      }}
    >
      {children}
    </Text>
  );
}

export function SaveFullBackupCard() {
  const units = useSettings((s) => s.unitSystem);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; tone: 'muted' | 'error' | 'good' } | null>(null);
  const busyRef = useRef(false);

  const onSave = async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    setProgress(savingText(0, 0));
    try {
      if (await isDemoData().catch(() => false)) {
        setNote({ text: 'This is the sample member’s made-up data, so there is nothing of yours to back up.', tone: 'muted' });
        return;
      }
      const res = await saveBackupZip(deviceBackupIo, {
        app: 'ForgeAI',
        appVersion: Constants.expoConfig?.version ?? '',
        units,
        settings: await deviceSettingsIo.read(),
        onProgress: (p) => setProgress(savingText(p.done, p.total)),
      });
      if (res.kind === 'empty') setNote({ text: 'Nothing to back up yet. Log a workout or make a routine first.', tone: 'muted' });
      else if (res.kind === 'no-space' || res.kind === 'too-big') {
        const free = res.kind === 'no-space' ? res.freeBytes : 0;
        setNote({ text: `Your phone is short of space: this needs about ${sizeWords(res.needBytes)} and only ${sizeWords(free)} is free. Free up some space, then try again.`, tone: 'error' });
      } else if (await Sharing.isAvailableAsync()) {
        setProgress(null);
        await Sharing.shareAsync(res.uri, { mimeType: 'application/zip', dialogTitle: 'Save full backup', UTI: 'public.zip-archive' });
        success();
        const left = res.photosLeftOut > 0 ? ` ${res.photosLeftOut} photo${res.photosLeftOut === 1 ? '' : 's'} could not be read and ${res.photosLeftOut === 1 ? 'was' : 'were'} left out.` : '';
        setNote({
          text: `Saved ${res.name} (${sizeWords(res.bytes)}): ${res.counts.workouts} workout${res.counts.workouts === 1 ? '' : 's'}, ${res.counts.routines} routine${res.counts.routines === 1 ? '' : 's'} and ${res.counts.photos} photo${res.counts.photos === 1 ? '' : 's'}.${left}`,
          tone: 'good',
        });
      } else setNote({ text: 'Sharing isn’t available on this phone, so the file couldn’t be handed over.', tone: 'error' });
    } catch (e) {
      console.warn('[ForgeErr] full backup: saving the file failed', e);
      warn();
      setNote({ text: 'Couldn’t save the backup. Nothing on this phone changed. Please try again.', tone: 'error' });
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Card>
      <View style={{ gap: space.md }}>
        <Line tone="lead">{MOVING_LINE}</Line>
        <Line>{FULL_BACKUP_ABOUT}</Line>
        <PrimaryButton label={busy ? progress ?? 'Saving…' : 'Save full backup'} icon="send" loading={busy} disabled={busy} onPress={() => void onSave()} />
        {note ? <Line tone={note.tone}>{note.text}</Line> : null}
      </View>
    </Card>
  );
}
