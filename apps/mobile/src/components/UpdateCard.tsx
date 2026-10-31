/**
 * The Workout tab's "A new version is ready" card (launch plan C6). R-260: it is now the always-there
 * reminder next to the launch pop-up (components/UpdatePrompt.tsx), for GitHub AND Google Play copies;
 * both read lib/updateStore.ts. "Later" hides it for 3 days (it used to hide until the next version).
 * Shows nothing while there is no newer version, and nothing during the phone tests' own build (its
 * version is never older than the latest release).
 */
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { useAppUpdate } from '@/lib/updateStore';
import { color, space, type } from '@/theme/tokens';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

import { useReportWant, type NoticeSlotProps } from './noticeSlot';

export const UPDATE_TITLE = 'A new version of MettleUp is ready';
export const UPDATE_LINE = 'Tap "Get it" to download the file, then open it to install. Your workouts stay safe.';
export const UPDATE_PLAY_LINE = 'Tap "Update" to download it while you keep using the app. Your workouts stay safe.';
export const UPDATE_DOWNLOADING = 'Downloading the new version. You can keep using the app.';
export const UPDATE_READY_TITLE = 'The new version is ready to install';
export const UPDATE_READY_LINE = 'Tap "Restart" to open the new version. It takes a few seconds. Your workouts stay safe.';
export const UPDATE_AFTER_WORKOUT = 'The update installs when you leave the app after your workout.';

export function UpdateCard({ hidden = false, onWant, onDone }: NoticeSlotProps = {}) {
  const kind = useAppUpdate((s) => s.kind);
  const version = useAppUpdate((s) => s.version);
  const playStatus = useAppUpdate((s) => s.playStatus);
  const card = useAppUpdate((s) => s.card);
  const busy = useAppUpdate((s) => s.busy);
  const workout = useActiveWorkout((s) => s.active != null);
  const want = kind != null && card;
  useReportWant(want, onWant);
  if (!want || hidden) return null;

  const ready = kind === 'play' && playStatus === 'downloaded';
  const downloading = kind === 'play' && (playStatus === 'downloading' || playStatus === 'pending');
  const title = ready ? UPDATE_READY_TITLE : UPDATE_TITLE;
  const line = ready
    ? workout
      ? UPDATE_AFTER_WORKOUT
      : UPDATE_READY_LINE
    : downloading
      ? UPDATE_DOWNLOADING
      : kind === 'github'
        ? UPDATE_LINE
        : UPDATE_PLAY_LINE;
  const action = ready ? (workout ? null : 'Restart') : downloading ? null : kind === 'github' ? 'Get it' : 'Update';
  const go = () => {
    void useAppUpdate.getState().update();
  };
  const later = () => {
    useAppUpdate.getState().laterCard();
    onDone?.();
  };
  const link = { minHeight: 48, minWidth: 48, justifyContent: 'center' as const };
  return (
    <Card style={{ gap: space.xs }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
        {title}
      </Text>
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 19, color: color.inkSecondary }}>{line}</Text>
      <View style={{ flexDirection: 'row', gap: space.xl }}>
        {action ? (
          <Pressable
            onPress={go}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ busy }}
            accessibilityLabel={kind === 'github' && version && !ready ? `Get version ${version}` : action}
            style={link}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{action}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={later} accessibilityRole="button" accessibilityLabel="Later. Hide for 3 days" style={link}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>Later</Text>
        </Pressable>
      </View>
    </Card>
  );
}
