/**
 * v0.28.0 — see today's workout before starting it (owner, 8 Oct 2026: tapping the suggested
 * workout on Home "only offers Start, which starts the timer"). Every exercise of today's routine
 * with its Target (the easy one in an easy week), then Start. Nothing starts until Start. To
 * change the routine itself: "Change this routine" (its own screen, swap there for good; a swap
 * for today only is in the workout).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Card, GhostButton, IconButton, PrimaryButton, Screen, Skeleton } from '@/components/ui';
import { fmtWeight } from '@/lib/format';
import { countWord } from '@/lib/words';
import { useSettings } from '@/store/settingsStore';
import { color, space, type } from '@/theme/tokens';

import { EasyWeekNote } from '@/tracker/components/EasyWeekNote';
import { targetLine, type ProgressionTarget } from '@/tracker/engine/progression';
import { getTodaysWorkoutWithTargets } from '@/tracker/services/coachTargets';
import { getPlanNow, planLine, type PlanNow } from '@/tracker/services/planState';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

interface Today {
  dayName: string;
  planDayId: string | null;
  headline: string;
  targets: ProgressionTarget[];
}

export default function TodayScreen() {
  const router = useRouter();
  const unitSystem = useSettings((s) => s.unitSystem);
  const active = useActiveWorkout((s) => s.active);
  const startFromPlan = useActiveWorkout((s) => s.startFromPlan);
  const [today, setToday] = useState<Today | null>(null);
  const [plan, setPlan] = useState<PlanNow | null>(null);
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getTodaysWorkoutWithTargets()
        .then((tw) => alive && setToday(tw))
        .catch(() => alive && setFailed(true));
      getPlanNow()
        .then((p) => alive && setPlan(p))
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, []),
  );

  const onStart = async (): Promise<void> => {
    if (starting) return;
    setStarting(true);
    try {
      if (!useActiveWorkout.getState().active) await startFromPlan();
      router.replace('/session/active');
    } finally {
      setStarting(false);
    }
  };

  const week = plan && !plan.easy ? planLine(plan) : null;
  const has = today != null && today.planDayId != null && today.targets.length > 0;

  return (
    <Screen
      title="Today"
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      {today == null && !failed ? (
        <View style={{ gap: space.md }}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="100%" height={220} />
        </View>
      ) : !has ? (
        <View style={{ gap: space.lg }}>
          <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.inkSecondary }}>
            {today?.headline ?? 'No workout planned for today.'}
          </Text>
          <GhostButton label="Go to Workout" icon="dumbbell" onPress={() => router.replace('/workout')} />
        </View>
      ) : (
        <View style={{ gap: space.lg }}>
          <View style={{ gap: space.xs }}>
            <Text style={{ fontFamily: type.display, fontSize: type.size.h1, color: color.ink, letterSpacing: -0.5 }}>
              {today.dayName}
            </Text>
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>
              {countWord(today.targets.length, 'exercise')}, pre-filled with last time’s numbers.
            </Text>
            {week ? (
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{week}</Text>
            ) : null}
          </View>
          {plan?.easy ? <EasyWeekNote /> : null}
          <Card>
            {today.targets.map((t, i) => (
              <View
                key={`${t.exerciseId}-${i}`}
                accessibilityLabel={`${t.exerciseName}. ${targetLine(t, (kg) => fmtWeight(kg, unitSystem))}`}
                style={{
                  flexDirection: 'row',
                  gap: space.md,
                  paddingVertical: space.sm + 2,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: color.border,
                }}
              >
                <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkMuted, width: 18 }}>{i + 1}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.ink }}>{t.exerciseName}</Text>
                  <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkSecondary }}>
                    {targetLine(t, (kg) => fmtWeight(kg, unitSystem))}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
          <View style={{ gap: space.md }}>
            <PrimaryButton
              label={active ? 'Resume workout' : `Start ${today.dayName}`}
              icon="dumbbell"
              loading={starting}
              onPress={() => void onStart()}
            />
            <GhostButton label="Change this routine" icon="settings" onPress={() => router.push(`/routines/${today.planDayId}`)} />
          </View>
        </View>
      )}
    </Screen>
  );
}
