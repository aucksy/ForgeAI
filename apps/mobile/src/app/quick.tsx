/**
 * F60 Quick workout: "I have 30 minutes" (OWNER-INBOX #58). Opens from the Workout tab's
 * "Muscles ready today" card and from the Ready today page.
 *
 * Pick the time, what to train (by default the body parts most ready, F59) and the equipment; the
 * app picks the exercises by the plan builder's rules (no AI) and the member's history, shows them
 * with last time's best set, and Start opens them as a normal workout. Rules: plans/quickWorkout.ts.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Card, Chip, PrimaryButton, Screen } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { runGuarded } from '@/lib/guardedAction';
import { tell } from '@/lib/tell';
import { fmtW } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, space, type } from '@/theme/tokens';
import { BODY_PART_LABEL, BODY_PARTS, bodyPartState, defaultBodyParts, type BodyPart, type ReadyState } from '@/tracker/engine/readiness';
import { PLAN_EQUIPMENT, PLAN_EQUIPMENT_LABEL, type PlanEquipment } from '@/tracker/plans/fit';
import { buildQuickWorkout, QUICK_MINUTES, quickLastLine, quickTargetLine, type QuickHistory, type QuickWorkout } from '@/tracker/plans/quickWorkout';
import { getQuickHistory, getQuickSetup, startQuickWorkout, type QuickSetup } from '@/tracker/services/quickWorkoutService';
import { getReadinessNow, type ReadinessNow } from '@/tracker/services/readinessService';
import { openActiveWorkout } from '@/tracker/services/workoutStart';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

/**
 * Fresh-eyes review (5 Nov 2026): "Chest · resting" read as "rested". The chips now use the Ready
 * today page's words (Ready / Almost ready / Still resting).
 */
const STATE_TAG: Record<ReadyState, string> = { ready: ' · ready', almost: ' · almost ready', resting: ' · still resting' };

function Heading({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink, marginBottom: space.sm }}>
      {children}
    </Text>
  );
}

export default function QuickWorkoutScreen() {
  const router = useRouter();
  const units = useUnits();
  const [setup, setSetup] = useState<QuickSetup | null>(null);
  const [history, setHistory] = useState<Map<string, QuickHistory>>(new Map());
  const [ready, setReady] = useState<ReadinessNow | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [parts, setParts] = useState<BodyPart[] | null>(null);
  const [equipment, setEquipment] = useState<PlanEquipment | null>(null);
  const [starting, setStarting] = useState(false);
  const guard = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getQuickSetup()
        .then((s) => alive && setSetup(s))
        .catch((e: unknown) => {
          console.warn('[ForgeErr] quick workout: the setup could not be read', e);
          if (alive) setSetup({ equipment: 'gym', sore: [], avoid: [], level: 'intermediate', goal: 'muscle' });
        });
      getQuickHistory()
        .then((h) => alive && setHistory(h))
        .catch((e: unknown) => console.warn('[ForgeErr] quick workout: last times could not be read', e));
      getReadinessNow()
        .then((r) => alive && setReady(r))
        .catch((e: unknown) => console.warn('[ForgeErr] quick workout: readiness could not be read', e));
      return () => {
        alive = false;
      };
    }, []),
  );

  // Until the member picks, the parts follow readiness and the time.
  const shownParts: BodyPart[] = parts ?? (ready ? defaultBodyParts(ready.rows, ready.lastTrained, minutes) : ['chest', 'back', 'legs']);
  const kit = equipment ?? setup?.equipment ?? 'gym';
  const quick = useMemo(
    (): QuickWorkout | null =>
      !setup
        ? null
        : shownParts.length === 0
          ? { name: 'Quick workout', exercises: [], minutes: 0 }
          : buildQuickWorkout({ ...setup, equipment: kit, minutes, parts: shownParts, history }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setup, kit, minutes, shownParts.join(','), history],
  );

  const toggle = (p: BodyPart): void => {
    const cur = shownParts;
    const nextParts = cur.includes(p) ? cur.filter((x) => x !== p) : BODY_PARTS.filter((x) => x === p || cur.includes(x));
    setParts(nextParts);
  };

  const onStart = (): Promise<unknown> =>
    runGuarded(
      guard,
      async () => {
        if (!quick || quick.exercises.length === 0) return;
        if (useActiveWorkout.getState().active) {
          void tell('A workout is already open', 'Finish or discard it on the Workout tab first, then start this one.');
          return;
        }
        setStarting(true);
        try {
          await startQuickWorkout(quick);
          // Close Quick workout and Ready today first, so minimising the workout lands on the
          // Workout tab (UAT run 41892416397 landed back on Ready today).
          if (router.canDismiss()) router.dismissAll();
          openActiveWorkout(router, 'push');
        } finally {
          setStarting(false);
        }
      },
      () => void tell('Couldn’t start the workout', 'Please try again.'),
    );

  return (
    <Screen title="Quick workout" subtitle="Choose your time and body parts. The app picks the exercises for you." onBack={() => goBack(router, '/workout')}>
      <View style={{ gap: space.lg }}>
        <View>
          <Heading>How much time do you have?</Heading>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {QUICK_MINUTES.map((m) => (
              <Chip key={m} role="radio" label={`${m} min`} selected={m === minutes} onPress={() => setMinutes(m)} />
            ))}
          </View>
        </View>
        <View>
          <Heading>What do you want to train?</Heading>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {BODY_PARTS.map((p) => (
              <Chip
                key={p}
                role="checkbox"
                label={`${BODY_PART_LABEL[p]}${ready ? STATE_TAG[bodyPartState(p, ready.rows)] : ''}`}
                selected={shownParts.includes(p)}
                onPress={() => toggle(p)}
              />
            ))}
          </View>
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.sm, lineHeight: 16 }}>
            {parts ? 'Your own pick.' : 'Picked for you: your most rested body parts, from the workouts you logged.'}
          </Text>
        </View>
        <View>
          <Heading>What equipment do you have?</Heading>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {PLAN_EQUIPMENT.map((e) => (
              <Chip key={e} role="radio" label={PLAN_EQUIPMENT_LABEL[e]} selected={e === kit} onPress={() => setEquipment(e)} />
            ))}
          </View>
        </View>

        {quick ? (
          <Card>
            <View style={{ gap: space.md }}>
              <View style={{ gap: space.xs }}>
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.h3, color: color.ink }}>{quick.name}</Text>
                <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
                  {quick.exercises.length === 0
                    ? 'No exercises fit these picks. Choose another body part or more equipment.'
                    : `Takes about ${quick.minutes} minutes, including rests.`}
                </Text>
              </View>
              {quick.exercises.map((x, i) => (
                <View key={x.key} style={{ gap: 2 }}>
                  <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{`${i + 1}. ${x.name}`}</Text>
                  <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
                    {quickTargetLine(x)}
                  </Text>
                  <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>{quickLastLine(x, (kg) => fmtW(kg, units))}</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <PrimaryButton
          label="Start this workout"
          icon="dumbbell"
          loading={starting}
          disabled={!quick || quick.exercises.length === 0}
          onPress={() => void onStart()}
        />
      </View>
    </Screen>
  );
}
