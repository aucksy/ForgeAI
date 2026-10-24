/**
 * Workout tab — the app's first screen (redesign R1: Home is gone, its answer lives here).
 *
 * Top: the **Up next** card (PLAN §2 item 2) — a workout in progress (Resume / Discard), else
 * "Up next: Pull 1" with Start and See exercises, "Done today: Push 1 ✓ · Next: Pull 1" with
 * Start Pull 1, the weekly goal line, and the followed plan's easy-week line and choices. It
 * reads the ONE Today answer (`getTodayPlan` — the widgets, reminders, app-icon shortcuts and
 * every Start button read the same). An empty app shows the Hevy / Strong import offer.
 *
 * Below it (redesign R4), Hevy's Workout tab: "+ Start empty workout", the "Routines" heading
 * with its new-folder button, "New routine" and "Explore", then every folder inline with its
 * routine cards (`WorkoutRoutines`). The folder Up next comes from and the routine it names
 * carry small tags; they read the same answer as the card. The Exercise library moved to
 * Profile → Exercises; ready programs and the plan builder are behind Explore.
 */
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';

import { DangerLink } from '@/components/DangerLink';
import { GymBrandMark } from '@/components/GymBrandMark';
import { UpdateCard } from '@/components/UpdateCard';
import { WhatsNewCard } from '@/components/WhatsNewCard';
import { BackupNudgeCard } from '@/components/BackupNudgeCard';
import { Card, GhostButton, Screen, askConfirm } from '@/components/ui';
import { todayISO } from '@/lib/date';
import { runGuarded } from '@/lib/guardedAction';
import { thud } from '@/lib/haptics';
import { hadOldTiles, hadShopTab, settleLayoutHint } from '@/lib/layoutHints';
import { takeLinkNotice } from '@/lib/linkNotice';
import { installMetEarlierVersion } from '@/lib/whatsNew';
import { pickNotice, readNoticeRestDay, restNoticesToday, upNextExtra, type NoticeKind } from '@/lib/workoutNotices';
import { useGymShop } from '@/shop/gymStore';
import { readWithRetry } from '@/lib/retryRead';
import { tell } from '@/lib/tell';
import { useRereadWhenFailed } from '@/lib/useRereadWhenFailed';
import { countWord } from '@/lib/words';
import { useOnboarding } from '@/onboarding/store/onboardingStore';
import { color, space, type } from '@/theme/tokens';

import { EasyWeekNote } from '@/tracker/components/EasyWeekNote';
import { MuscleTipNote } from '@/tracker/components/MuscleTipNote';
import { SwitcherCard, takePendingImport, type SwitchApp } from '@/tracker/components/SwitcherCard';
import { UpNextCard } from '@/tracker/components/UpNextCard';
import { WorkoutRoutines } from '@/tracker/components/WorkoutRoutines';
import { followedFolder, getRoutineAnywhere } from '@/tracker/db/folderRepo';
import { showsImportOffer, upNextCard, type UpNextAction, type UpNextToday } from '@/tracker/lib/upNext';
import { offerEarlyEasy } from '@/tracker/plans/effort';
import { stalledLiftsInPlan } from '@/tracker/services/coachTargets';
import { liveCountsLine } from '@/tracker/services/finishCheck';
import { addMuscleTip, muscleTipFor, type MuscleTip } from '@/tracker/services/muscleTips';
import { getPlanNow, moveEasyWeek, planLine, type PlanNow } from '@/tracker/services/planState';
import { getTodayPlan } from '@/tracker/services/todayService';
import { startShownWorkout } from '@/tracker/services/todayStart';
import { getWorkoutCounts, upNextToday } from '@/tracker/services/upNextService';
import { openActiveWorkout } from '@/tracker/services/workoutStart';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { useFolderOpen } from '@/tracker/store/folderOpenStore';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';
import { useMuscleTips } from '@/tracker/store/muscleTipsStore';

/** How long the "That link didn't work." line stays before it fades on its own. */
const NOTICE_MS = 4000;
/** A second tap this soon after a push is ignored (one tap, one page). */
const PUSH_GUARD_MS = 800;

/** Settled once per app run (lib/layoutHints.ts keeps the answer; this only saves the reads). */
let hintsSettled = false;

/**
 * Release A: who sees "Your charts are now in the Progress tab" (Profile) and "Your gym's shop is
 * here in the Gym tab now" (Gym tab): members who had the old layout. Never throws.
 */
async function settleMovedHints(hasWorkouts: boolean): Promise<void> {
  if (hintsSettled) return;
  hintsSettled = true;
  const met = await installMetEarlierVersion(Constants.expoConfig?.version);
  await settleLayoutHint('progressTab', hadOldTiles({ metEarlierVersion: met, hasWorkouts, demo: useOnboarding.getState().demo }));
  // The saved gym must be read back first, or a member in a gym would look like one with none.
  if (useGymShop.persist.hasHydrated()) {
    const g = useGymShop.getState();
    await settleLayoutHint('shopInGym', hadShopTab({ metEarlierVersion: met, joined: g.link != null, productCount: g.products.length }));
  } else {
    hintsSettled = false;
  }
}

export default function WorkoutScreen() {
  const router = useRouter();

  const active = useActiveWorkout((s) => s.active);
  // LW-23: ticked working sets only — never "6 exercises logged" before anything is logged.
  const countsLine = useActiveWorkout((s) => liveCountsLine(s.exercises));
  const workoutName = useActiveWorkout((s) => s.workoutName);
  const hydrate = useActiveWorkout((s) => s.hydrate);
  const startEmpty = useActiveWorkout((s) => s.startEmpty);
  const discard = useActiveWorkout((s) => s.discard);
  // Phase W4: the same draft slot holds an in-progress EDIT of a saved workout.
  const editingSessionId = useActiveWorkout((s) => s.editingSessionId);
  const weeklyGoal = useTrackerPrefs((s) => s.weeklyGoal);
  const demo = useOnboarding((s) => s.demo);

  const [today, setToday] = useState<UpNextToday | null>(null);
  const [following, setFollowing] = useState(false);
  /** R4: the folder Up next comes from (followed, or the folder of the routine done last). */
  const [upFolderId, setUpFolderId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanNow | null>(null);
  const [stalled, setStalled] = useState(0);
  const [counts, setCounts] = useState<{ total: number; daysThisWeek: number } | null>(null);
  const [starting, setStarting] = useState(false);
  // R-58: the one muscle tip for the routine up next (most days none), and that routine's id.
  const [tip, setTip] = useState<(MuscleTip & { routineId: string }) | null>(null);
  const [tick, setTick] = useState(0);
  // SH-29: a wrong forgeai:// link lands here with one calm line.
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  // Release A, A12: which notice cards have something to say, and the day one was last closed.
  const [wants, setWants] = useState<Partial<Record<NoticeKind, boolean>>>({});
  // undefined until read: the notice slot draws nothing before then (0.56.0 review: no flash of a
  // notice closed earlier today).
  const [restDay, setRestDay] = useState<string | null | undefined>(undefined);
  const wantFns = useRef(new Map<NoticeKind, (w: boolean) => void>());
  const want = (kind: NoticeKind): ((w: boolean) => void) => {
    let fn = wantFns.current.get(kind);
    if (!fn) {
      fn = (w: boolean) => setWants((cur) => (cur[kind] === w ? cur : { ...cur, [kind]: w }));
      wantFns.current.set(kind, fn);
    }
    return fn;
  };
  const noticeClosed = useCallback(() => {
    const day = todayISO();
    setRestDay(day);
    restNoticesToday(day).catch((e: unknown) => console.warn('[notices] could not save the rest day', e));
  }, []);
  // Phone test run 38144864717: a read that failed even after its retries (Up next or the week's
  // count) — read again when the app is back in front or after the next save.
  const [readFailed, setReadFailed] = useState(false);

  // RP-03: a screen left open overnight reads Today again when the phone is back (a new day
  // can mean a new routine); Start always starts the routine on screen.
  const shownDay = useRef(todayISO());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && shownDay.current !== todayISO()) setTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void hydrate();
      let alive = true;
      const day = todayISO();
      shownDay.current = day;
      // A read that fails for a moment (at app start) is tried again before the card gives up.
      const retry = { wanted: () => alive };
      let failedNow = false;
      const upNext = readWithRetry(() => getTodayPlan(day), retry)
        .then((tp) => {
          if (!alive) return;
          const up = upNextToday(tp);
          setToday(up);
          setFollowing(tp.following);
          setUpFolderId(tp.folder?.id ?? null);
          // R-58: a calm muscle tip only for the routine up next (never once it is done today).
          const nextId = up.status === 'next' ? up.nextId : null;
          if (!nextId) {
            setTip(null);
            return;
          }
          void getRoutineAnywhere(nextId)
            .then((r) => (r ? muscleTipFor(r, day) : null))
            .then((t) => {
              if (alive) setTip(t ? { ...t, routineId: nextId } : null);
            })
            .catch((e: unknown) => {
              console.warn('[ForgeErr] muscle tip: the routine could not be read', e);
              if (alive) setTip(null);
            });
        })
        .catch(() => {
          failedNow = true;
          if (!alive) return;
          setToday(null);
          setUpFolderId(null);
        });
      readWithRetry(getPlanNow, retry)
        .then((p) => {
          if (alive) setPlan(p);
        })
        .catch(() => {
          if (alive) setPlan(null);
        });
      readWithRetry(stalledLiftsInPlan, retry)
        .then((n) => {
          if (alive) setStalled(n);
        })
        .catch(() => {
          if (alive) setStalled(0);
        });
      const week = readWithRetry(() => getWorkoutCounts(day), retry)
        .then((c) => {
          if (alive) setCounts(c);
          // Release A: the first launch of this version settles who sees the "it moved" hints.
          void settleMovedHints(c.total > 0);
        })
        .catch(() => {
          failedNow = true;
          if (alive) setCounts(null);
        });
      void Promise.all([upNext, week]).then(() => {
        if (alive) setReadFailed(failedNow);
      });
      void readNoticeRestDay().then((d) => {
        if (alive) setRestDay(d);
      });
      return () => {
        alive = false;
      };
    }, [hydrate, tick]),
  );

  useRereadWhenFailed(readFailed, () => setTick((t) => t + 1));

  useFocusEffect(
    useCallback(() => {
      const t = takeLinkNotice();
      if (!t) return undefined;
      setLinkNotice(t);
      const timer = setTimeout(() => setLinkNotice(null), NOTICE_MS);
      return () => clearTimeout(timer);
    }, []),
  );

  // Audit Phase 4: a switcher's import (Hevy or Strong) opens from the empty app, and right after
  // the welcome screen when they picked their app there (Home did this before redesign R1).
  const openImport = useCallback(
    (app: SwitchApp) => {
      thud();
      router.push(app === 'strong' ? { pathname: '/import', params: { from: 'strong' } } : '/import');
    },
    [router],
  );
  useFocusEffect(
    useCallback(() => {
      const app = takePendingImport();
      if (app) openImport(app);
    }, [openImport]),
  );

  const notice = pickNotice({ ...wants, link: linkNotice != null }, restDay, todayISO());

  const editing = active && editingSessionId != null;
  const open = active && !editing ? { name: workoutName, countsLine } : null;
  const card = upNextCard({
    today,
    open,
    editing,
    weeklyGoal,
    doneThisWeek: counts?.daysThisWeek ?? null,
    hasWorkouts: counts ? counts.total > 0 : null,
    demo,
  });
  const importOffer = showsImportOffer({ hasWorkouts: counts ? counts.total > 0 : null, demo, open, editing });

  const onEasyNow = async (): Promise<void> => {
    try {
      const f = await followedFolder();
      if (f) await moveEasyWeek(f, 'now');
      setTick((t) => t + 1);
    } catch {
      void tell('Could not change the week', 'Please try again.');
    }
  };

  const onTrainNormally = async (): Promise<void> => {
    try {
      const f = await followedFolder();
      if (f) await moveEasyWeek(f, 'skip');
      setTick((t) => t + 1);
    } catch {
      void tell('Could not change the week', 'Please try again.');
    }
  };

  // The followed plan's week and easy-week choices (Phase 4) — only for a plan he follows.
  const onRoutine = card.kind === 'next' || card.kind === 'doneToday';
  const week = following && card.kind === 'next' ? planLine(plan) : null;
  const easyNow = following && plan?.easy === true;
  const offerEasy = following && plan != null && offerEarlyEasy({ stalled, easyNow: plan.easy, week: plan.week, lastEasy: plan.lastEasy });
  // Release A, A12: at most ONE extra line inside Up next (the easy week, the offer, or the tip).
  const extra = upNextExtra({ easyNow, offerEasy, tip: tip != null && card.kind === 'next' });

  // RP-25: a double tap never stacks two workout screens — a ref guard on each start, and one
  // guarded way to open the screen (ignored while it is open or was opened a moment ago).
  const startGuard = useRef(false);
  const lastPush = useRef(0);
  const goActive = (): void => void openActiveWorkout(router);
  const startFailed = (): void => void tell('Couldn’t start the workout', 'Please try again.');

  // RP-03 / SH-23: Start starts the routine named on the card, by its id (never worked out
  // again at the tap) — after loading a workout saved before Android closed the app, and asking
  // about an edit left open (the shared Start of `todayStart.ts`).
  const onStartShown = (): Promise<unknown> =>
    runGuarded(
      startGuard,
      async () => {
        setStarting(true);
        try {
          await startShownWorkout(router, today?.nextId ?? null);
        } finally {
          setStarting(false);
        }
      },
      startFailed,
    );

  const onStartEmpty = (): Promise<unknown> =>
    runGuarded(
      startGuard,
      async () => {
        await hydrate();
        if (!useActiveWorkout.getState().active) startEmpty();
        goActive();
      },
      startFailed,
    );

  const onDiscard = (): void => {
    const isEdit = useActiveWorkout.getState().editingSessionId != null;
    void askConfirm({
      title: isEdit ? 'Discard changes?' : 'Discard workout?',
      body: isEdit ? 'Your edits will be thrown away. The saved workout stays as it was.' : 'Your in-progress workout will be deleted.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep',
      destructive: true,
    }).then((ok) => {
      if (ok) void discard();
    });
  };

  const onAction = (action: UpNextAction): void => {
    thud();
    if (action === 'start') {
      void onStartShown();
      return;
    }
    if (action === 'resume') {
      goActive();
      return;
    }
    if (action === 'discard') {
      onDiscard();
      return;
    }
    if (action === 'routines') {
      // R4: the routines are right below — open the folder Up next comes from.
      if (upFolderId) useFolderOpen.getState().setOpen(upFolderId, true);
      return;
    }
    const now = Date.now();
    if (now - lastPush.current < PUSH_GUARD_MS) return;
    lastPush.current = now;
    // v0.28.0: the routine opens its preview first (every exercise, then Start).
    router.push('/today');
  };

  return (
    <Screen title="Workout">
      <View style={{ gap: space.lg }}>
        {/* Gym branding: the member's gym, small, under the title (branded gyms only). */}
        <GymBrandMark />
        {/* Release A, A12: ONE notice at a time above Up next (lib/workoutNotices.ts): the answer to
            a link just tapped, then a new version, What's new, the backup reminder. */}
        {/* SH-29: a wrong forgeai:// link lands here with one calm line. */}
        {notice === 'link' && linkNotice ? (
          <Pressable
            onPress={() => setLinkNotice(null)}
            accessibilityRole="button"
            accessibilityLabel={`${linkNotice} Dismiss`}
            accessibilityLiveRegion="polite"
          >
            <Card>
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>{linkNotice}</Text>
            </Card>
          </Pressable>
        ) : null}
        {/* Launch C6: a newer release on GitHub ("Get it" / "Later"). */}
        <UpdateCard hidden={notice !== 'update'} onWant={want('update')} onDone={noticeClosed} />
        {/* Once per new version: what changed, in plain words (lib/whatsNew.ts). */}
        <WhatsNewCard hidden={notice !== 'whatsNew'} onWant={want('whatsNew')} onDone={noticeClosed} />
        {/* Backlog (21 Oct): members who linked Drive are told when the last backup is old. */}
        <BackupNudgeCard hidden={notice !== 'backup'} onWant={want('backup')} />

        {card.kind !== 'none' ? (
          <UpNextCard card={card} onAction={onAction} starting={starting}>
            {onRoutine || card.kind === 'emptyPlan' ? (
              <>
                {week && !easyNow ? (
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{week}</Text>
                ) : null}
                {/* An easy week shows even on a day with no routine to do (trained already). */}
                {extra === 'easyWeek' ? <EasyWeekNote until={plan?.easyUntil} /> : null}
                {extra === 'easyWeek' ? <GhostButton label="Train normally this week" icon="dumbbell" onPress={() => void onTrainNormally()} /> : null}
                {/* R-58: one calm tip when 3 weeks left a muscle group close to zero (never in an easy week). */}
                {tip && extra === 'muscleTip' ? (
                  <MuscleTipNote
                    tip={tip}
                    lastNotNow={(useMuscleTips.getState().notNow[tip.group] ?? 0) >= 1}
                    onAdd={async () => {
                      try {
                        await addMuscleTip(tip.routineId, tip);
                        setTip(null);
                        setTick((t) => t + 1);
                      } catch (e) {
                        console.warn('[ForgeErr] muscle tip: the exercise could not be added', e);
                        void tell("Couldn't add it", 'Please try again.');
                      }
                    }}
                    onNotNow={() => {
                      useMuscleTips.getState().snooze(tip.group, todayISO());
                      setTip(null);
                    }}
                    onSkip={() => {
                      useMuscleTips.getState().mute(tip.group);
                      setTip(null);
                    }}
                  />
                ) : null}
                {extra === 'easyOffer' ? (
                  <View style={{ gap: space.sm }}>
                    <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
                      {`${countWord(stalled, 'lift')} stuck at the same numbers. An easy week now often gets them moving again.`}
                    </Text>
                    <GhostButton label="Take an easy week now" icon="heart" onPress={() => void onEasyNow()} />
                  </View>
                ) : null}
              </>
            ) : null}
          </UpNextCard>
        ) : null}
        {/* Packet B: the one destructive style — a red link that asks first. */}
        {card.discard ? <DangerLink label={card.discard.label} onPress={onDiscard} /> : null}

        {importOffer ? <SwitcherCard onPick={openImport} /> : null}

        <WorkoutRoutines
          up={{ folderId: upFolderId, nextId: today?.status === 'next' || today?.status === 'doneToday' ? today.nextId : null }}
          active={active}
          plan={following ? plan : null}
          refreshKey={tick}
          startGuard={startGuard}
          onStartEmpty={() => void onStartEmpty()}
          onChanged={() => setTick((t) => t + 1)}
        />
      </View>
    </Screen>
  );
}
