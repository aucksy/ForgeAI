/**
 * "Continue with Google" — the first section of the welcome (R-131, owner 25 Oct 2026: "When a user logs
 * in with Google, the system automatically checks for any backup and asks to restore").
 *
 * For everyone: signs in to the member's own Google Drive (drive.file: only what this app made; no server
 * space, so R-106 holds), looks for the newest MettleUp backup without making a folder, and asks: "We
 * found your backup from 20 Oct 2026 with 412 workouts. Bring it back?" → "Restore my backup" downloads it
 * and restores it exactly like Settings → Back up and restore → "Restore from Drive" (backupStore), then
 * the app opens on it. Nothing found: they start fresh. Drive stays linked, so Settings shows it.
 *
 * A gym member (a gym code waits, or this phone is in a gym: cloud/accountGate.ts, tracker #43/#50) signs
 * in to MettleUp's server copy instead, as before 0.57.1: their workouts come back from there.
 * Hidden when the build cannot sign in to Google at all.
 */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { accountOffered } from '@/cloud/accountGate';
import { ACCOUNT_WORDS } from '@/cloud/accountWords';
import { RestoredUntidyError, shownBackupError } from '@/cloud/backupWords';
import { isDriveConfigured, peekNewestDriveBackup, type DriveBackupFile } from '@/cloud/drive';
import { ConfirmSheet, GhostButton, PrimaryButton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { success, thud } from '@/lib/haptics';
import { useGymShop } from '@/shop/gymStore';
import { useAccount } from '@/store/accountStore';
import { useBackup } from '@/store/backupStore';
import { color, space, type } from '@/theme/tokens';

import { useOnboarding } from '../store/onboardingStore';
import { foundBackupLine, replaceBody, START_WORDS } from '../welcomeStart';

type Phase = { kind: 'idle' } | { kind: 'looking' } | { kind: 'found'; file: DriveBackupFile } | { kind: 'nothing' } | { kind: 'restoring' };

/** Is the Google section shown at all? PURE (exported for the welcome screen's layout). */
export function welcomeGoogleShown(i: { driveReady: boolean; configured: boolean; inGym: boolean; gymCodeWaiting: boolean }): boolean {
  return i.driveReady || accountOffered({ configured: i.configured, inGym: i.inGym, gymCodeWaiting: i.gymCodeWaiting });
}

export function WelcomeGoogle({
  onName,
  gymCodeWaiting,
  keptWorkouts,
  onBusy,
}: {
  onName: (name: string) => void;
  gymCodeWaiting: boolean;
  /** Workouts already on this phone (kept after "Remove demo data"): a restore replaces them, so it asks first. */
  keptWorkouts: number;
  onBusy?: (busy: boolean) => void;
}) {
  const configured = useAccount((s) => s.configured);
  const inGym = useGymShop((s) => s.link != null);
  const ready = useAccount((s) => s.ready);
  const accountBusy = useAccount((s) => s.busy);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [line, setLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askReplace, setAskReplace] = useState(false);

  useEffect(() => {
    if (!ready) void useAccount.getState().init().catch((e: unknown) => console.warn('[welcome] account check failed', e));
  }, [ready]);

  const working = phase.kind === 'looking' || phase.kind === 'restoring' || accountBusy;
  useEffect(() => onBusy?.(phase.kind === 'restoring'), [phase.kind, onBusy]);

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
    if (working) return;
    setError(null);
    setLine(null);
    await (serverCopy ? goServer() : goDrive());
  };

  const restore = async (): Promise<void> => {
    if (phase.kind !== 'found') return;
    setError(null);
    setPhase({ kind: 'restoring' });
    const backup = useBackup.getState();
    try {
      const { found } = await backup.checkForBackup();
      if (!found) {
        setPhase({ kind: 'nothing' });
        return;
      }
      await backup.restoreFound();
      success();
      await useOnboarding.getState().boot();
    } catch (e) {
      if (e instanceof RestoredUntidyError) {
        // The data WAS replaced: open the app on it (the next start finishes the tidy-up).
        await useOnboarding.getState().boot();
        return;
      }
      thud();
      setPhase({ kind: 'found', file: phase.file });
      setError(shownBackupError(e, 'Could not restore your backup. Please try again.', 'welcome Drive restore'));
    }
  };

  const onRestore = (): void => {
    if (keptWorkouts > 0) setAskReplace(true);
    else void restore();
  };

  return (
    <View style={{ gap: space.md }}>
      {phase.kind === 'idle' || phase.kind === 'looking' ? (
        <PrimaryButton
          label={phase.kind === 'looking' ? START_WORDS.looking : accountBusy ? 'Signing in…' : START_WORDS.googleButton}
          icon="person"
          loading={working}
          disabled={working}
          onPress={() => void go()}
        />
      ) : null}

      {phase.kind === 'found' || phase.kind === 'restoring' ? (
        <>
          <Said>{phase.kind === 'found' ? foundBackupLine(phase.file.modifiedTime, phase.file.workouts) : START_WORDS.restoring}</Said>
          <PrimaryButton
            label={phase.kind === 'restoring' ? START_WORDS.restoring : START_WORDS.restoreButton}
            icon="check"
            loading={phase.kind === 'restoring'}
            disabled={phase.kind === 'restoring'}
            onPress={onRestore}
          />
          {phase.kind === 'found' ? <GhostButton label={START_WORDS.notNow} onPress={() => setPhase({ kind: 'nothing' })} /> : null}
        </>
      ) : null}

      {phase.kind === 'nothing' ? <Said>{START_WORDS.nothing}</Said> : null}
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
          void restore();
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
