/**
 * Workout tab — start a workout (empty or from plan) or resume one in progress.
 * Phase 4: the followed plan's week ("Week 3 · easy week in week 6"); in an easy week the
 * note and "Train normally this week"; when 3 or more lifts of the plan have stalled, an easy
 * week now (research v3 §5); with no plan, the ready programs and the plan builder.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { GhostButton, HeroCard, Icon, PrimaryButton, Screen } from '@/components/ui';
import { getActivePlan } from '@/db/repos/planRepo';
import { countWord } from '@/lib/words';
import { getTodaysWorkout } from '@/services/coach';
import { color, gradients, space, type } from '@/theme/tokens';

import { EasyWeekNote } from '@/tracker/components/EasyWeekNote';
import { followedFolder } from '@/tracker/db/folderRepo';
import { offerEarlyEasy } from '@/tracker/plans/effort';
import { stalledLiftsInPlan } from '@/tracker/services/coachTargets';
import { getPlanNow, moveEasyWeek, planLine, type PlanNow } from '@/tracker/services/planState';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

interface PlanPreview {
  dayName: string;
  count: number;
  hasPlan: boolean;
}

export default function WorkoutScreen() {
  const router = useRouter();

  const active = useActiveWorkout((s) => s.active);
  const exerciseCount = useActiveWorkout((s) => s.exercises.length);
  const hydrate = useActiveWorkout((s) => s.hydrate);
  const startEmpty = useActiveWorkout((s) => s.startEmpty);
  const startFromPlan = useActiveWorkout((s) => s.startFromPlan);
  const discard = useActiveWorkout((s) => s.discard);
  // Phase W4: the same draft slot holds an in-progress EDIT of a saved workout.
  const editingSessionId = useActiveWorkout((s) => s.editingSessionId);

  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [plan, setPlan] = useState<PlanNow | null>(null);
  const [stalled, setStalled] = useState(0);
  /** The followed plan has routines (a day with nothing planned is not "no plan"). */
  const [hasRoutines, setHasRoutines] = useState(true);
  const [starting, setStarting] = useState(false);
  const [tick, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      void hydrate();
      let alive = true;
      getTodaysWorkout()
        .then((tw) => {
          if (alive) {
            setPreview({ dayName: tw.dayName, count: tw.targets.length, hasPlan: tw.targets.length > 0 });
          }
        })
        .catch(() => {
          if (alive) setPreview({ dayName: 'Full Body', count: 0, hasPlan: false });
        });
      getPlanNow()
        .then((p) => {
          if (alive) setPlan(p);
        })
        .catch(() => {
          if (alive) setPlan(null);
        });
      getActivePlan()
        .then((p) => {
          if (alive) setHasRoutines((p?.days.length ?? 0) > 0);
        })
        .catch(() => undefined);
      stalledLiftsInPlan()
        .then((n) => {
          if (alive) setStalled(n);
        })
        .catch(() => {
          if (alive) setStalled(0);
        });
      return () => {
        alive = false;
      };
    }, [hydrate, tick]),
  );

  const onEasyNow = async (): Promise<void> => {
    try {
      const f = await followedFolder();
      if (f) await moveEasyWeek(f, 'now');
      setTick((t) => t + 1);
    } catch {
      Alert.alert('Could not change the week', 'Please try again.');
    }
  };

  const onTrainNormally = async (): Promise<void> => {
    try {
      const f = await followedFolder();
      if (f) await moveEasyWeek(f, 'skip');
      setTick((t) => t + 1);
    } catch {
      Alert.alert('Could not change the week', 'Please try again.');
    }
  };

  const week = preview?.hasPlan ? planLine(plan) : null;
  const offerEasy = plan != null && offerEarlyEasy({ stalled, easyNow: plan.easy, week: plan.week, lastEasy: plan.lastEasy });

  const goActive = (): void => router.push('/session/active');

  const onStartPlan = async (): Promise<void> => {
    setStarting(true);
    try {
      await startFromPlan();
      goActive();
    } finally {
      setStarting(false);
    }
  };

  const onStartEmpty = (): void => {
    startEmpty();
    goActive();
  };

  const onDiscard = (): void => {
    const editing = useActiveWorkout.getState().editingSessionId != null;
    Alert.alert(
      editing ? 'Discard changes?' : 'Discard workout?',
      editing
        ? 'Your edits will be thrown away. The saved workout stays as it was.'
        : 'Your in-progress workout will be deleted.',
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => void discard() },
      ],
    );
  };

  return (
    <Screen title="Workout" subtitle="Log a session — offline, one tap per set.">
      <View style={{ gap: space.lg }}>
        {active ? (
          <HeroCard gradient={gradients.ember}>
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Icon name="clock" size={22} color="#1F0D05" />
                <Text style={{ fontFamily: type.displaySemi, fontSize: type.size.h2, color: '#1F0D05' }}>
                  {editingSessionId ? 'Editing a workout' : 'Workout in progress'}
                </Text>
              </View>
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: 'rgba(31,13,5,0.72)' }}>
                {editingSessionId
                  ? 'You have unsaved changes to a saved workout.'
                  : `${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'} logged so far.`}
              </Text>
              <PrimaryButton
                label={editingSessionId ? 'Resume editing' : 'Resume workout'}
                icon="dumbbell"
                onPress={goActive}
              />
              <GhostButton
                label={editingSessionId ? 'Discard changes' : 'Discard'}
                icon="close"
                onPress={onDiscard}
              />
            </View>
          </HeroCard>
        ) : (
          <>
            <HeroCard>
              <View style={{ gap: space.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Icon name="target" size={20} color={color.accent} />
                  <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
                    {preview?.hasPlan ? `Today: ${preview.dayName}` : 'Start a workout'}
                  </Text>
                </View>
                <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
                  {preview?.hasPlan
                    ? `${countWord(preview.count, 'exercise')} from your plan, pre-filled with last time's numbers.`
                    : 'No plan for today — start empty and add exercises as you go.'}
                </Text>
                {week && !plan?.easy ? (
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{week}</Text>
                ) : null}
                {/* An easy week shows even on a day with no "Today" (trained already, or off-plan). */}
                {plan?.easy ? <EasyWeekNote /> : null}
                {preview?.hasPlan ? (
                  <PrimaryButton
                    label={`Start ${preview.dayName}`}
                    icon="dumbbell"
                    loading={starting}
                    onPress={() => void onStartPlan()}
                  />
                ) : null}
                {plan?.easy ? (
                  <GhostButton label="Train normally this week" icon="flame" onPress={() => void onTrainNormally()} />
                ) : null}
                {offerEasy ? (
                  <View style={{ gap: space.sm }}>
                    <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
                      {`${countWord(stalled, 'lift')} stuck at the same numbers. An easy week now often gets them moving again.`}
                    </Text>
                    <GhostButton label="Take an easy week now" icon="heart" onPress={() => void onEasyNow()} />
                  </View>
                ) : null}
              </View>
            </HeroCard>

            <GhostButton label="Start empty workout" icon="plus" onPress={onStartEmpty} />
            {/* Only with no plan to follow — not on a day the plan has nothing for (trained already). */}
            {preview && !preview.hasPlan && !hasRoutines ? (
              <>
                <GhostButton label="Ready programs" icon="trophy" onPress={() => router.push('/programs')} />
                <GhostButton label="Build a plan" icon="sparkle" onPress={() => router.push('/plan/build')} />
              </>
            ) : null}
            <GhostButton label="Routines" icon="target" onPress={() => router.push('/routines')} />
            <GhostButton label="Exercise library" icon="dumbbell" onPress={() => router.push('/library')} />
          </>
        )}
      </View>
    </Screen>
  );
}
