/**
 * Rest-timer bar on the workout screen: countdown + progress + -15s / +15s / Skip.
 * Display only — the countdown, the bell and the lock-screen alert all live in
 * `restTimerStore` (Phase 1), so the timer keeps running when this bar is off screen.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import { restRemainingSec, useRestTimer } from '../store/restTimerStore';

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Re-render ~4×/s while a rest runs; returns seconds left. */
export function useRestRemaining(): number {
  const endsAt = useRestTimer((s) => s.endsAt);
  const durationSec = useRestTimer((s) => s.durationSec);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt == null) return;
    setNow(Date.now()); // fresh baseline so a new timer doesn't flash a stale value
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return restRemainingSec(endsAt, durationSec, now);
}

function TimerBtn({ label, onPress, a11y }: { label: string; onPress: () => void; a11y: string }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={{
        minWidth: 44,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        backgroundColor: color.surfaceSunken,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>{label}</Text>
    </Pressable>
  );
}

export function RestTimerBar() {
  const endsAt = useRestTimer((s) => s.endsAt);
  const durationSec = useRestTimer((s) => s.durationSec);
  const addSec = useRestTimer((s) => s.addSec);
  const skip = useRestTimer((s) => s.skip);
  const remaining = useRestRemaining();

  if (endsAt == null) return null;
  const pct = durationSec > 0 ? Math.min(1, Math.max(0, remaining / durationSec)) : 0;

  return (
    <View
      style={{
        borderRadius: radius.lg,
        backgroundColor: color.surfaceRaised,
        borderWidth: 1,
        borderColor: color.borderStrong,
        overflow: 'hidden',
        marginBottom: space.sm,
      }}
    >
      {/* progress fill */}
      <View
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, backgroundColor: color.accentSoft }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md }}>
        <Icon name="clock" size={18} color={color.accent} />
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>Rest</Text>
        <Text
          accessibilityLabel={`Rest, ${remaining} seconds left`}
          style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink, minWidth: 52 }}
        >
          {fmtClock(remaining)}
        </Text>
        <View style={{ flex: 1 }} />
        <TimerBtn label="-15" a11y="15 seconds less" onPress={() => addSec(-15)} />
        <TimerBtn label="+15" a11y="15 seconds more" onPress={() => addSec(15)} />
        <TimerBtn label="Skip" a11y="Skip rest" onPress={() => skip()} />
      </View>
    </View>
  );
}
