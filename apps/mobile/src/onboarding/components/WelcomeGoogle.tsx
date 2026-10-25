/**
 * "Continue with Google" — the first section of the welcome (R-131, owner 25 Oct 2026: "When a user logs
 * in with Google, the system automatically checks for any backup and asks to restore").
 *
 * For everyone: signs in to the member's own Google Drive (drive.file: only what this app made; no server
 * space, so R-106 holds), looks for the newest MettleUp backup without making a folder, and asks: "We
 * found your backup from 20 Oct 2026 with 412 workouts. Bring it back?" → "Restore my backup" downloads it
 * and restores it exactly like Settings → Back up and restore → "Restore from Drive" (backupStore), then
 * the screens refresh and the app opens on it. Nothing found: they start fresh, or try another Google
 * account. Drive stays linked, so Settings shows it.
 *
 * A gym member (a gym code waits, or this phone is in a gym: cloud/accountGate.ts, tracker #43/#50) signs
 * in to MettleUp's server copy instead, as before 0.57.1: their workouts come back from there.
 * Hidden when the build cannot sign in to Google at all.
 *
 * 0.57.1 review: one sign-in and one restore at a time (a ref, not the drawn phase: two taps in one frame
 * both saw "found"); the welcome around it is held while a restore runs (`onBusy`, cleared on unmount).
 */
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { accountOffered } from '@/cloud/accountGate';
import { ACCOUNT_WORDS } from '@/cloud/accountWords';
import { RestoredUntidyError, shownBackupError } from '@/cloud/backupWords';
import { isDriveConfigured, peekNewestDriveBackup, signOutDrive, type DriveBackupFile } from '@/cloud/drive';
import { refreshAfterRestore } from '@/components/settings/BackupFilePanels';
import { ConfirmSheet, GhostButton, PrimaryButton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { success, thud } from '@/lib/haptics';
import { useGymShop } from '@/shop/gymStore';
import { useAccount } from '@/store/accountStore';
import { useBackup } from '@/store/backupStore';
import { color, space, type } from '@/theme/tokens';

import { useOnboarding } from '../store/onboardingStore';
import { foundBackupLine, replaceBody, START_WORDS } from '../welcomeStart';

type Phase =
  | { kind: 'idle' }
  | { kind: 'looking' }
  | { kind: 'found'; file: DriveBackupFile }
  | { kind: 'declined'; file: DriveBackupFile }
  | { kind: 'nothing' }
  | { kind: 'restoring'; file: DriveBackupFile };

/** Is the Google section shown at all? PURE (exported for the welcome screen's layout). */
export function welcomeGoogleShown(i: { driveReady: boolean; configured: boolean; inGym: boolean; gymCodeWaiting: boolean }): boolean {
  return i.driveReady || accountOffered({ configured: i.configured, inGym: i.inGym, gymCodeWaiting: i.gymCodeWaiting });
}

export function WelcomeGoogle({
  onName,
  gymCodeWaiting,
  keptWorkouts,
  onBusy,
  onBeforeRestore,
}: {
  onName: (name: string) => void;
  gymCodeWaiting: boolean;
  /** Workouts already on this phone (kept after "Remove demo data"): a restore replaces them, so it asks first. */
  keptWorkouts: number;
  /** True while a restore runs: the welcome holds every other button and Back. */
  onBusy?: (busy: boolean) => void;
  /** Just before a restore: the welcome forgets a Hevy / Strong pick (it would open the import afterwards). */
  onBeforeRestore?: () => void;
}) {
  const configured = useAccount((s) => s.configured);
  const inGym = useGymShop((s) => s.link != null);
  const ready = useAccount((s) => s.ready);
  const accountBusy = useAccount((s) => s.busy);
  const backupBusy = useBackup((s) => s.busy);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [line, setLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askReplace, setAskReplace] = useState(false);
  // One sign-in or restore at a time, however fast the taps.
  const inFlight = useRef(false);

  useEffect(() => {
    if (!ready) void useAccount.getState().init().catch((e: unknown) => console.warn('[welcome] account check failed', e));
  }, [ready]);

  const restoring = phase.kind === 'restoring';
  useEffect(() => {
    onBusy?.(restoring);
  }, [restoring, onBusy]);
  // Leaving mid-restore never leaves the welcome held.
  useEffect(() => () => onBusy?.(false), [onBusy]);

  const working = phase.kind === 'looking' || restoring || accountBusy || backupBusy;
  const serverCopy = accountOffered({ configured, inGym, gymCodeWaiting });
  if (!welcomeGoogleShown({ driveReady: isDriveConfigured(), configured, inGym, gymCodeWaiting })) return null;

  // Gym members: the server copy, exactly as before.
  const goServer = async (): Promise<void> => {
    const r = await useAccount.getState().signIn({ fromWelcome: true });
    if (r.kind === 'cancelled') return;
    if (r.kind === 'error') {
      thud();
      setError(r.words);
      return;
    }
    success();
    if (r.name) onName(r.name);
    setLine(r.note);
  };

  // Everyone else: their own Google Drive.
  const goDrive = async (): Promise<void> => {
    try {
      const email = await useBackup.getState().linkGoogle();
      if (!email) return; // they closed Google's sign-in
      setPhase({ kind: 'looking' });
      const newest = await peekNewestDriveBackup();
      if (newest) {
        success();
        setPhase({ kind: 'found', file: newest });
      } else {
        setPhase({ kind: 'nothing' });
      }
    } catch (e) {
      thud();
      setPhase({ kind: 'idle' });
      setError(shownBackupError(e, ACCOUNT_WORDS.couldNotSignIn, 'welcome Google sign-in'));
    }
  };

  const go = async (): Promise<void> => {
    if (working || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setLine(null);
    try {
      await (serverCopy ? goServer() : goDrive());
    } finally {
      inFlight.current = false;
    }
  };

  // The wrong Google account: sign out of it and pick again.
  const otherAccount = async (): Promise<void> => {
    if (inFlight.current) return;
    await useBackup
      .getState()
      .unlinkGoogle()
      .catch(() => signOutDrive());
    setPhase({ kind: 'idle' });
    await go();
  };

  const restore = async (file: DriveBackupFile): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setPhase({ kind: 'restoring', file });
    onBeforeRestore?.();
    const backup = useBackup.getState();
    try {
      const { found } = await backup.checkForBackup();
      if (!found) {
        setPhase({ kind: 'nothing' });
        return;
      }
      const applied = await backup.restoreFound();
      if (!applied) throw new Error('the backup was not applied');
      success();
      await refreshAfterRestore();
      await useOnboarding.getState().boot();
      // A backup without a profile leaves the welcome up: say so instead of spinning.
      if (useOnboarding.getState().status !== 'ready') {
        setPhase({ kind: 'nothing' });
        setLine('Your workouts are back. Tap "Start fresh" and add your name to carry on.');
      }
    } catch (e) {
      if (e instanceof RestoredUntidyError) {
        // The data WAS replaced: open the app on it (the next start finishes the tidy-up).
        await refreshAfterRestore();
        await useOnboarding.getState().boot();
        return;
      }
      thud();
      setPhase({ kind: 'found', file });
      setError(shownBackupError(e, 'Could not restore your backup. Please try again.', 'welcome Drive restore'));
    } finally {
      inFlight.current = false;
    }
  };

  const onRestore = (file: DriveBackupFile): void => {
    if (inFlight.current) return;
    if (keptWorkouts > 0) setAskReplace(true);
    else void restore(file);
  };

  const offered = phase.kind === 'found' || phase.kind === 'declined' || phase.kind === 'restoring' ? phase.file : null;

  return (
    <View style={{ gap: space.md }}>
      {phase.kind === 'idle' || phase.kind === 'looking' ? (
        <PrimaryButton
          label={phase.kind === 'looking' ? START_WORDS.looking : accountBusy || backupBusy ? 'Signing in…' : START_WORDS.googleButton}
          icon="person"
          loading={working}
          disabled={working}
          onPress={() => void go()}
        />
      ) : null}

      {phase.kind === 'found' || phase.kind === 'restoring' ? (
        <>
          <Said>{restoring ? START_WORDS.restoring : foundBackupLine(phase.file.modifiedTime, phase.file.workouts)}</Said>
          <PrimaryButton
            label={restoring ? START_WORDS.restoring : START_WORDS.restoreButton}
            icon="check"
            loading={restoring}
            disabled={restoring}
            onPress={() => onRestore(phase.file)}
          />
          {phase.kind === 'found' ? <GhostButton label={START_WORDS.notNow} onPress={() => setPhase({ kind: 'declined', file: phase.file })} /> : null}
        </>
      ) : null}

      {/* "Not now": the backup stays on offer, quietly. */}
      {phase.kind === 'declined' ? <GhostButton label={START_WORDS.restoreButton} icon="check" onPress={() => onRestore(phase.file)} /> : null}

      {phase.kind === 'nothing' ? (
        <>
          {line ? null : <Said>{START_WORDS.nothing}</Said>}
          <GhostButton label={START_WORDS.otherAccount} icon="person" onPress={() => void otherAccount()} />
        </>
      ) : null}
      {line ? <Said>{line}</Said> : null}
      <InlineError message={error} />

      <ConfirmSheet
        visible={askReplace}
        title={START_WORDS.replaceTitle}
        body={replaceBody(keptWorkouts)}
        confirmLabel={START_WORDS.replaceConfirm}
        destructive
        onConfirm={() => {
          setAskReplace(false);
          if (offered) void restore(offered);
        }}
        onCancel={() => setAskReplace(false)}
      />
    </View>
  );
}

function Said({ children }: { children: string }) {
  return (
    <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.ink, lineHeight: 20 }}>
      {children}
    </Text>
  );
}
