/**
 * The active workout's WORKOUT DURATION readout (it said "ELAPSED" until v0.37.0; owner, 13 Oct 2026) — and the ONLY thing on that screen that
 * re-renders every second.
 *
 * The tick used to live in the screen component, so each interval fire reconciled the
 * whole tree: ~6 ExerciseLogCards × ~4 SetRows, every Swipeable, and the focused
 * TextInput the user was typing a weight into. Owning the interval here means the
 * 1 Hz state change stops at this Text; the memoised cards below never see it.
 *
 * 15 Oct 2026 (pause the workout, as Hevy): the readout is a button — a tap opens the timer menu
 * ("Pause Workout Timer" / "Resume Workout Timer"). Paused time never counts, and while paused
 * the time stands still with "Paused" beside it.
 * Source: https://help.hevyapp.com/hc/en-us/articles/34513981310615-How-to-I-adjust-duration-and-pause-a-workout
 */
import { memo, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

// Packet B: a running clock reads m:ss ("12:05", "1:02:30"), never "12m 05s".
import { fmtDuration } from '../engine/logTypes';
import { activeMs, durationLabel, PAUSE_WORDS, type PauseState } from '../services/workoutPause';

/** Seconds trained since `startedAt` (0 when the workout hasn't started), ticking every 1s while running. */
function useElapsed(startedAt: number | null, pause: PauseState): number {
  const [now, setNow] = useState(() => Date.now());
  const paused = pause.pausedAt != null;
  useEffect(() => {
    setNow(Date.now());
    // Paused: the time stands still — nothing to tick.
    if (paused) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [paused]);
  if (startedAt == null) return 0;
  return Math.floor(activeMs(startedAt, pause, now) / 1000);
}

export const ElapsedClock = memo(function ElapsedClock({
  startedAt,
  pause,
  onPress,
}: {
  startedAt: number | null;
  pause: PauseState;
  /** Opens the timer menu. */
  onPress?: () => void;
}) {
  const elapsed = useElapsed(startedAt, pause);
  const paused = pause.pausedAt != null;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={durationLabel(elapsed * 1000, paused)}
      style={({ pressed }) => ({
        alignItems: 'center',
        minHeight: 48,
        justifyContent: 'center',
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        backgroundColor: pressed ? color.surfaceRaised : 'transparent',
      })}
    >
      <Text style={{ fontFamily: type.mono, fontSize: type.size.caption, color: color.inkMuted }}>
        WORKOUT DURATION
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: paused ? color.inkSecondary : color.ink }}>
          {fmtDuration(elapsed)}
        </Text>
        {paused ? (
          <View
            style={{
              paddingHorizontal: space.sm,
              paddingVertical: 2,
              borderRadius: radius.pill,
              backgroundColor: color.accentSoft,
              borderWidth: 1,
              borderColor: color.accent,
            }}
          >
            <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.caption, color: color.accent }}>{PAUSE_WORDS.badge}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});
