/**
 * Profile → Your data — Phase O2 (W1), Phase 1 packet D.
 *
 * Owner decision D5 = A: "Load demo data" is NOT a member's button. It appears on the welcome
 * screen only. A real member's Profile shows:
 *   Remove demo data → only while the demo is loaded; the member's own workouts stay (DS-06)
 *   Erase all data   → back to a brand-new install (never reseeds), with a confirm that says
 *                      in one line what goes (DS-13) and that Health Connect copies stay (PH-05).
 *                      R-319 item 5: signed in to a MettleUp account, the member first chooses
 *                      "Erase this phone only" or "... and delete my MettleUp account"; Google
 *                      Drive used here adds "Your backup file in Google Drive stays" (eraseWords.ts).
 *
 * HIDDEN SALES SWITCH (for gym sales demos — do not advertise to members): press and HOLD the
 * line "Your training is stored on this phone." under the buttons for 2 seconds. It offers "Load demo
 * data" behind a confirm that says exactly what will be replaced. It is deliberately not a
 * button: nothing on screen hints at it, so no member taps it by curiosity (DS-07 / SH-12).
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DangerLink } from '@/components/DangerLink';
import { Badge, Card, GhostButton, askConfirm } from '@/components/ui';
import { FEATURES } from '@/lib/features';
import { success, thud, warn } from '@/lib/haptics';
import { countOwnWorkouts } from '@/onboarding/db/dataActions';
import { confirmAndRemoveDemo } from '@/onboarding/demoRemoval';
import { eraseGymNote, eraseLeftBehindText, healthConnectWasUsed } from '@/onboarding/eraseDevice';
import { ERASE_WORDS, eraseConfirmBody, eraseNeedsChoice, type EraseScope } from '@/onboarding/eraseWords';
import { useAccount } from '@/store/accountStore';
import { driveUsedOnThisPhone } from '@/store/backupStore';
import { useGymShop } from '@/shop/gymStore';
import { useOnboarding } from '@/onboarding/store/onboardingStore';
import { color, space, type } from '@/theme/tokens';

// Read when drawn: gym branding repaints the tokens.
const caption = () => ({
  fontFamily: type.body,
  fontSize: type.size.caption,
  color: color.inkMuted,
  lineHeight: 16,
  marginTop: space.sm,
}) as const;

/** How long the hidden demo switch must be held. */
export const DEMO_SWITCH_HOLD_MS = 2000;

/**
 * The erase confirm's body: what goes, in one line, plus the Drive file when Drive was used, plus
 * Health Connect when used, plus the gym the member leaves (C6-2: told now, or the next time the
 * app is online). `scope`: the signed-in member's choice (R-319 item 5), null when not signed in. PURE.
 */
export function eraseBody(
  healthConnectUsed: boolean,
  gymName: string | null = null,
  opts: { driveUsed?: boolean; scope?: EraseScope | null } = {},
): string {
  return eraseConfirmBody({
    scope: opts.scope ?? null,
    // C9-18: AI keys are named only while members can see the coach that uses them.
    withCoach: FEATURES.coach,
    driveUsed: opts.driveUsed === true,
    healthConnectUsed,
    gymNote: eraseGymNote(gymName),
  });
}

/** The hidden demo switch's confirm body: exactly what is replaced. PURE. */
export function loadDemoBody(ownWorkouts: number): string {
  const yours =
    ownWorkouts > 0
      ? `Your ${ownWorkouts} workout${ownWorkouts === 1 ? '' : 's'}, profile, routines, body weight, measurements and photos are deleted`
      : 'Your profile, routines, body weight, measurements and photos are deleted';
  return `Fills the app with a sample member and 13 weeks of made-up training. ${yours} and cannot be brought back.`;
}

export function DataCard() {
  const router = useRouter();
  const demo = useOnboarding((s) => s.demo);
  const loadDemo = useOnboarding((s) => s.loadDemo);
  const erase = useOnboarding((s) => s.erase);
  const refreshDemoFlag = useOnboarding((s) => s.refreshDemoFlag);
  const [working, setWorking] = useState<null | 'demo' | 'erase' | 'remove'>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // An erase emptied the workouts but left something outside them (named in `problem`).
  const [leftBehind, setLeftBehind] = useState(false);
  const welcomeAfterErase = useOnboarding((s) => s.welcomeAfterErase);
  // R-319 item 5: a signed-in member chooses what goes; what the confirm needs is read once, here.
  const [choosing, setChoosing] = useState<{ hc: boolean; driveUsed: boolean; gymName: string | null } | null>(null);

  // A Drive restore or a history import can have replaced demo data with real data
  // since boot; re-read so the badge and the buttons tell the truth.
  useEffect(() => {
    void refreshDemoFlag();
  }, [refreshDemoFlag]);

  const onRemoveDemo = async (): Promise<void> => {
    if (working) return;
    setWorking('remove');
    setProblem(null);
    try {
      // Leave Settings only once the demo is gone (before the navigator unmounts), so the member
      // lands on Workout afterwards — and a failure is said here, on the screen they are on.
      if (await confirmAndRemoveDemo(() => router.dismissTo('/workout'))) success();
    } catch (e) {
      console.warn('[ForgeErr] remove demo failed', e);
      thud();
      setProblem('Could not remove the demo. Nothing was changed. Please try again.');
    } finally {
      setWorking(null);
    }
  };

  /** Erase the phone (the account, when chosen, is deleted first). */
  const runErase = async (scope: EraseScope | null): Promise<void> => {
    setWorking('erase');
    setLeftBehind(false);
    try {
      if (scope === 'phone-and-account') {
        // The same delete as Settings → Backup → "Delete my account". It needs the internet: if it
        // fails, nothing is erased, so the member never ends up with an empty phone and a full account.
        await useAccount.getState().deleteAccount();
        if (useAccount.getState().account != null) {
          thud();
          setProblem(ERASE_WORDS.accountNotDeleted);
          return;
        }
      }
      // Audit H1: leave Settings only once everything is gone (just before the navigator
      // unmounts, so a re-onboarded member lands on Workout, not here). Anything left behind
      // is said here, by name.
      const failed = await erase({ beforeWelcome: () => router.dismissTo('/workout') });
      if (failed.length === 0) {
        success();
        return;
      }
      thud();
      setLeftBehind(true);
      setProblem(eraseLeftBehindText(failed));
    } catch (e) {
      console.warn('[ForgeErr] erase all data failed', e);
      thud();
      setProblem('Could not erase your data. Nothing was deleted. Please try again.');
    } finally {
      setWorking(null);
    }
  };

  const onErase = async (): Promise<void> => {
    if (working) return;
    setProblem(null);
    const hc = await healthConnectWasUsed();
    const driveUsed = await driveUsedOnThisPhone();
    const gymName = useGymShop.getState().link?.gymName ?? null;
    await useAccount
      .getState()
      .init()
      .catch((e: unknown) => console.warn('[ForgeErr] erase: could not read the MettleUp account', e));
    if (eraseNeedsChoice(useAccount.getState().account != null)) {
      setChoosing({ hc, driveUsed, gymName });
      return;
    }
    const ok = await askConfirm({
      title: ERASE_WORDS.title,
      body: eraseBody(hc, gymName, { driveUsed }),
      confirmLabel: ERASE_WORDS.confirm,
      destructive: true,
    });
    if (!ok) return;
    await runErase(null);
  };

  /** R-319 item 5: the signed-in member's choice, then one last question with exactly what goes. */
  const onChoose = async (scope: EraseScope): Promise<void> => {
    if (working || !choosing) return;
    const ok = await askConfirm({
      title: scope === 'phone' ? ERASE_WORDS.title : ERASE_WORDS.withAccountTitle,
      body: eraseBody(choosing.hc, choosing.gymName, { driveUsed: choosing.driveUsed, scope }),
      confirmLabel: scope === 'phone' ? ERASE_WORDS.confirm : ERASE_WORDS.withAccountConfirm,
      destructive: true,
    });
    if (!ok) return;
    setChoosing(null);
    await runErase(scope);
  };

  // After a partial erase: the member can still start over without what was left behind.
  const onStartOver = (): void => {
    if (working) return;
    setProblem(null);
    setLeftBehind(false);
    void welcomeAfterErase(() => router.dismissTo('/workout'));
  };

  // The hidden sales switch (see the header).
  const onHiddenDemo = async (): Promise<void> => {
    if (working) return;
    warn();
    const own = await countOwnWorkouts().catch(() => 0);
    const ok = await askConfirm({
      title: 'Load demo data?',
      body: loadDemoBody(own),
      confirmLabel: 'Replace with demo',
      destructive: true,
    });
    if (!ok) return;
    setWorking('demo');
    setProblem(null);
    try {
      await loadDemo();
      success();
    } catch {
      thud();
      setProblem('Could not load the demo. Please try again.');
    } finally {
      setWorking(null);
    }
  };

  return (
    <Card>
      {demo ? (
        <>
          <View style={{ flexDirection: 'row', marginBottom: space.md }}>
            <Badge label="Demo data loaded" tone="warn" />
          </View>
          <DangerLink label={working === 'remove' ? 'Removing…' : 'Remove demo data'} onPress={() => void onRemoveDemo()} />
          <Text style={caption()}>
            This app is showing a sample member, not your training. Workouts you logged yourself stay.
          </Text>
          <View style={{ height: 1, backgroundColor: color.border, marginVertical: space.lg }} />
        </>
      ) : null}

      <DangerLink
        label={working === 'erase' ? 'Erasing…' : working === 'demo' ? 'Loading demo…' : 'Erase all data'}
        onPress={() => void onErase()}
      />
      <Text style={caption()}>Deletes everything on this phone and starts over from the welcome screen.</Text>
      {choosing ? (
        <View testID="erase-choice" style={{ marginTop: space.md, gap: space.sm }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
            {ERASE_WORDS.chooseTitle}
          </Text>
          <Text style={{ ...caption(), marginTop: 0 }}>{ERASE_WORDS.chooseBody}</Text>
          <GhostButton label={ERASE_WORDS.phoneOnly} onPress={() => void onChoose('phone')} />
          <Text style={{ ...caption(), marginTop: 0 }}>{ERASE_WORDS.phoneOnlySub}</Text>
          <GhostButton label={ERASE_WORDS.withAccount} icon="trash" onPress={() => void onChoose('phone-and-account')} />
          <Text style={{ ...caption(), marginTop: 0 }}>{ERASE_WORDS.withAccountSub}</Text>
          {choosing.driveUsed ? <Text style={{ ...caption(), marginTop: 0 }}>{ERASE_WORDS.driveStays}</Text> : null}
          <GhostButton label={ERASE_WORDS.cancel} icon="close" onPress={() => setChoosing(null)} />
        </View>
      ) : null}
      {problem ? <Text style={{ ...caption(), color: color.criticalText }}>{problem}</Text> : null}
      {leftBehind ? (
        <View style={{ marginTop: space.sm }}>
          <GhostButton label="Start over anyway" onPress={onStartOver} />
        </View>
      ) : null}

      <Pressable
        onLongPress={() => void onHiddenDemo()}
        delayLongPress={DEMO_SWITCH_HOLD_MS}
        accessible={false}
      >
        <Text style={caption()}>Your training is stored on this phone.</Text>
      </Pressable>
    </Card>
  );
}
