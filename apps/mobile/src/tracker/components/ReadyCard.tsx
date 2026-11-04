/**
 * F59 on the Workout tab: one small card under Up next, for a member deciding what to train —
 * which muscles are still resting from the logged workouts, and a way to the body map. Hidden
 * while a workout is open and for a member with nothing logged yet (there is nothing to say).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Icon } from '@/components/ui';
import { navigateOnce } from '@/lib/guardedAction';
import { thud } from '@/lib/haptics';
import { color, space, type } from '@/theme/tokens';

import { MUSCLE_LABEL } from '../catalog/muscles';
import { readySummary } from '../engine/readiness';
import { getReadinessNow, type ReadinessNow } from '../services/readinessService';

export function ReadyCard({ hidden, refreshKey }: { hidden: boolean; refreshKey: number }) {
  const router = useRouter();
  const [now, setNow] = useState<ReadinessNow | null>(null);
  const busy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getReadinessNow()
        .then((r) => {
          if (alive) setNow(r);
        })
        .catch((e: unknown) => {
          // Quiet: the card simply does not show.
          console.warn('[ready] readiness read failed', e);
          if (alive) setNow(null);
        });
      return () => {
        alive = false;
      };
    }, [refreshKey]),
  );

  if (hidden || !now || !now.hasHistory) return null;
  const s = readySummary(now.rows, (m) => MUSCLE_LABEL[m]);

  return (
    <Pressable
      onPress={() => {
        thud();
        navigateOnce(busy, () => router.push('/ready'));
      }}
      accessibilityRole="button"
      accessibilityLabel={`${s.title}. ${s.body} Opens the body map.`}
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1, gap: space.xs }}>
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{s.title}</Text>
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>{s.body}</Text>
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>See the body map</Text>
          </View>
          <Icon name="chevron-right" size={18} color={color.inkMuted} />
        </View>
      </Card>
    </Pressable>
  );
}
