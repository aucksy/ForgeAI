/**
 * The Workout tab's "A new version is ready" card (launch plan C6; the check is lib/appUpdate.ts).
 * "Get it" opens the new APK in the browser; "Later" hides the card until the next version.
 * Shows nothing while there is no newer release, and nothing during the phone tests' own build
 * (its version is never older than the latest release).
 */
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { findUpdate, updateLater, type AppUpdate } from '@/lib/appUpdate';
import { color, space, type } from '@/theme/tokens';

import { useReportWant, type NoticeSlotProps } from './noticeSlot';

export const UPDATE_TITLE = 'A new version of ForgeAI is ready';
export const UPDATE_LINE = 'Tap Get it, then open the file to install. Your workouts stay.';

export function UpdateCard({ hidden = false, onWant, onDone }: NoticeSlotProps = {}) {
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  useEffect(() => {
    let live = true;
    findUpdate(Constants.expoConfig?.version)
      .then((u) => live && setUpdate(u))
      .catch((e: unknown) => console.warn('[update] check failed', e));
    return () => {
      live = false;
    };
  }, []);
  useReportWant(update != null, onWant);
  if (!update || hidden) return null;

  const get = () => {
    Linking.openURL(update.url).catch((e: unknown) => console.warn('[update] could not open', update.url, e));
  };
  const later = () => {
    setUpdate(null);
    onDone?.();
    updateLater(update.version).catch((e: unknown) => console.warn('[update] could not save Later', e));
  };
  const link = { minHeight: 48, minWidth: 48, justifyContent: 'center' as const };
  return (
    <Card style={{ gap: space.xs }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
        {`${UPDATE_TITLE} (${update.version})`}
      </Text>
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 19, color: color.inkSecondary }}>{UPDATE_LINE}</Text>
      <View style={{ flexDirection: 'row', gap: space.xl }}>
        <Pressable onPress={get} accessibilityRole="button" accessibilityLabel={`Get version ${update.version}`} style={link}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>Get it</Text>
        </Pressable>
        <Pressable onPress={later} accessibilityRole="button" accessibilityLabel="Later. Hide until the next version" style={link}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>Later</Text>
        </Pressable>
      </View>
    </Card>
  );
}
