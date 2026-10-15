/**
 * "New record" pop-up on the workout screen (Phase 1). Fades out after ~4.2 s.
 *
 * The same place, quieter: "+2.5 kg on last time" after a tick that beat the same set last
 * time but was not a record (no medal, no sound, ~3 s). A record always wins the place. The
 * line is spoken when the set is ticked (`afterTick`), so it carries no live region of its own
 * (with both, TalkBack would say it twice).
 */
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOut, FadeOutUp } from 'react-native-reanimated';

import { Icon } from '@/components/ui';
import { useReduceMotion } from '@/components/ui/useReduceMotion';
import { color, radius, space, type } from '@/theme/tokens';

import { useWorkoutUi } from '../store/workoutUiStore';
import { Glyph } from './TrackerGlyph';

/**
 * How long each pop-up stays. 15 Oct 2026 (owner, in the gym: "I could only read 30% more then,
 * and it went away... increase it by 20%"): 2.5 s -> 3 s and 3.5 s -> 4.2 s, and an × closes it.
 */
export const LAST_TIME_MS = 3000;
export const RECORD_MS = 4200;

export function RecordToast() {
  const record = useWorkoutUi((s) => s.record);
  const clear = useWorkoutUi((s) => s.clearRecord);
  const lastTime = useWorkoutUi((s) => s.lastTime);
  const clearLastTime = useWorkoutUi((s) => s.clearLastTime);
  const reduced = useReduceMotion();

  useEffect(() => {
    if (!record) return;
    const id = record.id;
    const t = setTimeout(() => clear(id), RECORD_MS);
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
        pointerEvents="box-none"
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
          <CloseX onPress={() => clearLastTime(lastTime.id)} />
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
      pointerEvents="box-none"
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
        <CloseX onPress={() => clear(record.id)} />
      </View>
    </Animated.View>
  );
}

/** × on a pop-up (owner, 15 Oct 2026: "give an X button... to just remove it"). 48 dp to the finger. */
function CloseX({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={14}
      style={({ pressed }) => ({ marginLeft: space.xs, padding: 4, borderRadius: radius.pill, opacity: pressed ? 0.6 : 1 })}
    >
      <Icon name="close" size={16} color={color.inkMuted} />
    </Pressable>
  );
}
