/**
 * Minimised workout (Phase 1, Hevy-style): while a workout is open and the member
 * is on another tab, a slim bar sits above the tab bar — elapsed time, or the rest
 * countdown when resting. Tap it to go back to the workout.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import { useActiveWorkout } from '../store/activeWorkoutStore';
import { fmtClock, useRestRemaining } from './RestTimerBar';

function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function WorkoutMiniBar() {
  const router = useRouter();
  const active = useActiveWorkout((s) => s.active);
  const startedAt = useActiveWorkout((s) => s.startedAt);
  const editing = useActiveWorkout((s) => s.editingSessionId != null);
  const done = useActiveWorkout((s) => s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0));
  const remaining = useRestRemaining();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || editing) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, editing]);

  if (!active) return null;

  const resting = remaining > 0;
  const title = editing ? 'Editing a workout' : resting ? 'Resting' : 'Workout in progress';
  const right = editing ? 'Open' : resting ? fmtClock(remaining) : startedAt ? fmtElapsed(now - startedAt) : '';

  return (
    <Pressable
      onPress={() => {
        tap();
        router.push('/session/active');
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${editing ? '' : `${done === 1 ? '1 set' : `${done} sets`} done. `}Tap to open the workout`}
      style={{
        marginHorizontal: space.md,
        marginBottom: space.sm,
        borderRadius: radius.lg,
        backgroundColor: color.surfaceRaised,
        borderWidth: 1,
        borderColor: resting ? color.accent : color.borderStrong,
        paddingHorizontal: space.lg,
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: resting ? color.accent : color.goodText,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
          {title}
        </Text>
        {!editing ? (
          <Text numberOfLines={1} style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkSecondary }}>
            {done === 1 ? '1 set done' : `${done} sets done`}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: resting ? color.accent : color.ink }}>
        {right}
      </Text>
      <Icon name="chevron-right" size={18} color={color.inkMuted} />
    </Pressable>
  );
}
