/**
 * The Gym tab's hours line (R-124): "Open now · closes 10:00 pm" / "Closed now · opens 5:00 am
 * tomorrow" / "Open 24 hours", in India time, with a special day coming up this week underneath
 * ("Closed Sun 8 Nov · Diwali"). Tap: the week (Gym → Gym timings). Hidden until the gym has set
 * hours (and so on a server before 0036). The words change by themselves as the minutes pass.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { LinkRow } from '@/components/stats/parts';
import { Icon } from '@/components/ui';
import { color, space } from '@/theme/tokens';
import type { GymHours } from '@forgeai/theme';

import { gymHoursRowWords } from './gymTimings';

/** "Now", moved on every 30 seconds while the screen is up. */
export function useNowTick(everyMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function GymHoursRow({ hours }: { hours: GymHours | null }) {
  const router = useRouter();
  const now = useNowTick();
  if (!hours) return null;
  const w = gymHoursRowWords(hours, now);
  return (
    <View style={{ marginTop: space.md }}>
      <LinkRow
        title={w.status.line}
        sub={w.sub}
        spoken={`Gym timings. ${w.status.line}. ${w.sub}`}
        leading={
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="clock" size={16} color={color.accent} />
          </View>
        }
        onPress={() => router.push('/shop/hours')}
      />
    </View>
  );
}
