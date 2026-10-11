/**
 * "New record" pop-up on the workout screen (Phase 1). Fades out after ~3.5 s.
 *
 * The same place, quieter: "+2.5 kg on last time" after a tick that beat the same set last
 * time but was not a record (no medal, no sound, ~2.5 s). A record always wins the place. The
 * line is spoken when the set is ticked (`afterTick`), so it carries no live region of its own
 * (with both, TalkBack would say it twice).
 */
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOut, FadeOutUp } from 'react-native-reanimated';

import { useReduceMotion } from '@/components/ui/useReduceMotion';
import { color, radius, space, type } from '@/theme/tokens';

import { useWorkoutUi } from '../store/workoutUiStore';
import { Glyph } from './TrackerGlyph';

/** How long the "on last time" line stays. */
export const LAST_TIME_MS = 2500;

export function RecordToast() {
  const record = useWorkoutUi((s) => s.record);
  const clear = useWorkoutUi((s) => s.clearRecord);
  const lastTime = useWorkoutUi((s) => s.lastTime);
  const clearLastTime = useWorkoutUi((s) => s.clearLastTime);
  const reduced = useReduceMotion();

  useEffect(() => {
    if (!record) return;
    const id = record.id;
    const t = setTimeout(() => clear(id), 3500);
    return () => clearTimeout(t);
  }, [record, clear]);

  useEffect(() => {
    if (!lastTime) return;
    const id = lastTime.id;
    const t = setTimeout(() => clearLastTime(id), LAST_TIME_MS);
    return () => clearTimeout(t);
  }, [lastTime, clearLastTime]);

  if (!record) {
    if (!lastTime) return null;
    return (
      <Animated.View
        key={lastTime.id}
        entering={reduced ? undefined : FadeIn.duration(180)}
        exiting={reduced ? undefined : FadeOut.duration(160)}
        accessibilityLabel={`${lastTime.exercise}. ${lastTime.text}`}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, zIndex: 10, alignItems: 'center' }}
        pointerEvents="none"
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.xs,
            paddingHorizontal: space.lg,
            paddingVertical: space.sm,
            borderRadius: radius.pill,
            backgroundColor: color.surfaceRaised,
            borderWidth: 1,
            borderColor: color.border,
            maxWidth: '100%',
          }}
        >
          <Text
            numberOfLines={2}
            style={{ flexShrink: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}
          >
            {lastTime.text}
            <Text style={{ fontFamily: type.bodyMedium, color: color.inkMuted }}> · {lastTime.exercise}</Text>
          </Text>
        </View>
      </Animated.View>
    );
  }
  return (
    <Animated.View
      key={record.id}
      entering={reduced ? undefined : FadeInUp.duration(220)}
      exiting={reduced ? undefined : FadeOutUp.duration(200)}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`New record. ${record.exercise}. ${record.label}`}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, zIndex: 10, alignItems: 'center' }}
      pointerEvents="none"
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          borderRadius: radius.pill,
          backgroundColor: color.surfaceRaised,
          borderWidth: 1,
          borderColor: color.accent,
          maxWidth: '100%',
        }}
      >
        <Glyph name="medal" size={20} color={color.accentBright} />
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: type.bodyBold, fontSize: type.size.sub, color: color.ink }}>
            New record · {record.exercise}
          </Text>
          <Text numberOfLines={1} style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.accentBright }}>
            {record.label}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}
