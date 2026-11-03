/**
 * F151: "Today at <gym>" on the Workout tab — the workout the member's gym set for everyone today, with one
 * Start. Draws nothing when there is none (no gym, no workout today, a server without 0051, a Starter gym, a
 * workout already open), so the tab is exactly as before. Reads services/gymWodSync.ts.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type MutableRefObject } from 'react';
import { Text, View } from 'react-native';

import { Card, PrimaryButton } from '@/components/ui';
import { runGuarded } from '@/lib/guardedAction';
import { thud } from '@/lib/haptics';
import { tell } from '@/lib/tell';
import { wodHeading, wodSubLine } from '@/shop/gymWod';
import { useGymShop } from '@/shop/gymStore';
import { color, space, type } from '@/theme/tokens';

import { readGymWod, startGymWod } from '../services/gymWodSync';

type TodayWod = NonNullable<Awaited<ReturnType<typeof readGymWod>>>;

export function GymWodCard({ hidden, startGuard, refreshKey }: { hidden: boolean; startGuard: MutableRefObject<boolean>; refreshKey: number }) {
  const router = useRouter();
  const link = useGymShop((s) => s.link);
  const [today, setToday] = useState<TodayWod | null>(null);
  const [starting, setStarting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void readGymWod(link).then((a) => {
        if (alive) setToday(a);
      });
      return () => {
        alive = false;
      };
    }, [link, refreshKey]),
  );

  const wod = today?.wod ?? null;
  if (hidden || !today || !wod) return null;

  const onStart = (): void => {
    thud();
    void runGuarded(
      startGuard,
      async () => {
        setStarting(true);
        try {
          await startGymWod(router, { gymId: today.gymId, gymName: today.gymName }, wod);
        } finally {
          setStarting(false);
        }
      },
      () => void tell('Couldn’t start the workout', 'Please try again.'),
    );
  };

  return (
    <Card style={{ gap: space.sm }}>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.accent }}>{wodHeading(today.gymName)}</Text>
      <View style={{ gap: 2 }}>
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{wod.name}</Text>
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>{wodSubLine(wod)}</Text>
      </View>
      {wod.note ? <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>{wod.note}</Text> : null}
      <PrimaryButton label="Start this workout" icon="dumbbell" onPress={onStart} loading={starting} accessibilityLabel={`Start ${wod.name}, today's workout at ${today.gymName}`} />
    </Card>
  );
}
