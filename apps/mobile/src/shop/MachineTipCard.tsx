/**
 * F137 "Busy times by exercise": one calm line on the Gym tab when a routine the member usually does on one
 * day and hour uses a machine that is usually busy then, and a nearby day at the same hour is quiet:
 * "Leg day is quieter on Tuesday". "Not now" hides it for 30 days.
 *
 * Shows nothing until the gym's server has busy machines (0049), the owner switched them on in the admin app,
 * and the gym's own weekly guesses have proven right most weeks. Sums and words: machineBusy.ts (tested).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Card, GhostButton } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';
import type { GymHours } from '@forgeai/theme';

import { TIP_SOURCE, tipBody, tipTitle, type MachineTip } from './machineBusy';
import { readMachineTip, snoozeMachineTip } from './machineBusySync';
import type { GymLink } from './types';

export function MachineTipCard({ link, hours }: { link: GymLink; hours: GymHours | null }) {
  const [tip, setTip] = useState<MachineTip | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void readMachineTip(link, hours).then((t) => {
        if (live) setTip(t);
      });
      return () => {
        live = false;
      };
    }, [link, hours]),
  );

  if (!tip) return null;
  const muted = { fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary } as const;
  return (
    <Card style={{ gap: space.sm, marginTop: space.md }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkMuted }}>
        Busy machines
      </Text>
      <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{tipTitle(tip)}</Text>
      <Text style={muted}>{tipBody(tip)}</Text>
      <Text style={{ ...muted, color: color.inkMuted }}>{TIP_SOURCE}</Text>
      <GhostButton
        label="Not now"
        accessibilityLabel="Not now. Hide this for 30 days"
        onPress={() => {
          setTip(null);
          void snoozeMachineTip(tip.id);
        }}
      />
    </Card>
  );
}
