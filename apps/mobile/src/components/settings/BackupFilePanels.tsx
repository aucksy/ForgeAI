/**
 * R-123 — the backup FILE, for every member, with or without a gym:
 *  - `SaveBackupPanel` (Settings → Back up and restore → "Save a backup"): writes one ZIP with
 *    everything (src/backup) and opens Android's share sheet, so it can go to Files, Drive or
 *    WhatsApp. While the photos go in it says "Saving 37 of 210 photos…".
 *  - `RestoreBackupPanel` (Settings → "Restore from a backup", and the welcome screen's "Restore
 *    from a backup"): pick a file → what is in it and who made it → "Replace everything on this
 *    phone" or "Add to what's here" → "Undo restore" while the member stays on the screen.
 * The confirm is the app's own sheet (the welcome screen renders before the navigator, so there is
 * no shared confirm host there).
 */
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { deviceBackupIo } from '@/backup/backupIo';
import { openBackup, type OpenedBackup } from '@/backup/backupOpen';
import { backupStarts, phoneContents, restoreBackup, undoRestore, type RestoreMode, type RestoreProgress, type UndoToken } from '@/backup/backupRestore';
import { saveBackupZip } from '@/backup/backupSave';
import { deviceSettingsIo } from '@/backup/backupSettings';
import {
  ADD_LABEL,
  choiceHelp,
  FINISH_WORKOUT_FIRST,
  HEALTH_AGAIN,
  noSpaceText,
  REPLACE_LABEL,
  replaceQuestion,
  RESTORE_ABOUT,
  RESTORE_FAILED,
  restoredText,
  restoringText,
  SAVE_ABOUT,
  SAVE_DEMO,
  SAVE_EMPTY,
  SAVE_FAILED,
  SAVE_NEVER,
  savedText,
  savingText,
  SHARE_MISSING,
  UNDO_DONE,
  UNDO_FAILED,
} from '@/backup/backupText';
import { Card, ConfirmSheet, GhostButton, PrimaryButton } from '@/components/ui';
import { success, warn } from '@/lib/haptics';
import { isDemoData } from '@/onboarding/db/dataActions';
import { replaceImpact } from '@/onboarding/db/importSafety';
import { useSettings } from '@/store/settingsStore';
import { color, space, type } from '@/theme/tokens';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

function Body({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>{children}</Text>;
}

function Note({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'error' | 'good' }) {
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={{
        fontFamily: tone === 'muted' ? type.body : type.bodyMedium,
        fontSize: type.size.sub,
        color: tone === 'error' ? color.criticalText : tone === 'good' ? color.ink : color.inkMuted,
        lineHeight: 19,
      }}
    >
      {children}
    </Text>
  );
}

const appVersion = (): string => Constants.expoConfig?.version ?? '';

/** Refresh what the screens show after the data changed (best effort). */
async function refreshAfterRestore(): Promise<void> {
  const [{ useDashboard }, { useChat }, { useOnboarding }] = await Promise.all([
    import('@/store/dashboardStore'),
    import('@/store/chatStore'),
    import('@/onboarding/store/onboardingStore'),
  ]);
  await Promise.all([useDashboard.getState().refresh(), useChat.getState().load(), useOnboarding.getState().refreshDemoFlag()]).catch((e: unknown) =>
    console.warn('[backup] screens did not all refresh', e),
  );
}

// ------------------------------------------------------------------ Save a backup

export function SaveBackupPanel() {
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
        setNote({ text: SAVE_DEMO, tone: 'muted' });
        return;
      }
      const settings = await deviceSettingsIo.read();
      const res = await saveBackupZip(deviceBackupIo, {
        app: 'MettleUp',
        appVersion: appVersion(),
        units,
        settings,
        onProgress: (p) => setProgress(savingText(p.done, p.total)),
      });
      if (res.kind === 'empty') setNote({ text: SAVE_EMPTY, tone: 'muted' });
      else if (res.kind === 'no-space') setNote({ text: noSpaceText(res.needBytes, res.freeBytes), tone: 'error' });
      else if (res.kind === 'too-big') setNote({ text: noSpaceText(res.needBytes, 0), tone: 'error' });
      else {
        setProgress(null);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(res.uri, { mimeType: 'application/zip', dialogTitle: 'Save a backup', UTI: 'public.zip-archive' });
          success();
          setNote({ text: savedText({ name: res.name, bytes: res.bytes, workouts: res.counts.workouts, photos: res.counts.photos, photosLeftOut: res.photosLeftOut }), tone: 'good' });
        } else setNote({ text: SHARE_MISSING, tone: 'error' });
      }
    } catch (e) {
      console.warn('[ForgeErr] backup: saving the backup file failed', e);
      warn();
      setNote({ text: SAVE_FAILED, tone: 'error' });
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Card>
      <View style={{ gap: space.md }}>
        <Body>{SAVE_ABOUT}</Body>
        <Note>{SAVE_NEVER}</Note>
        <PrimaryButton label={busy ? progress ?? 'Saving…' : 'Save the backup file'} icon="send" loading={busy} disabled={busy} onPress={() => void onSave()} />
        {note ? <Note tone={note.tone}>{note.text}</Note> : null}
      </View>
    </Card>
  );
}

// ------------------------------------------------------------------ Restore from a backup

type Phase = 'pick' | 'chosen' | 'working' | 'done';

export function RestoreBackupPanel({ welcome = false, onRestored }: { welcome?: boolean; onRestored?: () => void | Promise<void> }) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [opened, setOpened] = useState<OpenedBackup | null>(null);
  const [phone, setPhone] = useState({ workouts: 0, folders: 0, measurements: 0 });
  const [demo, setDemo] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; tone: 'muted' | 'error' | 'good' } | null>(null);
  const [ask, setAsk] = useState<{ title: string; body: string } | null>(null);
  const [undo, setUndo] = useState<UndoToken | null>(null);
  const busyRef = useRef(false);

  // The picked copy lives in the app's cache: gone once the member leaves.
  const pickedUri = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (pickedUri.current) deviceBackupIo.remove(pickedUri.current);
    },
    [],
  );

  const run = async (fn: () => Promise<void>): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await fn();
    } finally {
      busyRef.current = false;
    }
  };

  const onPick = (): Promise<void> =>
    run(async () => {
      setNote(null);
      const res = await DocumentPicker.getDocumentAsync({ type: ['*/*'], copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      if (pickedUri.current) deviceBackupIo.remove(pickedUri.current);
      pickedUri.current = res.assets[0].uri;
      const r = await openBackup(deviceBackupIo, res.assets[0].uri);
      if (!r.ok) {
        warn();
        setOpened(null);
        setPhase('pick');
        setNote({ text: r.why, tone: 'error' });
        return;
      }
      const isDemo = await isDemoData().catch(() => false);
      setDemo(isDemo);
      setPhone(await phoneContents().catch(() => ({ workouts: 0, folders: 0, measurements: 0 })));
      setOpened(r.backup);
      setPhase('chosen');
    }).catch((e: unknown) => {
      console.warn('[ForgeErr] backup: picking the file failed', e);
      setNote({ text: RESTORE_FAILED, tone: 'error' });
    });

  const restore = (mode: RestoreMode): Promise<void> =>
    run(async () => {
      if (!opened) return;
      await useActiveWorkout
        .getState()
        .hydrate()
        .catch((e: unknown) => console.warn('[backup] the open workout could not be read', e));
      if (useActiveWorkout.getState().active) {
        setNote({ text: FINISH_WORKOUT_FIRST, tone: 'error' });
        return;
      }
      setNote(null);
      setPhase('working');
      setProgress(restoringText('data', 0, 1));
      try {
        const r = await restoreBackup(deviceBackupIo, opened, mode, {
          settings: deviceSettingsIo,
          onProgress: (p: RestoreProgress) => setProgress(restoringText(p.step, p.done, p.total)),
        });
        if (r.kind === 'no-space') {
          setPhase('chosen');
          setNote({ text: noSpaceText(r.needBytes, r.freeBytes), tone: 'error' });
          return;
        }
        await refreshAfterRestore();
        success();
        const o = r.outcome;
        setNote({
          text:
            restoredText({ mode, workouts: o.workouts, routines: o.routines, measurements: o.measurements, photos: r.photos, photosFailed: r.photosFailed, alreadyHere: o.alreadyHere }) +
            (r.healthConnectWasOn ? ` ${HEALTH_AGAIN}` : ''),
          tone: 'good',
        });
        setUndo(welcome ? null : r.undo);
        setPhase('done');
        await onRestored?.();
      } catch (e) {
        console.warn('[ForgeErr] backup: the restore failed', e);
        warn();
        setPhase('chosen');
        setNote({ text: RESTORE_FAILED, tone: 'error' });
      } finally {
        setProgress(null);
      }
    });

  const onReplace = async (): Promise<void> => {
    if (!opened) return;
    if (!hasData) {
      void restore('replace');
      return;
    }
    const impact = await replaceImpact(backupStarts(opened.file)).catch(() => ({ removed: phone.workouts, onlyHere: 0 }));
    setAsk(replaceQuestion(impact.removed, impact.onlyHere));
  };

  const onUndo = (): Promise<void> =>
    run(async () => {
      if (!undo) return;
      setPhase('working');
      setProgress('Putting this phone back…');
      try {
        await undoRestore(deviceBackupIo, undo, deviceSettingsIo);
        await refreshAfterRestore();
        success();
        setUndo(null);
        setNote({ text: UNDO_DONE, tone: 'good' });
      } catch (e) {
        console.warn('[ForgeErr] backup: undo failed', e);
        warn();
        setNote({ text: UNDO_FAILED, tone: 'error' });
      } finally {
        setProgress(null);
        setPhase('done');
      }
    });

  const working = phase === 'working';
  // Over the sample member's data, or an empty phone, there is nothing to add to: one Restore.
  const hasData = phone.workouts > 0 || (!demo && (phone.folders > 0 || phone.measurements > 0));
  const oneChoice = demo || !hasData;

  return (
    <Card>
      <View style={{ gap: space.md }}>
        {phase === 'pick' ? <Body>{RESTORE_ABOUT}</Body> : null}
        {opened && phase !== 'pick' ? (
          <View style={{ gap: space.xs }}>
            <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>In this backup</Text>
            <Body>{opened.summary}.</Body>
          </View>
        ) : null}
        {phase === 'pick' ? <PrimaryButton label="Choose backup file" icon="import" onPress={() => void onPick()} /> : null}
        {phase === 'chosen' && opened ? (
          <>
            {!oneChoice ? <Note>{choiceHelp(phone.workouts)}</Note> : demo ? <Note>The sample member’s made-up workouts go first.</Note> : <Note>{choiceHelp(0)}</Note>}
            <PrimaryButton label={oneChoice ? 'Restore' : REPLACE_LABEL} icon="check" onPress={() => void onReplace()} />
            {!oneChoice ? <GhostButton label={ADD_LABEL} icon="plus" onPress={() => void restore('add')} /> : null}
            <GhostButton label="Choose another file" icon="import" onPress={() => void onPick()} />
          </>
        ) : null}
        {working ? <PrimaryButton label={progress ?? 'Working…'} loading disabled onPress={() => undefined} /> : null}
        {note ? <Note tone={note.tone}>{note.text}</Note> : null}
        {phase === 'done' && undo ? <GhostButton label="Undo restore" icon="clock" onPress={() => void onUndo()} /> : null}
      </View>
      <ConfirmSheet
        visible={ask != null}
        title={ask?.title ?? ''}
        body={ask?.body ?? ''}
        confirmLabel="Replace"
        destructive
        onConfirm={() => {
          setAsk(null);
          void restore('replace');
        }}
        onCancel={() => setAsk(null)}
      />
    </Card>
  );
}
