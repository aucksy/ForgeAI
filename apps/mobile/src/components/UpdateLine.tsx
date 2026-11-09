/**
 * R-336 (design: UpdateLine, 5 Nov 2026): the slim orange line at the very top of the Workout tab while a
 * newer MettleUp exists. It replaces the old "A new version is ready" card in the notice slot. No close
 * button: it goes when the app is up to date. The bar's row is one big button (48 dp or more).
 * Reads lib/updateStore.ts, as the full screen (UpdatePrompt.tsx) does.
 *  - an update: "A new version of MettleUp is ready" + "Update" (opens the full screen's action)
 *  - Play downloading: "Downloading the new version. Keep using the app." (not a button)
 *  - Play downloaded: "The new version is ready." + "Restart"; during an open workout it installs
 *    after the workout (not a button).
 * R-412 (owner, 9 Nov 2026): after "Later" there was no way to read what the new version brings. A
 * "What's new" link right after the words opens the same lines as the full screen, inside this bar; a
 * second tap closes them. Shown only when the lines are known (never an empty list).
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { earlierLine, lineFor, UPDATE_LINE_NEWS } from '@/lib/updatePrompt';
import { useAppUpdate } from '@/lib/updateStore';
import { accentTint } from '@/theme/tint';
import { color, radius, space, type } from '@/theme/tokens';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

import { DownloadMark } from './UpdatePrompt';

const BOX = { borderRadius: radius.md, borderWidth: 1 };
const ROW = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: space.sm + 2,
  minHeight: 48,
  paddingVertical: space.sm + 2,
  paddingHorizontal: space.md + 2,
};

export function UpdateLine() {
  const kind = useAppUpdate((s) => s.kind);
  const playStatus = useAppUpdate((s) => s.playStatus);
  const busy = useAppUpdate((s) => s.busy);
  const news = useAppUpdate((s) => s.news);
  const behind = useAppUpdate((s) => s.behind);
  const workout = useActiveWorkout((s) => s.active);
  const [open, setOpen] = useState(false);
  const line = lineFor({ kind, playStatus, workout });
  if (!line) return null;
  const hasNews = news.length > 0;
  const earlier = hasNews ? earlierLine(behind) : null;
  // Read when drawn: a gym's own colour repaints the accent (theme/gymTheme.ts).
  const box = [BOX, { borderColor: accentTint(0.45), backgroundColor: accentTint(0.15) }];

  const link = hasNews ? (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={open ? UPDATE_LINE_NEWS.hide : UPDATE_LINE_NEWS.show}
      style={{ minHeight: 28, justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: type.bodyBold, fontSize: 14, lineHeight: 19, color: color.accentBright, textDecorationLine: 'underline' }}>
        {open ? UPDATE_LINE_NEWS.hide : UPDATE_LINE_NEWS.show}
      </Text>
    </Pressable>
  ) : null;

  const words = (
    <>
      <DownloadMark size={18} stroke={color.accentBright} />
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: 14, lineHeight: 19, color: color.ink }}>{line.text}</Text>
        {link}
      </View>
    </>
  );

  const list =
    hasNews && open ? (
      <View style={{ gap: space.sm, paddingHorizontal: space.md + 2, paddingBottom: space.md }}>
        {news.map((n, i) => (
          <View key={i} accessible accessibilityLabel={`${i + 1}. ${n}`} style={{ flexDirection: 'row', gap: space.sm }}>
            <Text style={{ width: 18, fontFamily: type.bodyBold, fontSize: 14, lineHeight: 20, color: color.accentBright }}>{i + 1}.</Text>
            <Text style={{ flex: 1, fontFamily: type.body, fontSize: 14, lineHeight: 20, color: color.ink }}>{n}</Text>
          </View>
        ))}
        {earlier ? <Text style={{ fontFamily: type.body, fontSize: 13, lineHeight: 18, color: color.inkMuted }}>{earlier}</Text> : null}
      </View>
    ) : null;

  if (!line.action) {
    return (
      <View style={box}>
        <View accessible={!hasNews} accessibilityLabel={hasNews ? undefined : line.text} style={ROW}>
          {words}
        </View>
        {list}
      </View>
    );
  }
  // The row stays one big button for the update; the "What's new" link inside it takes its own taps.
  // Not grouped for a screen reader, so the link can be reached; the "Update" word carries the full label.
  return (
    <View style={box}>
      <Pressable
        onPress={() => void useAppUpdate.getState().update()}
        disabled={busy}
        accessible={false}
        style={({ pressed }) => [ROW, pressed ? { opacity: 0.8 } : null]}
      >
        {words}
        <Pressable
          onPress={() => void useAppUpdate.getState().update()}
          disabled={busy}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityState={{ busy }}
          accessibilityLabel={`${line.text}. ${line.action}`}
        >
          <Text style={{ fontFamily: type.bodyBold, fontSize: 14, color: color.accentBright }}>{line.action}</Text>
        </Pressable>
      </Pressable>
      {list}
    </View>
  );
}
