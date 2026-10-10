/**
 * The one Undo bar (Appendix B: "Undo for deletes, rather than 'Are you sure?'"). It stays at
 * least 6 s, stands still while a finger is on it, and goes when the time is up or the action
 * is tapped. Place it yourself (e.g. absolute, above the bottom safe area); give it
 * `key={thing.id}` so a new delete starts a fresh clock.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { color, radius, shadow, space, type } from '@/theme/tokens';

import { undoClock } from './undoClock';
import { useReduceMotion } from './useReduceMotion';

export interface UndoBarProps {
  /** What just happened, e.g. "Set 3 deleted". */
  message: string;
  /** Default "Undo". */
  actionLabel?: string;
  onAction: () => void;
  /** Called once when the time runs out (not after the action). */
  onDismiss: () => void;
  /** How long it stays; never less than 6000 ms. */
  durationMs?: number;
}

export function UndoBar({ message, actionLabel = 'Undo', onAction, onDismiss, durationMs }: UndoBarProps) {
  const clock = useRef(undoClock.start(Date.now(), durationMs));
  const finished = useRef(false);
  const [, setTick] = useState(0);
  const reduced = useReduceMotion();

  useEffect(() => {
    if (finished.current || clock.current.runningSince == null) return;
    const t = setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      onDismiss();
    }, undoClock.left(clock.current, Date.now()));
    return () => clearTimeout(t);
  });

  const hold = () => {
    clock.current = undoClock.pause(clock.current, Date.now());
    setTick((n) => n + 1);
  };
  const release = () => {
    clock.current = undoClock.resume(clock.current, Date.now());
    setTick((n) => n + 1);
  };

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(200)}
      exiting={reduced ? undefined : FadeOutDown.duration(160)}
      onTouchStart={hold}
      onTouchEnd={release}
      onTouchCancel={release}
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        minHeight: 56,
        paddingLeft: space.lg,
        paddingRight: space.xs,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.borderStrong,
        backgroundColor: color.surfaceRaised,
        ...shadow.card,
      }}
    >
      <View style={{ flex: 1, paddingVertical: space.sm }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{message}</Text>
      </View>
      <Pressable
        onPress={() => {
          if (finished.current) return;
          finished.current = true;
          onAction();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel}: ${message}`}
        style={({ pressed }) => ({
          minHeight: 48,
          minWidth: 64,
          paddingHorizontal: space.md,
          borderRadius: radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? color.accentSoft : 'transparent',
        })}
      >
        <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.body, color: color.accent }}>{actionLabel}</Text>
      </Pressable>
    </Animated.View>
  );
}
