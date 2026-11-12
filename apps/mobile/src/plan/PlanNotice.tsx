/**
 * F56 MettleUp Plus (R-461): the two one-time pop-ups of the free month, under the tabs. Around day 25 (its last 5
 * days): "Your free month has 5 days left" with what stays free; the first open after it: "Your free month has
 * ended". Each shows once per free month (memberPlan.duePopUp), never during a workout, and never while the
 * plan is switched off. Shared code: Android and iPhone.
 */
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { askConfirm } from '@/components/ui';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

import { duePopUp } from './memberPlan';
import { markSeen, useMemberAccess, useMemberPlan } from './memberPlanStore';
import { CLOSE, TRIAL_ENDED_BODY, TRIAL_ENDED_TITLE, TRIAL_SOON_BODY, TRIAL_SOON_BUTTON, trialSoonTitle, SEE_PLUS } from './planWords';

export function PlanNotice(): null {
  const router = useRouter();
  const access = useMemberAccess();
  const plan = useMemberPlan();
  const hydrated = useMemberPlan.persist.hasHydrated();
  const workout = useActiveWorkout((s) => s.active || !s.hydrated);
  const asking = useRef(false);

  const due = hydrated && !workout ? duePopUp(access, plan) : null;
  const dueKey = due ? `${due.kind}:${due.lastDay}` : null;

  useEffect(() => {
    if (!due || asking.current) return;
    asking.current = true;
    // Marked first: a pop-up closed by the app being killed is not shown again and again.
    markSeen(due.kind, due.lastDay);
    const q =
      due.kind === 'soon'
        ? askConfirm({ title: trialSoonTitle(due.daysLeft), body: TRIAL_SOON_BODY, confirmLabel: TRIAL_SOON_BUTTON, cancelLabel: CLOSE })
        : askConfirm({ title: TRIAL_ENDED_TITLE, body: TRIAL_ENDED_BODY, confirmLabel: SEE_PLUS, cancelLabel: CLOSE });
    void q
      .then((yes) => {
        if (yes) router.push('/plus');
      })
      .finally(() => {
        asking.current = false;
      });
    // dueKey stands for `due` (a new object each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueKey, router]);

  return null;
}
