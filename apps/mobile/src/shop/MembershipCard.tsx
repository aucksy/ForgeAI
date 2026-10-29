/**
 * "My membership" (OWNER-INBOX #6): the member's plan from the gym's own records, at the top of the
 * gym's Shop and in Settings → Your gym. Read on every visit; the last answer is kept on the phone
 * so it still shows at the gym with no signal. Hidden until the server has 0023 (and on any answer
 * it can't read), so nothing half-working is ever on screen. Words: membership.ts (tested).
 * #49 step 1: "Show my workouts to the desk" opens the workout offer's claim code (WorkoutCodeSheet).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Card, GhostButton } from '@/components/ui';
import { clockTime } from '@/lib/date';
import { color, space, type } from '@/theme/tokens';

import { apiMembership } from './gymApi';
import { refreshGymReminders } from './gymReminders';
import { GymReportPanel } from './GymReportPanel';
import { keptLine, membershipView, type MembershipAnswer, type MembershipTone } from './membership';
import { keepMembership, readKeptMembership } from './membershipKept';
import { PlanRequestPanel } from './PlanRequestPanel';
import type { GymLink } from './types';
import { WorkoutCodeSheet } from './WorkoutCodeSheet';
import { WORKOUT_CODE_WORDS } from './workoutCodeWords';

type Shown = { answer: MembershipAnswer; keptAt: number | null } | null;

const toneColor = (t: MembershipTone): string => (t === 'good' ? color.goodText : t === 'soon' ? color.warning : t === 'ended' ? color.criticalText : color.inkSecondary);

export function MembershipCard({ link }: { link: GymLink }) {
  const [shown, setShown] = useState<Shown>(null);
  // #49 step 1: the workout offer's claim code for the desk (nothing is sent).
  const [codeOpen, setCodeOpen] = useState(false);
  // Another gym (or a rejoin) on a screen that stays open: never keep the last member's plan.
  const [forMember, setForMember] = useState(link.memberId);
  if (forMember !== link.memberId) {
    setForMember(link.memberId);
    setShown(null);
  }

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        const kept = await readKeptMembership(link.memberId);
        if (live && kept) setShown((s) => s ?? { answer: kept.answer, keptAt: kept.at });
        const r = await apiMembership(link.memberKey);
        if (!live) return;
        if (r.ok) {
          setShown({ answer: r.data, keptAt: null });
          // R-86: the gym reminders follow the plan (a renewal cancels "ends soon").
          void keepMembership(link.memberId, r.data).then(() => refreshGymReminders());
        } else if ('missing' in r) {
          setShown(null);
        } else if (kept && (r.error.kind === 'offline' || r.error.kind === 'timeout')) {
          setShown({ answer: kept.answer, keptAt: kept.at });
        } else {
          // Not a network problem (a key the gym no longer knows, an answer it can't read): a kept
          // plan would be wrong under "No internet", so nothing shows.
          if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ForgeErr] membership', r.error);
          setShown(null);
        }
      })();
      return () => {
        live = false;
      };
    }, [link.memberId, link.memberKey]),
  );

  if (!shown) return null;
  const v = membershipView(shown.answer);
  return (
    <Card style={{ gap: space.xs, marginBottom: space.md }}>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.accentBright, letterSpacing: 1.4, textTransform: 'uppercase' }}>
        My membership
      </Text>
      <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
        {v.title}
      </Text>
      {v.when ? <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: toneColor(v.tone) }}>{v.when}</Text> : null}
      <View style={{ gap: 2, marginTop: space.xs }}>
        {v.lines.map((line) => (
          <Text key={line} style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }}>
            {line}
          </Text>
        ))}
        {shown.keptAt != null ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.xs }}>{keptLine(shown.keptAt, Date.now(), clockTime)}</Text>
        ) : null}
      </View>
      {/* F150: "Pause my plan" / "Renew my plan" - only for a member the gym's list knows, and only
          once the server has 0044 (the panel hides itself until then). Not on a kept (offline) plan. */}
      {shown.answer.ok && shown.keptAt == null ? <PlanRequestPanel link={link} hasCurrentPlan={shown.answer.current != null} /> : null}
      {/* F121: "Send your report to the gym?" - only while this gym's desk has asked, and only once
          the server has 0045 (the panel hides itself until then). Not on a kept (offline) plan. */}
      {shown.answer.ok && shown.keptAt == null ? <GymReportPanel link={link} /> : null}
      <View style={{ marginTop: space.sm }}>
        <GhostButton label={WORKOUT_CODE_WORDS.button} icon="dumbbell" onPress={() => setCodeOpen(true)} />
      </View>
      <WorkoutCodeSheet visible={codeOpen} onClose={() => setCodeOpen(false)} />
    </Card>
  );
}
