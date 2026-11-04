/**
 * F61 "Ask your own AI" (OWNER-INBOX #58): Settings → Your data → Ask an AI about your workouts.
 *
 * Shows the short text of the last 4 weeks of workouts with a ready question at the end
 * (engine/aiSummary.ts), and "Share to an AI app" opens the phone's share sheet: the member picks
 * ChatGPT, Gemini or any app. Nothing is sent by MettleUp. No name, phone number or body weight.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Share, Text } from 'react-native';

import { SettingsPage } from '@/components/settings/SettingsPage';
import { Card, EmptyState, PrimaryButton } from '@/components/ui';
import { runGuarded } from '@/lib/guardedAction';
import { tell } from '@/lib/tell';
import { useUnits } from '@/lib/useUnits';
import { color, type } from '@/theme/tokens';
import { getAiSummary } from '@/tracker/services/aiSummaryService';

export default function AskAiPage() {
  const units = useUnits();
  const [summary, setSummary] = useState<{ text: string; workouts: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const guard = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getAiSummary()
        .then((s) => {
          if (alive) {
            setSummary(s);
            setFailed(false);
          }
        })
        .catch((e: unknown) => {
          console.warn('[ForgeErr] ask an AI: the workouts could not be read', e);
          if (alive) setFailed(true);
        });
      return () => {
        alive = false;
      };
      // The text is written in the member's units: read again when they change.
    }, [units]),
  );

  const onShare = (): Promise<unknown> =>
    runGuarded(
      guard,
      async () => {
        if (!summary) return;
        await Share.share({ message: summary.text });
      },
      (e) => {
        console.warn('[ForgeErr] ask an AI: the share sheet did not open', e);
        void tell('Couldn’t open sharing', 'Please try again.');
      },
    );

  return (
    <SettingsPage title="Ask an AI">
      <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.inkSecondary, lineHeight: 21 }}>
        Get advice on your training from an AI app you already use, like ChatGPT or Gemini. This makes a short text of your last 4 weeks of
        workouts with a question at the end. Tap “Share to an AI app” and pick the app.
      </Text>
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted, lineHeight: 19 }}>
        MettleUp sends nothing. You choose where the text goes. Your name, phone number and body weight are left out.
      </Text>
      {failed ? (
        <EmptyState icon="dumbbell" title="Couldn't read your workouts" body="Please go back and open this page again." />
      ) : !summary ? null : summary.workouts === 0 ? (
        <EmptyState icon="dumbbell" title="No workouts in the last 4 weeks" body="Log a workout, then come back here to ask an AI about it." />
      ) : (
        <>
          <PrimaryButton label="Share to an AI app" icon="send" onPress={() => void onShare()} />
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>The text you will share</Text>
          <Card>
            <Text selectable style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>
              {summary.text}
            </Text>
          </Card>
        </>
      )}
    </SettingsPage>
  );
}
