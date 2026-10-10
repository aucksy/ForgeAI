/**
 * Profile → Your data — Phase O2 (W1), Phase 1 packet D.
 *
 * Owner decision D5 = A: "Load demo data" is NOT a member's button. It appears on the welcome
 * screen only. A real member's Profile shows:
 *   Remove demo data → only while the demo is loaded; the member's own workouts stay (DS-06)
 *   Erase all data   → back to a brand-new install (never reseeds), with a confirm that says
 *                      in one line what goes (DS-13) and that Health Connect copies stay (PH-05)
 *
 * HIDDEN SALES SWITCH (for gym sales demos — do not advertise to members): press and HOLD the
 * line "Your training is stored on this phone." under the buttons for 2 seconds. It offers "Load demo
 * data" behind a confirm that says exactly what will be replaced. It is deliberately not a
 * button: nothing on screen hints at it, so no member taps it by curiosity (DS-07 / SH-12).
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge, Card, GhostButton, askConfirm } from '@/components/ui';
import { success, thud, warn } from '@/lib/haptics';
import { countOwnWorkouts } from '@/onboarding/db/dataActions';
import { confirmAndRemoveDemo } from '@/onboarding/demoRemoval';
import { healthConnectWasUsed } from '@/onboarding/eraseDevice';
import { useOnboarding } from '@/onboarding/store/onboardingStore';
import { color, space, type } from '@/theme/tokens';

const caption = {
  fontFamily: type.body,
  fontSize: type.size.caption,
  color: color.inkMuted,
  lineHeight: 16,
  marginTop: space.sm,
} as const;

/** How long the hidden demo switch must be held. */
export const DEMO_SWITCH_HOLD_MS = 2000;

/** The erase confirm's body: what goes, in one line, plus Health Connect when used. PURE. */
export function eraseBody(healthConnectUsed: boolean): string {
  const what =
    'Every workout, record, routine, body entry, photo and video, your AI keys, the gym and Drive links and your settings. This phone goes back to new.';
  return healthConnectUsed
    ? `${what} Workouts already sent to Health Connect stay there; remove them in Health Connect.`
    : what;
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
      // Leave Profile BEFORE the navigator unmounts, so the member lands on Home afterwards.
      if (await confirmAndRemoveDemo(() => router.replace('/'))) success();
    } catch {
      thud();
      setProblem('Could not remove the demo. Nothing was changed. Please try again.');
    } finally {
      setWorking(null);
    }
  };

  const onErase = async (): Promise<void> => {
    if (working) return;
    setProblem(null);
    const hc = await healthConnectWasUsed();
    const ok = await askConfirm({
      title: 'Erase all data?',
      body: eraseBody(hc),
      confirmLabel: 'Erase everything',
      destructive: true,
    });
    if (!ok) return;
    setWorking('erase');
    try {
      // Leave Profile BEFORE the navigator unmounts, so the retained router
      // state lands a re-onboarded member on the dashboard, not here.
      router.replace('/');
      await erase();
      success();
    } catch {
      thud();
      setProblem('Could not erase everything. Please try again.');
    } finally {
      setWorking(null);
    }
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
          <GhostButton
            label={working === 'remove' ? 'Removing…' : 'Remove demo data'}
            icon="close"
            onPress={() => void onRemoveDemo()}
          />
          <Text style={caption}>
            This app is showing a sample member, not your training. Workouts you logged yourself stay.
          </Text>
          <View style={{ height: 1, backgroundColor: color.border, marginVertical: space.lg }} />
        </>
      ) : null}

      <GhostButton
        label={working === 'erase' ? 'Erasing…' : working === 'demo' ? 'Loading demo…' : 'Erase all data'}
        icon="flame"
        onPress={() => void onErase()}
      />
      <Text style={caption}>Deletes everything on this phone and starts over from the welcome screen.</Text>
      {problem ? <Text style={{ ...caption, color: color.criticalText }}>{problem}</Text> : null}

      <Pressable
        onLongPress={() => void onHiddenDemo()}
        delayLongPress={DEMO_SWITCH_HOLD_MS}
        accessible={false}
      >
        <Text style={caption}>Your training is stored on this phone.</Text>
      </Pressable>
    </Card>
  );
}
