/**
 * Settings cards about the member's own copies of their data. R-320 (owner, 4 Nov 2026): the MettleUp
 * account is the one backup (AccountCard). Here: the spreadsheet files ("Save as a spreadsheet") and the
 * card that brings back an old Google Drive backup (Drive backup itself is no longer offered). The old
 * "Android backs this up" card and the "Include photos in my backup" switch left the Backup page with it
 * (`PhoneBackupCard`, kept on a page no row links to, for the cloud check of Android's own backup, part M).
 */
import type { ReactNode } from 'react';
import { restoreConfirmText } from '@/store/restoreImpact';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';

import { RestoredUntidyError, shownBackupError } from '@/cloud/backupWords';
import { askConfirm, Card, GhostButton, PrimaryButton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { clockTime, tinyDateWithYear, toISO } from '@/lib/date';
import { success, warn } from '@/lib/haptics';
import { undoRestoreBody, useBackup } from '@/store/backupStore';
import { JoinAgreement } from '@/shop/JoinAgreement';
import { useTermsAgreement } from '@/shop/useTermsAgreement';
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

/** "412 workouts" / "1 workout" / "No workouts yet". PURE. */
export function workoutsLine(n: number | null): string {
  if (n == null) return 'Your workouts';
  if (n === 0) return 'No workouts yet';
  return `${n} ${n === 1 ? 'workout' : 'workouts'}`;
}

/**
 * Android's own backup (audit SH-27, DS-01, DS-12): Android carries the workouts to the member's Google
 * account when backup is on in the phone's settings (the app's backup rules include the database); Android
 * never tells an app WHEN, so no time is claimed. Photos only with "Include photos in my backup" (PG-17).
 * R-320: no longer on the Backup page (one backup: the MettleUp account). Kept on /settings/phone-backup,
 * which no row links to, so the cloud check of Android's backup (qa part M) can still open it.
 */
export function PhoneBackupCard() {
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
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{workoutsLine(workouts)}</Text>
        <Body>
          Android backs this up to your Google account when backup is on in your phone’s settings.
          Photos stay on this phone unless you include them below.
        </Body>
      </Card>
      <PhotoBackupCard />
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
 * R-320 (owner, 4 Nov 2026: "Backups - Lets go with A"): Google Drive backup is no longer a choice; the
 * MettleUp account is the one backup. This card only BRINGS BACK a Drive backup made by an older version,
 * for a member on a new phone (Settings → Backup and restore → "Bring back a Google Drive backup").
 * Nothing here backs up to Drive any more. Never makes a network call until the member taps.
 * TODO(R-320, remove ~Feb 2027): drop this card, its page and the Drive restore code once members have
 * had a few versions to bring their Drive backups in.
 */
export function DriveRestoreCard() {
  const email = useBackup((s) => s.googleEmail);
  const busy = useBackup((s) => s.busy);
  const canUndoRestore = useBackup((s) => s.canUndoRestore);
  const init = useBackup((s) => s.init);
  const linkGoogle = useBackup((s) => s.linkGoogle);
  const unlinkGoogle = useBackup((s) => s.unlinkGoogle);
  const checkForBackup = useBackup((s) => s.checkForBackup);
  const restoreFound = useBackup((s) => s.restoreFound);
  const undoRestore = useBackup((s) => s.undoRestore);
  const undoRestoreImpact = useBackup((s) => s.undoRestoreImpact);
  const clearFound = useBackup((s) => s.clearFound);

  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // D7 (0.77.0 adversarial review, 11 Nov 2026): this button opens Google's sign-in too, so the same
  // 18+ / terms box as "Continue with Google" sits above it until it has been ticked once on this phone.
  const agreement = useTermsAgreement();
  const [notAgreed, setNotAgreed] = useState<string | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  const say = (msg: string | null, err: string | null = null): void => {
    setNote(msg);
    setError(err);
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
      // Not linked yet: pick the Google account the old backup is in (Google's own sign-in).
      if (!useBackup.getState().googleEmail) {
        const words = await agreement.check();
        setNotAgreed(words);
        if (words) {
          warn();
          return;
        }
        const linked = await linkGoogle();
        if (!linked) return; // they closed Google's sign-in
      }
      const { found } = await checkForBackup();
      if (!found) {
        say(DRIVE_RESTORE_WORDS.nothing);
        return;
      }
      const info = useBackup.getState().found;
      // R-123: a Drive backup is the backup file — say what is in it, as "Restore from a backup" does.
      const detail = info?.summary ? `: ${info.summary}` : info ? ` from ${fmtWhen(info.exportedAt)} (${info.workouts} workouts, ${info.meals} meals)` : '';
      // C4-9: say how many workouts on this phone the backup does not have (they go).
      const removes = await useBackup
        .getState()
        .foundRemoves()
        .catch((e: unknown) => {
          console.warn('[ForgeErr] restore: could not count the workouts a restore removes', e);
          return 0;
        });
      const ok = await askConfirm({
        title: 'Bring back your Drive backup?',
        body: restoreConfirmText(`This replaces what’s on this phone with your backup${detail}.`, removes),
        confirmLabel: 'Bring it back',
        destructive: true,
      });
      if (!ok) {
        clearFound();
        return;
      }
      const applied = await restoreFound();
      if (!applied) {
        say('That backup was already brought back.');
        return;
      }
      await refreshScreens();
      success();
      say(DRIVE_RESTORE_WORDS.done);
    } catch (e) {
      warn();
      if (e instanceof RestoredUntidyError) {
        // 16 Oct 2026 review: the data WAS replaced, so the screens show it and the words say so.
        await refreshScreens().catch((err: unknown) => console.warn('[ForgeErr] restore: screens did not refresh', err));
        say(e.message);
        return;
      }
      say(null, shownBackupError(e, 'Could not bring back your backup. Nothing was changed. Check your internet and try again.', 'restore'));
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

  return (
    <Card>
      <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{DRIVE_RESTORE_WORDS.title}</Text>
      <Body>{email ? DRIVE_RESTORE_WORDS.linked(email) : DRIVE_RESTORE_WORDS.body}</Body>
      <View style={{ marginTop: space.lg, gap: space.sm }}>
        {!email && agreement.ask ? (
          <JoinAgreement
            agreed={agreement.ticked}
            onChange={(v) => {
              agreement.tick(v);
              setNotAgreed(null);
            }}
          />
        ) : null}
        <PrimaryButton
          label={busy ? 'Working…' : DRIVE_RESTORE_WORDS.button}
          icon="clock"
          loading={busy}
          disabled={busy}
          onPress={() => void onRestore()}
        />
        <InlineError message={notAgreed} />
        {canUndoRestore ? (
          <GhostButton
            label="Undo the last restore"
            icon="clock"
            onPress={() => {
              if (busy) return; // GhostButton has no disabled state — gate concurrent actions here
              void onUndo();
            }}
          />
        ) : null}
        {email ? (
          <GhostButton
            label="Unlink Google Drive"
            onPress={() => {
              if (busy) return;
              void unlinkGoogle();
            }}
          />
        ) : null}
      </View>
      {note ? <Note>{note}</Note> : null}
      {error ? <Note tone="error">{error}</Note> : null}
    </Card>
  );
}

/** R-320: the Drive restore card's words (member-words: a first-time reader, what it does for them). */
export const DRIVE_RESTORE_WORDS = {
  title: 'Bring back a Google Drive backup',
  body: 'Backed up to Google Drive with an older version of MettleUp? Choose the same Google account to find that backup and bring it to this phone.',
  linked: (email: string): string => `Looking in the Google Drive of ${email}. Bring your old backup to this phone.`,
  button: 'Find my Drive backup',
  nothing: 'There’s no MettleUp backup in this Google account. Try “Unlink Google Drive”, then another account.',
  done: 'Your workouts are back on this phone. To keep them safe from now on, sign in on the “Backup and restore” page.',
} as const;
