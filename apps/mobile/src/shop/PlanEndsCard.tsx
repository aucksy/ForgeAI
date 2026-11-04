/**
 * Launch audit, 3 Nov 2026: the Workout tab's small "Your plan ends on Friday. Renew at the front
 * desk." card (planEnds.ts) for a gym member whose plan ends within a week, with no renewal on record.
 *
 * Read on each visit from the "My membership" answer kept on the phone (membershipKept.ts, saved by the
 * Gym tab's MembershipCard). Only when that says the plan ends soon is the gym asked again (one read,
 * the same one the Gym tab makes), so a renewal at the desk takes the card away; offline, the kept
 * answer stands. No gym, no kept answer, or a gym that does not keep plans in MettleUp: no card.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { useReportWant, type NoticeSlotProps } from '@/components/noticeSlot';
import { Card } from '@/components/ui';
import { todayISO } from '@/lib/date';
import { color, space, type } from '@/theme/tokens';

import { apiMembership } from './gymApi';
import { refreshGymReminders } from './gymReminders';
import { useGymShop } from './gymStore';
import { keepMembership, readKeptMembership } from './membershipKept';
import { planEndsInDays, planEndsWords } from './planEnds';

export function PlanEndsCard({ hidden = false, onWant }: NoticeSlotProps = {}) {
  const router = useRouter();
  const memberId = useGymShop((s) => s.link?.memberId ?? null);
  const memberKey = useGymShop((s) => s.link?.memberKey ?? null);
  const [words, setWords] = useState<{ for: string; text: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!memberId || !memberKey) return undefined;
      let live = true;
      void (async () => {
        const show = (a: Parameters<typeof planEndsInDays>[0]): void => {
          if (!live) return;
          const today = todayISO();
          const left = planEndsInDays(a, today);
          setWords(left != null && a?.ok && a.current ? { for: memberId, text: planEndsWords(a.current.endsOn, left) } : null);
        };
        const kept = await readKeptMembership(memberId);
        if (planEndsInDays(kept?.answer, todayISO()) == null) {
          show(null);
          return;
        }
        show(kept?.answer);
        // It ends soon by what the phone kept: ask the gym again (a renewal at the desk ends the card).
        const r = await apiMembership(memberKey);
        if (!live) return;
        if (r.ok) {
          show(r.data);
          void keepMembership(memberId, r.data).then(() => refreshGymReminders());
        } else if ('missing' in r) {
          show(null);
        }
        // Offline or slow: the kept answer stands.
      })();
      return () => {
        live = false;
      };
    }, [memberId, memberKey]),
  );

  const shows = words != null && words.for === memberId;
  useReportWant(shows, onWant);
  if (!shows || hidden) return null;
  return (
    <Pressable onPress={() => router.push('/shop')} accessibilityRole="button" accessibilityHint="Opens your gym's page with your plan">
      <Card style={{ gap: space.xs, borderLeftWidth: 3, borderLeftColor: color.warning }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: color.ink }}>{words.text}</Text>
      </Card>
    </Pressable>
  );
}
