/** Floating rest-timer bar: countdown + progress + -15s / +15s / Skip. */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { success, tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import { useRestTimer } from '../store/restTimerStore';

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function TimerBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={4}
      style={{
        paddingHorizontal: space.md,
        paddingVertical: 6,
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

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt == null) return;
    setNow(Date.now()); // fresh baseline so a new timer doesn't flash a stale, inflated value
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  // Clamp to the configured duration — a fresh timer can never exceed it.
  const remaining = endsAt ? Math.min(durationSec, Math.max(0, Math.ceil((endsAt - now) / 1000))) : 0;

  // Fire once when the countdown reaches zero, then clear the timer.
  useEffect(() => {
    if (endsAt != null && remaining === 0) {
      success();
      skip();
    }
  }, [remaining, endsAt, skip]);

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
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, backgroundColor: color.accentSoft }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md }}>
        <Icon name="clock" size={18} color={color.accent} />
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>Rest</Text>
        <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink, minWidth: 52 }}>
          {fmt(remaining)}
        </Text>
        <View style={{ flex: 1 }} />
        <TimerBtn label="-15" onPress={() => addSec(-15)} />
        <TimerBtn label="+15" onPress={() => addSec(15)} />
        <TimerBtn label="Skip" onPress={() => skip()} />
      </View>
    </View>
  );
}
