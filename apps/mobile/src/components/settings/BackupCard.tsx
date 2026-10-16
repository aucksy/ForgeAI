import type { ReactNode } from 'react';
import { restoreConfirmText } from '@/store/restoreImpact';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';

import { shownBackupError } from '@/cloud/backupWords';
import { isDriveConfigured } from '@/cloud/drive';
import { askConfirm, Card, GhostButton, Icon, PrimaryButton } from '@/components/ui';
import { clockTime, tinyDateWithYear, toISO } from '@/lib/date';
import { success, warn } from '@/lib/haptics';
import { undoRestoreBody, useBackup } from '@/store/backupStore';
import { useChat } from '@/store/chatStore';
import { useDashboard } from '@/store/dashboardStore';
import { useSettings } from '@/store/settingsStore';
import { color, space, type } from '@/theme/tokens';
import { countWorkouts, saveMyHistory } from '@/tracker/services/historyExport';
import { measurementsNote, saveMyMeasurements } from '@/tracker/services/measurementsExport';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

import { PhotoBackupCard } from './PhotoBackupCard';

/** ISO → "8 Jul, 14:30" ("8 Jul 2025, 14:30" in another year) — the shared date and clock. */
function fmtWhen(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${tinyDateWithYear(toISO(d))}, ${clockTime(d.getTime())}`;
}

/** "412 workouts" / "1 workout" / "No workouts yet". PURE. */
export function workoutsLine(n: number | null): string {
  if (n == null) return 'Your workouts';
  if (n === 0) return 'No workouts yet';
  return `${n} ${n === 1 ? 'workout' : 'workouts'}`;
}

function Body({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: type.body,
        fontSize: type.size.sub,
        color: color.inkSecondary,
        marginTop: space.xs,
        lineHeight: 19,
      }}
    >
      {children}
    </Text>
  );
}

function Note({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <Text
      style={{
        fontFamily: tone === 'error' ? type.bodyMedium : type.body,
        fontSize: type.size.caption,
        color: tone === 'error' ? color.criticalText : color.inkMuted,
        marginTop: space.md,
        lineHeight: 16,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * Settings → Backup (audit SH-27, DS-01, DS-12). Leads with what is true today:
 *  - Android's own backup carries the workouts to the member's Google account (the app's backup
 *    rules include the database). Android never tells an app WHEN it backed up, so no time is
 *    claimed. Photos only when the member turns on "Include photos in my backup" (PG-17 / D11).
 *  - ("Save my history" is on Export & import since redesign R6: `SaveHistoryCard`.)
 * Below that, the member-owned Google Drive backup — still hidden until the build carries a
 * Google client id (owner gate), so nothing here promises a backup that doesn't exist.
 */
export function BackupCard() {
  const [workouts, setWorkouts] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      countWorkouts()
        .then((n) => live && setWorkouts(n))
        .catch(() => live && setWorkouts(null));
      return () => {
        live = false;
      };
    }, []),
  );

  return (
    <View style={{ gap: space.md }}>
      <Card>
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          {workoutsLine(workouts)}
        </Text>
        <Body>
          Android backs this up to your Google account when backup is on in your phone’s settings.
          Photos stay on this phone unless you include them below.
        </Body>
      </Card>
      <PhotoBackupCard />
      {isDriveConfigured() ? <DriveBackup /> : null}
    </View>
  );
}

/**
 * Settings → Export & import (redesign R6): "Save my history" — the whole history as a
 * Hevy-format CSV, which "Import from Hevy" reads back (also Hevy and Strong).
 */
export function SaveHistoryCard() {
  const units = useSettings((s) => s.unitSystem);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<{ text: string; tone: 'muted' | 'error' } | null>(null);

  const onSave = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setSaveNote(null);
    try {
      const res = await saveMyHistory(units);
      if (!res.written) setSaveNote({ text: 'Nothing to save yet — log a workout first.', tone: 'muted' });
      else if (res.shared) success();
      else setSaveNote({ text: 'Sharing isn’t available on this phone, so the file couldn’t be handed over.', tone: 'error' });
    } catch {
      warn();
      setSaveNote({ text: 'Couldn’t save your history. Please try again.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <GhostButton label={saving ? 'Saving…' : 'Save my history'} icon="calendar" onPress={() => void onSave()} />
      <Note>
        Every workout and set in one file (Hevy’s format). Keep it in Drive or email it to
        yourself — “Import from Hevy” reads it back.
      </Note>
      {saveNote ? <Note tone={saveNote.tone}>{saveNote.text}</Note> : null}
    </Card>
  );
}

/**
 * Settings → Export & import: "Save my measurements" — body weight and body measurements as a
 * CSV (Hevy's "Export measurements"), one row per day. The sample member's data is never saved.
 */
export function SaveMeasurementsCard() {
  const units = useSettings((s) => s.unitSystem);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<{ text: string; tone: 'muted' | 'error' } | null>(null);

  const onSave = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setSaveNote(null);
    // saveMyMeasurements never throws: every failure comes back as a result with plain words.
    const res = await saveMyMeasurements(units);
    const note = measurementsNote(res);
    if (res.kind === 'saved' && res.shared) success();
    else if (note?.tone === 'error') warn();
    setSaveNote(note);
    setSaving(false);
  };

  return (
    <Card>
      <GhostButton label={saving ? 'Saving…' : 'Save my measurements'} icon="ruler" onPress={() => void onSave()} />
      <Note>
        Your body weight, body fat and body measurements in one file, a row per day. Opens in any
        spreadsheet.
      </Note>
      {saveNote ? <Note tone={saveNote.tone}>{saveNote.text}</Note> : null}
    </Card>
  );
}

/**
 * Member-owned FULL-history backup to the member's OWN Google Drive (DS-10: five dated copies,
 * an empty phone never backs up over a real backup, a safety copy before every restore). Never
 * makes a network call until the member links Google.
 */
function DriveBackup() {
  const email = useBackup((s) => s.googleEmail);
  const lastBackupAt = useBackup((s) => s.lastBackupAt);
  const busy = useBackup((s) => s.busy);
  const canUndoRestore = useBackup((s) => s.canUndoRestore);
  const init = useBackup((s) => s.init);
  const linkGoogle = useBackup((s) => s.linkGoogle);
  const unlinkGoogle = useBackup((s) => s.unlinkGoogle);
  const backupNow = useBackup((s) => s.backupNow);
  const checkForBackup = useBackup((s) => s.checkForBackup);
  const restoreFound = useBackup((s) => s.restoreFound);
  const undoRestore = useBackup((s) => s.undoRestore);
  const undoRestoreImpact = useBackup((s) => s.undoRestoreImpact);
  const clearFound = useBackup((s) => s.clearFound);

  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  const say = (msg: string | null, err: string | null = null): void => {
    setNote(msg);
    setError(err);
  };

  const onLink = async () => {
    say(null);
    try {
      const linked = await linkGoogle();
      if (linked) success();
    } catch (e) {
      say(null, shownBackupError(e, 'Could not link Google Drive. Check your internet and try again.', 'link'));
    }
  };

  const onBackup = async () => {
    say(null);
    try {
      await backupNow();
      success();
      say('Backed up. Drive keeps your last 5 backups.');
    } catch (e) {
      warn();
      say(null, shownBackupError(e, 'Backup failed. Nothing on this phone changed. Please try again.', 'backup'));
    }
  };

  const refreshScreens = async (): Promise<void> => {
    await Promise.all([useDashboard.getState().refresh(), useChat.getState().load()]);
  };

  const onRestore = async () => {
    say(null);
    // v0.28.1: a restore replaces the exercises an open workout points at, so that workout
    // could never be saved. Finish or discard it first.
    await useActiveWorkout.getState().hydrate().catch(() => undefined);
    if (useActiveWorkout.getState().active) {
      say(null, 'Finish your workout first: finish or discard the workout in progress, then restore.');
      return;
    }
    try {
      const { found } = await checkForBackup();
      if (!found) {
        say('There’s no ForgeAI backup in this Google account yet.');
        return;
      }
      const info = useBackup.getState().found;
      const detail = info ? ` from ${fmtWhen(info.exportedAt)} (${info.workouts} workouts, ${info.meals} meals)` : '';
      // C4-9: say how many workouts on this phone the backup does not have (they go).
      const removes = await useBackup
        .getState()
        .foundRemoves()
        .catch((e: unknown) => {
          console.warn('[ForgeErr] restore: could not count the workouts a restore removes', e);
          return 0;
        });
      const ok = await askConfirm({
        title: 'Restore from Drive?',
        body: restoreConfirmText(`This replaces what’s on this phone with your backup${detail}.`, removes),
        confirmLabel: 'Restore',
        destructive: true,
      });
      if (!ok) {
        clearFound();
        return;
      }
      const applied = await restoreFound();
      if (!applied) {
        say('That backup was already restored.');
        return;
      }
      await refreshScreens();
      success();
      say('Restored. Your history is back on this phone.');
    } catch (e) {
      warn();
      say(null, shownBackupError(e, 'Could not restore. Nothing was changed.', 'restore'));
    }
  };

  const onUndo = async () => {
    say(null);
    const impact = await undoRestoreImpact().catch(() => ({ available: true, newerWorkouts: 0 }));
    if (!impact.available) {
      say('There’s nothing to undo.');
      return;
    }
    const ok = await askConfirm({
      title: 'Undo the restore?',
      body: undoRestoreBody(impact.newerWorkouts),
      confirmLabel: 'Undo restore',
      destructive: true,
    });
    if (!ok) return;
    try {
      const done = await undoRestore();
      if (!done) {
        say('There’s nothing to undo.');
        return;
      }
      await refreshScreens();
      success();
      say('Done. This phone is back to how it was before the restore.');
    } catch (e) {
      warn();
      say(null, shownBackupError(e, 'Could not undo. Nothing was changed.', 'undo restore'));
    }
  };

  const messages = (
    <>
      {note ? <Note>{note}</Note> : null}
      {error ? <Note tone="error">{error}</Note> : null}
    </>
  );

  if (!email) {
    return (
      <Card>
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          Google Drive backup
        </Text>
        <Body>
          Also keep a copy in your own Google Drive, restorable on any phone. It stays private to your
          Google account.
        </Body>
        {messages}
        <View style={{ marginTop: space.lg }}>
          <PrimaryButton
            label={busy ? 'Linking…' : 'Link Google Drive'}
            icon="globe"
            loading={busy}
            disabled={busy}
            onPress={() => void onLink()}
          />
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="check" size={18} color={color.good} />
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          Google Drive backup on
        </Text>
      </View>
      <Body>
        Linked to {email}. Last backup: {fmtWhen(lastBackupAt)}.
      </Body>
      <View style={{ marginTop: space.lg, gap: space.sm }}>
        <PrimaryButton
          label={busy ? 'Working…' : 'Back up now'}
          icon="check"
          loading={busy}
          disabled={busy}
          onPress={() => void onBackup()}
        />
        <GhostButton
          label="Restore from Drive"
          icon="clock"
          onPress={() => {
            if (busy) return; // GhostButton has no disabled state — gate concurrent actions here
            void onRestore();
          }}
        />
        {canUndoRestore ? (
          <GhostButton
            label="Undo the last restore"
            icon="clock"
            onPress={() => {
              if (busy) return;
              void onUndo();
            }}
          />
        ) : null}
        <GhostButton
          label="Unlink Google"
          onPress={() => {
            if (busy) return;
            void unlinkGoogle();
          }}
        />
      </View>
      {messages}
    </Card>
  );
}
