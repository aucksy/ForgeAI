/**
 * Settings → Your data — Phase O2 (W1).
 *
 * Replaces the old "Reset demo data" button, which wiped everything and then
 * regenerated the fake Arjun history — the behaviour W1 calls disqualifying for a
 * member invited by their real gym. Two honest actions instead:
 *   Load demo data  → the sample member, on purpose, for a sales pitch
 *   Erase all data  → back to a completely empty app (never reseeds)
 *
 * A badge makes demo data impossible to mistake for real training.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Badge, Card, GhostButton } from '@/components/ui';
import { success, thud } from '@/lib/haptics';
import { useOnboarding } from '@/onboarding/store/onboardingStore';
import { color, space, type } from '@/theme/tokens';

const caption = {
  fontFamily: type.body,
  fontSize: type.size.caption,
  color: color.inkMuted,
  lineHeight: 16,
  marginTop: space.sm,
} as const;

export function DataCard() {
  const router = useRouter();
  const demo = useOnboarding((s) => s.demo);
  const loadDemo = useOnboarding((s) => s.loadDemo);
  const erase = useOnboarding((s) => s.erase);
  const refreshDemoFlag = useOnboarding((s) => s.refreshDemoFlag);
  const [working, setWorking] = useState<null | 'demo' | 'erase'>(null);

  // A Drive restore or a Hevy import can have replaced demo data with real data
  // since boot; re-read so the badge and the erase wording tell the truth.
  useEffect(() => {
    void refreshDemoFlag();
  }, [refreshDemoFlag]);

  const run = async (kind: 'demo' | 'erase'): Promise<void> => {
    if (working) return;
    setWorking(kind);
    try {
      if (kind === 'demo') {
        await loadDemo();
      } else {
        // Leave Settings BEFORE the navigator unmounts, so the retained router
        // state lands a re-onboarded member on the dashboard, not here.
        router.replace('/');
        await erase();
      }
      success();
    } catch {
      thud();
      Alert.alert(
        kind === 'demo' ? 'Could not load the demo' : 'Could not erase',
        'Something went wrong — please try again.',
      );
    } finally {
      setWorking(null);
    }
  };

  const confirmDemo = (): void => {
    Alert.alert(
      demo ? 'Reload demo data?' : 'Load demo data?',
      'Replaces everything in the app with a sample member and 13 weeks of made-up training history. Anything you have logged will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Load demo', style: 'destructive', onPress: () => void run('demo') },
      ],
    );
  };

  const confirmErase = (): void => {
    Alert.alert(
      demo ? 'Remove demo data?' : 'Erase all data?',
      demo
        ? 'Deletes the demo and takes you back to the welcome screen.'
        : 'Deletes every workout, set, PR, meal, chat message and your profile, then takes you back to the welcome screen. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: demo ? 'Remove demo' : 'Erase everything',
          style: 'destructive',
          onPress: () => void run('erase'),
        },
      ],
    );
  };

  return (
    <Card>
      {demo ? (
        <View style={{ flexDirection: 'row', marginBottom: space.md }}>
          <Badge label="Demo data loaded" tone="warn" />
        </View>
      ) : null}

      <GhostButton
        label={working === 'demo' ? 'Loading demo…' : demo ? 'Reload demo data' : 'Load demo data'}
        icon="sparkle"
        onPress={confirmDemo}
      />
      <Text style={caption}>
        {demo
          ? 'This app is showing sample data, not your training.'
          : 'Fills the app with a sample member and 13 weeks of made-up history — for demos.'}
      </Text>

      <View style={{ height: 1, backgroundColor: color.border, marginVertical: space.lg }} />

      <GhostButton
        label={working === 'erase' ? 'Erasing…' : demo ? 'Remove demo data' : 'Erase all data'}
        icon="flame"
        onPress={confirmErase}
      />
      <Text style={caption}>
        Wipes everything and starts over from the welcome screen. Your gym link and Drive
        backup settings are kept.
      </Text>
    </Card>
  );
}
