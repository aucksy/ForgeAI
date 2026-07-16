/**
 * The active workout's ELAPSED readout — and the ONLY thing on that screen that
 * re-renders every second.
 *
 * The tick used to live in the screen component, so each interval fire reconciled the
 * whole tree: ~6 ExerciseLogCards × ~4 SetRows, every Swipeable, and the focused
 * TextInput the user was typing a weight into. Owning the interval here means the
 * 1 Hz state change stops at this Text; the memoised cards below never see it.
 */
import { memo, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { color, type } from '@/theme/tokens';

import { formatDuration } from '../services/finishSummary';

/** Seconds since `startedAt` (0 when the workout hasn't started), ticking every 1s. */
function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (startedAt == null) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export const ElapsedClock = memo(function ElapsedClock({ startedAt }: { startedAt: number | null }) {
  const elapsed = useElapsed(startedAt);
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontFamily: type.mono, fontSize: type.size.caption, color: color.inkMuted }}>
        ELAPSED
      </Text>
      <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink }}>
        {formatDuration(elapsed)}
      </Text>
    </View>
  );
});
