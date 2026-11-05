/**
 * R-336 (design: UpdateLine, 5 Nov 2026): the slim orange line at the very top of the Workout tab while a
 * newer MettleUp exists. It replaces the old "A new version is ready" card in the notice slot. No close
 * button: it goes when the app is up to date. The whole bar is one button (48 dp or more).
 * Reads lib/updateStore.ts, as the full screen (UpdatePrompt.tsx) does.
 *  - an update: "A new version of MettleUp is ready" + "Update" (opens the full screen's action)
 *  - Play downloading: "Downloading the new version. Keep using the app." (not a button)
 *  - Play downloaded: "The new version is ready." + "Restart"; during an open workout it installs
 *    after the workout (not a button).
 */
import { Pressable, Text, View } from 'react-native';

import { lineFor } from '@/lib/updatePrompt';
import { useAppUpdate } from '@/lib/updateStore';
import { accentTint } from '@/theme/tint';
import { color, radius, space, type } from '@/theme/tokens';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

import { DownloadMark } from './UpdatePrompt';

const BAR = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: space.sm + 2,
  minHeight: 48,
  paddingVertical: space.sm + 2,
  paddingHorizontal: space.md + 2,
  borderRadius: radius.md,
  borderWidth: 1,
};

export function UpdateLine() {
  const kind = useAppUpdate((s) => s.kind);
  const playStatus = useAppUpdate((s) => s.playStatus);
  const busy = useAppUpdate((s) => s.busy);
  const workout = useActiveWorkout((s) => s.active);
  const line = lineFor({ kind, playStatus, workout });
  if (!line) return null;
  // Read when drawn: a gym's own colour repaints the accent (theme/gymTheme.ts).
  const bar = [BAR, { borderColor: accentTint(0.45), backgroundColor: accentTint(0.15) }];
  const words = (
    <>
      <DownloadMark size={18} stroke={color.accentBright} />
      <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: 14, lineHeight: 19, color: color.ink }}>{line.text}</Text>
      {line.action ? <Text style={{ fontFamily: type.bodyBold, fontSize: 14, color: color.accentBright }}>{line.action}</Text> : null}
    </>
  );
  if (!line.action) {
    return (
      <View accessible accessibilityLabel={line.text} style={bar}>
        {words}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => void useAppUpdate.getState().update()}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ busy }}
      accessibilityLabel={`${line.text}. ${line.action}`}
      style={({ pressed }) => [...bar, pressed ? { opacity: 0.8 } : null]}
    >
      {words}
    </Pressable>
  );
}
