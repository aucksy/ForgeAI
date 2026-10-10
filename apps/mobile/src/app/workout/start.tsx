/**
 * Audit Phase 6 (PH-09): where the Today widget's "Start" / "Resume" lands —
 * `forgeai://workout/start?routine=<id>&t=<key>`. Resumes the open workout, or starts the
 * routine the widget showed (only if it exists), else opens the Workout tab. Never discards
 * anything. The rules are in `tracker/phone/widgetLink.ts`.
 *
 * Review fixes:
 *  - only a link with the widget's own key starts by itself (`widgetToken.ts`); one without it
 *    (another app, a replayed or doubled link) shows a calm one-tap "Start <routine>?" screen.
 *    The key is spent by the start: it is replaced and the widgets redrawn;
 *  - one at a time: two copies of this screen (a double tap on the widget) never both start —
 *    the second waits, then finds the workout open and resumes it;
 *  - a correction or past log open goes to the Workout tab, never into the correction.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { GhostButton, PrimaryButton, Screen, Skeleton } from '@/components/ui';
import { space } from '@/theme/tokens';
import { getRoutine } from '@/tracker/db/routineRepo';
import { routineParam, widgetStartAction, widgetTokenOk } from '@/tracker/phone/widgetLink';
import { keptWidgetToken, rotateWidgetToken } from '@/tracker/phone/widgetToken';
import { refreshWidgets } from '@/tracker/phone/widgets';
import { showActiveWorkout } from '@/tracker/services/workoutStart';
import { isCorrecting, useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

/** Every decision and start here runs one after another, across copies of the screen. */
let chain: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

type Router = ReturnType<typeof useRouter>;

/** Start the routine unless a workout opened meanwhile, then show the workout. */
async function startAndShow(id: string, router: Router): Promise<boolean> {
  let started = false;
  if (!useActiveWorkout.getState().active) {
    await useActiveWorkout.getState().startFromPlanDay(id);
    started = true;
  }
  showActiveWorkout(router);
  return started;
}

export default function WidgetStart() {
  const { routine, t } = useLocalSearchParams<{ routine?: string | string[]; t?: string | string[] }>();
  const router = useRouter();
  const ran = useRef(false);
  // A link without the widget's key: the routine to offer ("Start Push 1?").
  const [ask, setAsk] = useState<{ id: string; name: string } | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    // Once: a re-render must never start a second workout.
    if (ran.current) return;
    ran.current = true;
    const id = routineParam(routine);
    void oneAtATime(async () => {
      try {
        // A workout saved before Android closed the app loads first — never replaced.
        await useActiveWorkout.getState().hydrate();
        const s = useActiveWorkout.getState();
        const open = s.active;
        const found = !open && id != null ? await getRoutine(id).catch(() => null) : null;
        const tokenOk = widgetTokenOk(t, await keptWidgetToken().catch(() => ''));
        const action = widgetStartAction({ routineId: id, open, correcting: isCorrecting(s), routineExists: found != null, tokenOk });
        if (action === 'tab') {
          router.replace('/workout');
          return;
        }
        if (action === 'confirm' && id != null && found) {
          setAsk({ id, name: found.name });
          return;
        }
        if (action === 'start' && id != null) {
          if (await startAndShow(id, router)) {
            // One-shot: this key is spent; the widget is redrawn with a new one.
            rotateWidgetToken();
            void refreshWidgets();
          }
          return;
        }
        showActiveWorkout(router);
      } catch {
        router.replace('/workout');
      }
    });
  }, [routine, t, router]);

  if (ask) {
    const onStart = (): void => {
      if (starting) return;
      setStarting(true);
      void oneAtATime(async () => {
        try {
          // A correction opened meanwhile is never replaced: the Workout tab instead.
          const s = useActiveWorkout.getState();
          if (s.active && isCorrecting(s)) {
            router.replace('/workout');
            return;
          }
          await startAndShow(ask.id, router);
        } catch {
          router.replace('/workout');
        }
      });
    };
    return (
      <Screen title={`Start ${ask.name}?`}>
        <View style={{ gap: space.md }}>
          <PrimaryButton label={`Start ${ask.name}`} onPress={onStart} loading={starting} />
          <GhostButton label="Not now" onPress={() => router.replace('/workout')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Workout">
      <View style={{ gap: space.md }}>
        <Skeleton width="60%" height={28} />
        <Skeleton width="100%" height={160} />
      </View>
    </Screen>
  );
}
