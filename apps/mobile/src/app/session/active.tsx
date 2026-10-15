/**
 * Active workout — the live logging screen (full-screen over the tabs).
 *
 * Phase 1: the left button now MINIMISES (the workout keeps running; a bar above
 * the tabs brings it back) and "Discard workout" moves to a quiet link under the
 * exercises, as in Hevy. A new record pops up at the top. Supersets scroll to the
 * next exercise. Finishing a changed routine workout offers to update the routine.
 */
import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import type { ScrollView as ScrollViewType } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DangerLink } from '@/components/DangerLink';
import { EmptyState, GhostButton, Icon, IconButton, PrimaryButton, Screen, UndoBar, askConfirm } from '@/components/ui';
import { useDashboard } from '@/store/dashboardStore';
import { color, radius, space, type } from '@/theme/tokens';


import { SessionGoneError } from '@/tracker/db/sessionEdit';
import { EditSessionHeader } from '@/tracker/components/EditSessionHeader';
import { WorkoutPhotos } from '@/tracker/components/WorkoutPhotos';
import { EasyWeekNote } from '@/tracker/components/EasyWeekNote';
import { ElapsedClock } from '@/tracker/components/ElapsedClock';
import { EntryBar, useEntryBar } from '@/tracker/components/EntryBar';
import { DragList, type DragWrap } from '@/tracker/components/DragList';
import { ExerciseLogCard } from '@/tracker/components/ExerciseLogCard';
import { RecordToast } from '@/tracker/components/RecordToast';
import { RestTimerBar } from '@/tracker/components/RestTimerBar';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { FinishSheet, type FinishChoice } from '@/tracker/components/FinishSheet';
import { SheetRow, TrackerSheet } from '@/tracker/components/TrackerSheet';
import { PAUSE_WORDS, type PauseState } from '@/tracker/services/workoutPause';
import { getRoutine } from '@/tracker/db/routineRepo';
import { defaultWorkoutName, idlePauseNote } from '@/tracker/services/finishCheck';
import { copiedText } from '@/tracker/services/setEntry';
import { bounceEmptyWorkout } from '@/tracker/services/workoutStart';
import { holdRoutineOffer, routineUpdateOffer } from '@/tracker/services/routineOffer';
import { ensureAlertPermission } from '@/tracker/services/workoutAlerts';
import { loadTargets, querySignature, targetQuery, useTargets } from '@/tracker/store/targetStore';
import { useUnits } from '@/lib/useUnits';
import { goBack } from '@/lib/goBack';
import { draftToRichSets, hasWorkingSet } from '@/tracker/services/draftSets';
import { isCorrecting, useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';
import { usePlateSetupFor } from '@/tracker/store/plateSetupStore';
import { gymPlatesFor } from '@/tracker/services/plateMath';
import { useWorkoutUi } from '@/tracker/store/workoutUiStore';
import { tell } from '@/lib/tell';

/**
 * Finish before any set is logged: a calm neutral pill with readable words (design critique,
 * Oct 2026). The orange button at 45 % opacity read as dark brown on brown, well under 4.5:1.
 * Grey text on the raised surface is about 7.7:1. Not a button yet, so nothing happens on a tap;
 * a screen reader hears it as a dimmed button with its words.
 */
function NotYetButton({ label }: { label: string }) {
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel={label}
      style={{
        minHeight: 54,
        paddingVertical: space.sm,
        paddingHorizontal: space.xxl,
        borderRadius: radius.pill,
        backgroundColor: color.surfaceRaised,
        borderWidth: 1,
        borderColor: color.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
      }}
    >
      <Icon name="check" size={19} color={color.inkSecondary} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ flexShrink: 1, fontFamily: type.bodyBold, fontSize: 16, letterSpacing: 0.2, color: color.inkSecondary }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const active = useActiveWorkout((s) => s.active);
  const startedAt = useActiveWorkout((s) => s.startedAt);
  const planDayId = useActiveWorkout((s) => s.planDayId);
  // A Repeat of a routine's workout carries the routine's id without a plan day (A5, 13 Oct audit).
  const routineId = useActiveWorkout((s) => s.routineId);
  const ownRoutineId = planDayId || routineId || null;
  const workoutName = useActiveWorkout((s) => s.workoutName);
  // Phase 4: an easy week of the followed plan (half the sets, the same weights).
  const easyWeek = useActiveWorkout((s) => s.easyWeek);
  // Phase 4: members who log RPE see this plan week's effort on the Target.
  const logsRpe = useTrackerPrefs((s) => s.advancedSets);
  // "Previous values" (Settings → Workouts): the choice this workout started with (13 Oct 2026
  // review fix: frozen, so the Target reads the same workouts as PREVIOUS); an older draft
  // without one follows the setting.
  const settingPreviousFrom = useTrackerPrefs((s) => s.previousFrom);
  const frozenPreviousFrom = useActiveWorkout((s) => s.previousFrom);
  const previousFrom = frozenPreviousFrom ?? settingPreviousFrom;
  const exercises = useActiveWorkout((s) => s.exercises);
  const committing = useActiveWorkout((s) => s.committing);
  // 15 Oct 2026 (pause the workout, as Hevy): tap the duration → "Pause Workout Timer".
  const pausedAt = useActiveWorkout((s) => s.pausedAt);
  const pausedTotalMs = useActiveWorkout((s) => s.pausedTotalMs);
  const pauses = useActiveWorkout((s) => s.pauses);
  const pause = useMemo<PauseState>(() => ({ pausedAt, pausedTotalMs, pauses }), [pausedAt, pausedTotalMs, pauses]);
  const paused = pausedAt != null;
  const pausedAuto = useActiveWorkout((s) => s.pausedAuto);
  const pauseNote = pausedAuto && pausedAt != null ? idlePauseNote(pausedAt) : PAUSE_WORDS.note;
  const pauseWorkout = useActiveWorkout((s) => s.pauseWorkout);
  const resumeWorkout = useActiveWorkout((s) => s.resumeWorkout);
  const [timerMenu, setTimerMenu] = useState(false);
  const finish = useActiveWorkout((s) => s.finish);
  const discard = useActiveWorkout((s) => s.discard);
  // Phase W4 — the same screen doubles as the editor for a saved workout.
  const editingSessionId = useActiveWorkout((s) => s.editingSessionId);
  const editDateISO = useActiveWorkout((s) => s.editDateISO);
  const editNotes = useActiveWorkout((s) => s.editNotes);
  const dayType = useActiveWorkout((s) => s.dayType);
  const setEditDate = useActiveWorkout((s) => s.setEditDate);
  const setEditDayType = useActiveWorkout((s) => s.setEditDayType);
  const setEditNotes = useActiveWorkout((s) => s.setEditNotes);
  const setEditDuration = useActiveWorkout((s) => s.setEditDuration);
  const editEndedAt = useActiveWorkout((s) => s.editEndedAt);
  // Phase 3 packet C: "Log a past workout" uses this same editor for a NEW workout.
  const pastLog = useActiveWorkout((s) => s.pastLog);
  const setEditStartTime = useActiveWorkout((s) => s.setEditStartTime);
  const editOriginalDateISO = useActiveWorkout((s) => s.editOriginalDateISO);
  const saveEdits = useActiveWorkout((s) => s.saveEdits);
  const lastDeleted = useActiveWorkout((s) => s.lastDeleted);
  const undoDelete = useActiveWorkout((s) => s.undoDelete);
  const dismissUndo = useActiveWorkout((s) => s.dismissUndo);
  // "Copy to sets below" (the entry bar): its Undo.
  const lastCopy = useActiveWorkout((s) => s.lastCopy);
  const undoCopy = useActiveWorkout((s) => s.undoCopy);
  const dismissCopy = useActiveWorkout((s) => s.dismissCopy);
  // The entry bar on the keyboard (a set box has the cursor). It takes Finish's place only
  // while the keyboard is open; Finish is back the moment it closes.
  const entry = useEntryBar();
  const loadRestDefault = useRestTimer((s) => s.loadDefault);
  const defaultRestSec = useRestTimer((s) => s.defaultSec);

  // Phase 2 (LW-02): Finish opens a calm sheet first; nothing is saved until it says so.
  const [finishOpen, setFinishOpen] = useState(false);
  // LW-10: the routine's own name is the workout's default name — also on a Repeat of a
  // routine's workout (13 Oct 2026 audit, A5: it asked a name there).
  const [routineName, setRoutineName] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setRoutineName(null);
    if (ownRoutineId) {
      void getRoutine(ownRoutineId)
        .then((r) => {
          if (alive) setRoutineName(r?.name ?? null);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [ownRoutineId]);

  // Keep the screen awake and load the rest-timer default while logging. The rest
  // timer is NOT cleared on leaving this screen any more — minimising keeps it
  // running; the presence service clears it when the workout actually ends.
  useKeepAwake();
  useEffect(() => {
    void loadRestDefault();
  }, [loadRestDefault]);

  // First workout: ask for notification permission (rest alerts on a locked phone).
  useEffect(() => {
    if (!editingSessionId && !pastLog) void ensureAlertPermission();
  }, [editingSessionId, pastLog]);

  // Tell the notification handler this screen is already open (no duplicate push).
  useEffect(() => {
    useWorkoutUi.getState().setScreenOpen(true);
    return () => useWorkoutUi.getState().setScreenOpen(false);
  }, []);

  // Superset hand-off: bring the next exercise into view.
  const scrollRef = useRef<ScrollViewType>(null);
  const cardY = useRef<Record<string, number>>({});
  // A newly added exercise: bring its card into view once it has a position (the list
  // never scrolled, so a fourth card landed below the fold, out of sight).
  const knownKeys = useRef<Set<string> | null>(null);
  const scrollToNew = useRef<string | null>(null);
  useEffect(() => {
    const keys = exercises.map((e) => e.key);
    const known = knownKeys.current;
    if (known) {
      const added = keys.filter((k) => !known.has(k));
      if (added.length > 0) scrollToNew.current = added[added.length - 1];
    }
    knownKeys.current = new Set(keys);
  }, [exercises]);
  const scrollTo = useWorkoutUi((s) => s.scrollTo);
  useEffect(() => {
    if (!scrollTo) return;
    // Review (15 Oct 2026): worked out now (the list's top + the card's place in it), never a
    // stored position that a note above the list could have moved.
    const row = rowY.current[scrollTo.exKey];
    const y = row != null ? listTop.current + row : cardY.current[scrollTo.exKey];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, [scrollTo]);

  // 15 Oct 2026 (owner, in the gym): press and hold an exercise's name row, then drag it. While a
  // card is held every card shows only its name row (Hevy), and the held card is kept under the
  // finger as the cards around it shrink: `desired` is the scroll at which its new (short) place
  // sits where the finger is; the ScrollView may not reach it (top, or a short list), so the
  // held card is moved by what is left (`dragShift` = actual scroll - desired), on every scroll.
  const reorderExercises = useActiveWorkout((s) => s.reorderExercises);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const dragShift = useSharedValue(0);
  const scrollY = useRef(0);
  const listTop = useRef(0);
  const rowY = useRef<Record<string, number>>({});
  const lift = useRef<{ key: string; screenY: number; desired: number | null } | null>(null);
  // Review (15 Oct 2026): the scroll could not always reach `desired` (near the top it is below 0;
  // a short list cannot scroll far), and the held card was then drawn away from its slot — letting
  // go without moving dropped it elsewhere. A blank spacer above (`padTop`) and below (`padBottom`)
  // the list while a card is held lets the scroll reach it, so the card sits on its slot.
  const [dragPad, setDragPad] = useState({ top: 0, bottom: 0 });
  const viewH = useRef(0);
  const fixLift = useCallback(() => {
    const l = lift.current;
    if (!l || l.desired != null) return;
    const y = rowY.current[l.key];
    if (y == null) return;
    const raw = listTop.current + y - l.screenY;
    const top = Math.max(0, -raw);
    const desired = raw + top;
    l.desired = desired;
    dragShift.value = scrollY.current - desired;
    setDragPad({ top, bottom: desired > 0 ? desired + viewH.current : 0 });
    // After the spacers are drawn.
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: desired, animated: false }));
  }, [dragShift]);
  const onLift = useCallback(
    (key: string) => {
      // Review: the cards fold, so a box being typed in goes — close the keyboard first.
      Keyboard.dismiss();
      lift.current = { key, screenY: listTop.current + (rowY.current[key] ?? 0) - scrollY.current, desired: null };
      dragShift.value = 0;
      setDragKey(key);
    },
    [dragShift],
  );
  // The cards are short now: place the held one (its own layout usually comes first; this is
  // the fallback when its place did not change).
  useEffect(() => {
    if (!dragKey) return;
    const t = setTimeout(fixLift, 90);
    return () => clearTimeout(t);
  }, [dragKey, fixLift]);
  const onSettle = useCallback(() => {
    const key = lift.current?.key ?? null;
    lift.current = null;
    dragShift.value = 0;
    setDragPad({ top: 0, bottom: 0 });
    setDragKey(null);
    // Back to full cards: bring the moved one into view once it has its new place.
    if (key) setTimeout(() => useWorkoutUi.getState().requestScroll(key), 150);
  }, [dragShift]);
  const onRowLayout = useCallback(
    (key: string, y: number) => {
      rowY.current[key] = y;
      const abs = listTop.current + y;
      cardY.current[key] = abs;
      if (scrollToNew.current === key) {
        scrollToNew.current = null;
        scrollRef.current?.scrollTo({ y: Math.max(0, abs - 8), animated: true });
      }
      if (lift.current?.key === key && dragKeyRef.current === key) fixLift();
    },
    [fixLift],
  );
  const dragKeyRef = useRef<string | null>(null);
  dragKeyRef.current = dragKey;

  // Coach targets — the progressive-overload prescription, one per CARD (Packet C). Derived
  // (SQLite only), never persisted in the draft. A swapped-in exercise keeps a Target (TG-06),
  // a Counting change re-reads it in the new counting (TG-03), Profile → Units recomputes it
  // and its "why" in the new unit (TG-04). Starting a routine stores them WITH the cards
  // (TG-11), so this only loads what is missing or out of date. Empty for Start-Empty.
  const units = useUnits();
  // Oct 2026: "Weight jumps", "Rep range" and the gym's plates change the Targets at once. Review
  // fix: the plates count only once the member set up Plates and bars (the default = his own steps).
  const weightJump = useTrackerPrefs((s) => s.weightJump);
  const repRangeChoice = useTrackerPrefs((s) => s.repRange);
  const plateSetup = usePlateSetupFor(units);
  const targetQ = targetQuery(planDayId, exercises, {
    easy: easyWeek,
    effort: logsRpe,
    units,
    previousFrom,
    jump: weightJump,
    repRange: repRangeChoice,
    gym: gymPlatesFor(plateSetup, units),
  });
  const targetSig = querySignature(targetQ);
  const targetQRef = useRef(targetQ);
  targetQRef.current = targetQ;
  useEffect(() => {
    void loadTargets(targetQRef.current);
  }, [targetSig]);
  const targets = useTargets((s) => s.targets);

  // Auto-dismiss the undo snackbar after a few seconds.
  useEffect(() => {
    if (!lastDeleted) return;
    const id = setTimeout(() => dismissUndo(), 4000);
    return () => clearTimeout(id);
  }, [lastDeleted, dismissUndo]);

  // We navigate away explicitly on finish/discard; suppress the safety redirect then.
  const leaving = useRef(false);
  // Packet E: when the Add exercise picker was last opened (double-tap guard).
  const addOpenedAt = useRef(0);

  // Nothing in progress (e.g. deep-linked with no draft) — bounce to the tab. Review fix: only
  // while this screen is in front. Under another screen (a "Discard and start new" from a past
  // workout opened on top of this one) it waits; the start then comes back here with a workout.
  const focused = useIsFocused();
  useEffect(() => {
    if (bounceEmptyWorkout({ active, leaving: leaving.current, focused })) router.dismissTo('/workout');
  }, [active, focused, router]);

  // Exactly what a save would write — the same helper the store commits through,
  // so the button can never enable on a set the save then silently drops.
  const canFinish = hasWorkingSet(draftToRichSets(exercises));
  // Correcting the past: an edit of a saved workout, or a past workout being logged.
  const isEditing = isCorrecting({ editingSessionId, pastLog });

  // Distinct superset groups in this workout (for the per-card chooser). Memoised on a
  // primitive key, NOT on `exercises`: the store replaces that array on every keystroke,
  // so a plain dep would hand every card a fresh array and defeat their React.memo.
  const groupsKey = exercises.map((e) => e.supersetGroup ?? '').join(',');
  const dragItems = useMemo(() => exercises.map((ex) => ({ id: ex.key, ex })), [exercises]);
  const existingGroups = useMemo(
    () =>
      [
        ...new Set(exercises.map((e) => e.supersetGroup).filter((g): g is number => g != null)),
      ].sort((a, b) => a - b),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupsKey],
  );
  const renderCard = useCallback(
    (item: { id: string; ex: (typeof exercises)[number] }, wrap: DragWrap) => (
      <ExerciseLogCard
        exercise={item.ex}
        existingGroups={existingGroups}
        target={targets.get(item.ex.key) ?? null}
        compact={dragKey != null}
        wrapHandle={wrap}
      />
    ),
    [existingGroups, targets, dragKey],
  );

  const onDiscard = (): void => {
    const back = (): void => {
      leaving.current = true;
      // Leaving an edit returns to the workout it came from, unchanged. A discarded past log goes
      // back to the page that opened it — Calendar, with its "Log a past workout" (redesign R3;
      // before it, History's own tab) — or to Profile when nothing is behind it. (It used to
      // replace this page with Profile, dropping Calendar: phone test run 38144864717, part N.)
      const sessionId = editingSessionId;
      const wasPast = pastLog;
      void discard().then(() => {
        if (sessionId) router.replace({ pathname: '/session/[id]', params: { id: sessionId } });
        else if (wasPast) goBack(router, '/profile');
        else router.replace('/workout');
      });
    };
    if (isEditing) {
      // HI-07: leaving an edit (✕ or Back) asks first; an edit is never left open behind.
      void askConfirm(
        pastLog
          ? {
              title: 'Discard this workout?',
              body: 'Nothing is saved. Your history stays as it was.',
              confirmLabel: 'Discard',
              cancelLabel: 'Keep editing',
              destructive: true,
            }
          : {
              title: 'Discard changes?',
              body: 'Your edits will be thrown away. The saved workout stays as it was.',
              confirmLabel: 'Discard',
              cancelLabel: 'Keep editing',
              destructive: true,
            },
      ).then((ok) => {
        if (ok) back();
      });
      return;
    }
    void askConfirm({
      title: 'Discard workout?',
      body: 'This workout and its sets will be deleted. This cannot be undone.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep logging',
      destructive: true,
    }).then((ok) => {
      if (ok) back();
    });
  };

  // HI-07: Android Back on the editor asks "Discard changes?" instead of leaving the edit open
  // as "a workout in progress". (A live workout's Back still minimises it.)
  const onDiscardRef = useRef(onDiscard);
  onDiscardRef.current = onDiscard;
  useFocusEffect(
    useCallback(() => {
      if (!isEditing) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (leaving.current || useActiveWorkout.getState().committing) return true;
        onDiscardRef.current();
        return true;
      });
      return () => sub.remove();
    }, [isEditing]),
  );

  const onSaveEdits = async (): Promise<void> => {
    if (useActiveWorkout.getState().committing) return; // ignore double-tap while saving
    leaving.current = true;
    try {
      const wasPast = useActiveWorkout.getState().pastLog;
      const id = await saveEdits();
      if (!id) {
        leaving.current = false;
        void tell(
          'Nothing to save',
          wasPast
            ? 'Type at least one set to save this workout.'
            : 'A workout needs at least one set. To get rid of it entirely, discard these changes and delete the workout instead.',
        );
        return;
      }
      // Saved. Nothing past this point may report failure. HI-14: go straight to the saved
      // workout — Home catches up in the background (as after Finish), so the emptied editor
      // is never on screen while it refreshes.
      router.replace({ pathname: '/session/[id]', params: { id } });
      void useDashboard.getState().refresh().catch(() => undefined);
      if (!useActiveWorkout.getState().lastSaveReconciled) {
        void tell(
          wasPast ? 'Workout saved' : 'Changes saved',
          'Your records will catch up the next time you log or edit a workout.',
        );
      }
    } catch (err) {
      if (err instanceof SessionGoneError) {
        // Deleted from elsewhere while this draft sat open — there is nothing to
        // save back to. Drop the draft rather than leave an editor that can only fail.
        leaving.current = true;
        await discard();
        void tell('Workout deleted', 'This workout was deleted, so your changes were discarded.');
        router.dismissTo('/profile');
        return;
      }
      leaving.current = false;
      void tell(
        'Could not save',
        'Something went wrong saving your changes. The workout is unchanged — tap Save to try again.',
      );
    }
  };

  const onPrimary = (): void => {
    if (isEditing) void onSaveEdits();
    else if (canFinish && !committing) setFinishOpen(true); // LW-02: ask first, save on the sheet
  };

  // A Repeat starts with its source's name (it has no routine of its own on screen).
  const defaultName = defaultWorkoutName(routineName ?? workoutName, startedAt ?? Date.now());
  const finishing = useRef(false);

  const onFinish = async (choice: FinishChoice): Promise<void> => {
    // A double tap never saves twice (the store also guards with `committing`).
    if (finishing.current || useActiveWorkout.getState().committing) return;
    finishing.current = true;
    // What was on screen at finish — the store resets once the commit lands.
    const before = useActiveWorkout.getState();
    // Phase 4: an easy week has half the sets on purpose — never offer to save that into
    // the routine.
    const routinePlanDayId = before.easyWeek ? null : before.planDayId;
    // LW-11: work the routine question out NOW, while the workout is still on screen; the
    // summary asks it. Nothing waits between the save and the summary.
    const offer = await routineUpdateOffer(routinePlanDayId, before.exercises).catch(() => null);
    leaving.current = true;
    try {
      const id = await finish(choice.note.trim() ? choice.note.trim() : null, {
        keepUnticked: choice.keepUnticked,
        endedAt: choice.endedAt,
        name: choice.name.trim() ? choice.name : defaultName,
      });
      if (id) {
        if (offer) holdRoutineOffer(id, offer);
        setFinishOpen(false);
        router.replace({ pathname: '/session/finish', params: { id } });
        // Home catches up in the background — it never holds the summary back.
        void useDashboard.getState().refresh().catch(() => undefined);
      } else {
        leaving.current = false;
        void tell('Nothing to save', 'Tick at least one set before finishing.');
      }
    } catch {
      // Commit rolled back atomically (nothing saved) — let the user retry.
      leaving.current = false;
      void tell('Could not save', 'Something went wrong saving your workout. Your sets are still here — tap Finish to try again.');
    } finally {
      finishing.current = false;
    }
  };

  // LW-11: once Finish has saved, the summary replaces this screen. Never show the emptied
  // workout ("0m 00s", Add exercise, Discard) on the way out.
  if (!active && leaving.current) return <Screen scroll={false}>{null}</Screen>;

  return (
    <Screen scroll={false}>
      {/* header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: space.md,
        }}
      >
        {isEditing ? (
          // Phase 7: one way to leave — the back arrow (it asks before throwing edits away); an × never deletes.
          <IconButton icon="chevron-left" onPress={onDiscard} accessibilityLabel="Go back" />
        ) : (
          <Pressable
            onPress={() => goBack(router, '/workout')}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Minimise workout. It keeps running."
            style={{
              width: 42,
              height: 42,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: color.surfaceRaised,
              borderWidth: 1,
              borderColor: color.border,
            }}
          >
            <Glyph name="chevron-down" size={22} color={color.ink} />
          </Pressable>
        )}
        {/* Owns its own 1 Hz tick — the rest of this tree no longer re-renders per second. */}
        {isEditing ? (
          // v0.28.1: an old workout being edited has no running clock (it counted from its start, days ago).
          <Text style={{ fontFamily: type.mono, fontSize: type.size.caption, color: color.inkMuted, letterSpacing: 1.2 }}>
            {pastLog ? 'PAST WORKOUT' : 'EDITING'}
          </Text>
        ) : (
          <ElapsedClock startedAt={startedAt} pause={pause} onPress={() => setTimerMenu(true)} />
        )}
        {/* LW-02: no second ✓ up here — the one Finish button sits at the bottom. Keeps the clock centred. */}
        <View style={{ width: 42 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 8}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }}
          scrollEventThrottle={16}
          onLayout={(e) => {
            viewH.current = e.nativeEvent.layout.height;
          }}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            scrollY.current = y;
            const l = lift.current;
            if (l && l.desired != null) dragShift.value = y - l.desired;
          }}
        >
          {isEditing ? (
            <EditSessionHeader
              title={pastLog ? 'Logging a past workout' : 'Editing a saved workout'}
              dateISO={editDateISO ?? ''}
              dayType={dayType}
              notes={editNotes ?? ''}
              durationMin={
                editEndedAt != null && startedAt != null
                  ? Math.max(1, Math.round((editEndedAt - startedAt) / 60_000))
                  : null
              }
              startedAt={startedAt}
              storedDateISO={editOriginalDateISO ?? editDateISO ?? ''}
              onStartTimeChange={setEditStartTime}
              onDateChange={setEditDate}
              onDurationChange={setEditDuration}
              onDayTypeChange={setEditDayType}
              onNotesChange={setEditNotes}
            />
          ) : null}
          {/* 15 Oct 2026: a saved workout's photos (Hevy: media in Edit Workout). Saved the moment
              they are picked — not part of the edit, so Discard does not take them back. */}
          {editingSessionId && !pastLog ? <WorkoutPhotos sessionId={editingSessionId} /> : null}

          {/* 15 Oct 2026: while paused, one line says so and what a tick does. */}
          {paused && !isEditing ? (
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={pauseNote}
              style={{
                paddingHorizontal: space.md,
                paddingVertical: space.sm,
                borderRadius: radius.md,
                backgroundColor: color.surfaceRaised,
                borderWidth: 1,
                borderColor: color.border,
              }}
            >
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>{pauseNote}</Text>
            </View>
          ) : null}

          {/* Phase 4: the followed plan's easy week — the fact on screen, the why behind the i */}
          {easyWeek && !isEditing ? <EasyWeekNote /> : null}

          {!active ? null : exercises.length === 0 ? (
            <EmptyState
              icon="dumbbell"
              title="Add your first exercise"
              body="Pick an exercise to start logging sets."
            />
          ) : (
            <View
              onLayout={(e) => {
                listTop.current = e.nativeEvent.layout.y;
              }}
            >
              {dragPad.top > 0 ? <View style={{ height: dragPad.top }} /> : null}
              <DragList
                items={dragItems}
                gap={space.md}
                handle
                renderItem={renderCard}
                onReorder={(keys, moved) => reorderExercises(keys, moved)}
                onLift={onLift}
                onSettle={onSettle}
                onRowLayout={onRowLayout}
                shift={dragShift}
              />
              {dragPad.bottom > 0 ? <View style={{ height: dragPad.bottom }} /> : null}
            </View>
          )}
          <GhostButton
            label="Add exercise"
            icon="plus"
            onPress={() => {
              // A double tap opens one picker, not two stacked.
              const now = Date.now();
              if (now - addOpenedAt.current < 1000) return;
              addOpenedAt.current = now;
              router.push('/session/add-exercise');
            }}
          />
          {!isEditing ? (
            <View style={{ paddingVertical: space.xs }}>
              <DangerLink label="Discard workout" onPress={onDiscard} />
            </View>
          ) : null}
        </ScrollView>
        <RecordToast />

        {/* rest timer · undo · finish (the entry bar while typing in a set) */}
        {/* With the keyboard open the screen already ends at its top: no room for the nav bar. */}
        <View style={{ paddingTop: space.md, paddingBottom: entry ? space.sm : Math.max(insets.bottom, space.md) }}>
          <RestTimerBar />
          {lastDeleted ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
                marginBottom: space.sm,
                borderRadius: radius.lg,
                backgroundColor: color.surfaceRaised,
                borderWidth: 1,
                borderColor: color.border,
              }}
            >
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>
                Set removed
              </Text>
              <Pressable onPress={() => undoDelete()} hitSlop={8}>
                <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.sub, color: color.accent }}>Undo</Text>
              </Pressable>
            </View>
          ) : null}
          {lastCopy ? (
            <View style={{ marginBottom: space.sm }}>
              <UndoBar
                key={lastCopy.id}
                message={copiedText(lastCopy.count)}
                onAction={undoCopy}
                onDismiss={() => dismissCopy(lastCopy.id)}
              />
            </View>
          ) : null}
          {entry ? (
            <EntryBar model={entry} />
          ) : canFinish || committing ? (
            <PrimaryButton
              label={isEditing ? (pastLog ? 'Save workout' : 'Save changes') : 'Finish workout'}
              icon="check"
              loading={committing}
              disabled={committing}
              onPress={onPrimary}
            />
          ) : (
            <NotYetButton
              label={isEditing ? (pastLog ? 'Type a set to save' : 'Keep at least one set') : 'Log a set to finish'}
            />
          )}
        </View>
      </KeyboardAvoidingView>
      {!isEditing && startedAt != null ? (
        <FinishSheet
          visible={finishOpen}
          exercises={exercises}
          startedAt={startedAt}
          pause={pause}
          defaultName={defaultName}
          // A routine's workout keeps the routine's name: no Name box (owner, 13 Oct 2026).
          askName={!routineName}
          defaultRestSec={defaultRestSec}
          saving={committing}
          onFinish={(choice) => void onFinish(choice)}
          onClose={() => setFinishOpen(false)}
        />
      ) : null}
      {/* 15 Oct 2026: the workout timer's menu (Hevy: tap the duration). */}
      {!isEditing ? (
        <TrackerSheet
          visible={timerMenu}
          title={PAUSE_WORDS.sheetTitle}
          subtitle={PAUSE_WORDS.runningHint}
          onClose={() => setTimerMenu(false)}
        >
          {paused ? (
            <SheetRow
              label={PAUSE_WORDS.resume}
              leading={<Glyph name="play" size={20} color={color.accent} />}
              onPress={() => {
                resumeWorkout();
                setTimerMenu(false);
              }}
            />
          ) : (
            <SheetRow
              label={PAUSE_WORDS.pause}
              leading={<Glyph name="pause" size={20} color={color.accent} />}
              onPress={() => {
                pauseWorkout();
                setTimerMenu(false);
              }}
            />
          )}
        </TrackerSheet>
      ) : null}
    </Screen>
  );
}
