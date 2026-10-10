/**
 * Detail of a past workout (from History) — repeat or edit it; the "more" menu
 * holds Save as routine (Phase 1) and Delete.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Card, EmptyState, GhostButton, askConfirm, Icon, IconButton, LoadError, PrimaryButton, Screen, Skeleton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { deleteWorkout } from '@/tracker/services/workoutDelete';
import { dateWithYear, shortDate } from '@/lib/date';
import { EDIT_FAILED, SAVE_ROUTINE_FAILED, START_FAILED, runGuarded } from '@/lib/guardedAction';
import { useLoad } from '@/lib/useLoad';
import { useUnits } from '@/lib/useUnits';
import { useDashboard } from '@/store/dashboardStore';
import { color, radius, space, type } from '@/theme/tokens';
import { shownNotes } from '@/tracker/lib/workoutText';

import { createRoutineFromWorkout } from '@/tracker/db/routineRepo';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { SheetRow, TrackerSheet } from '@/tracker/components/TrackerSheet';

import { getSessionSetMeta } from '@/tracker/db/trackerSets';
import { uneditableReason } from '@/tracker/services/editDraft';
import { SessionSummary } from '@/tracker/components/SessionSummary';
import { ShareSheet } from '@/tracker/components/ShareSheet';
import { getSessionSummary, sessionTitle } from '@/tracker/services/finishSummary';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import { workoutShareScene } from '@/tracker/share/workoutCard';
import { workoutShareInput } from '@/tracker/share/workoutInput';
import { askAboutOpenWorkout, showActiveWorkout } from '@/tracker/services/workoutStart';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

export default function SessionDetailScreen() {
  useUnits(); // v0.27.0: the record and set texts follow Profile → Units
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const startFromSession = useActiveWorkout((s) => s.startFromSession);
  const startEditingSession = useActiveWorkout((s) => s.startEditingSession);
  const hydrate = useActiveWorkout((s) => s.hydrate);
  // ONE guard for both actions: they share the single draft slot, so a fast
  // Edit-then-Repeat could otherwise start both before either sets `active`.
  const busy = useRef(false);

  // HI-11: a failed read says so with Try again — "Workout not found" only when the read
  // really answered that there is no such workout.
  const summary = useLoad<SessionSummaryData | null>(() => (id ? getSessionSummary(id) : Promise.resolve(null)), [id]);
  const data = summary.data;
  const loading = summary.state === 'loading';
  const loadFailed = summary.state === 'error';
  // HI-13 / LW-20: a failed Repeat / Edit / Save as routine says so here and frees the buttons.
  const [actionError, setActionError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [sharing, setSharing] = useState(false);
  // v0.25.1: the body figure chosen in Profile.
  const figure = useTrackerPrefs((s) => s.bodyFigure);
  // Phase 3: the same picture the finish screen shares.
  const scene = useMemo(() => (data ? workoutShareScene({ ...workoutShareInput(data), figure }) : null), [data, figure]);

  const onRepeat = (): Promise<unknown> =>
    runGuarded(
      busy,
      async () => {
        if (!data) return;
        setActionError(null);
        // Hydrate first: a persisted in-progress draft may exist but not yet be in memory
        // (it only loads on the Workout tab), and startFromSession would overwrite it.
        await hydrate();
        // LW-24: a workout already open is never a dead end: Resume it, or discard it and start this.
        if ((await askAboutOpenWorkout()) === 'resume') {
          showActiveWorkout(router);
          return 'left' as const;
        }
        await startFromSession(data.session);
        showActiveWorkout(router);
        return 'left' as const;
      },
      () => setActionError(START_FAILED),
    );

  const onEdit = (): Promise<unknown> =>
    runGuarded(
      busy,
      async () => {
        if (!data) return;
        setActionError(null);
        // Same guard as Repeat: a persisted in-progress draft only loads on the Workout
        // tab, so hydrate first or editing would silently overwrite it.
        await hydrate();
        // LW-24: Resume the open workout, or discard it and edit this one.
        if ((await askAboutOpenWorkout({ startLabel: 'Discard it and edit this one' })) === 'resume') {
          showActiveWorkout(router);
          return 'left' as const;
        }
        // Saving REPLACES every set, so refuse the cases the editor cannot represent
        // faithfully rather than quietly merging them away.
        const blocked = uneditableReason(data.session, await getSessionSetMeta(data.session.id));
        if (blocked) {
          Alert.alert("Can't edit this one", blocked);
          return;
        }
        await startEditingSession(data.session);
        showActiveWorkout(router);
        return 'left' as const;
      },
      () => setActionError(EDIT_FAILED),
    );

  const onSaveRoutine = (): Promise<unknown> =>
    runGuarded(
      busy,
      async () => {
        if (!data) return;
        setActionError(null);
        const s = data.session;
        const items = s.exercises.map((g) => ({
          exerciseId: g.exercise.id,
          workingSets: g.sets.filter((x) => !x.isWarmup).length,
        }));
        const routineId = await createRoutineFromWorkout({
          name: s.title?.trim() ? s.title.trim() : `${sessionTitle(s)} · ${shortDate(s.dateISO)}`,
          dayType: s.dayType === 'rest' ? 'full' : s.dayType,
          items,
        });
        Alert.alert('Saved as a routine', 'You can rename it and start it from the Workout tab.', [
          { text: 'Done', style: 'cancel' },
          { text: 'Open routine', onPress: () => router.push({ pathname: '/routines/[id]', params: { id: routineId } }) },
        ]);
      },
      () => setActionError(SAVE_ROUTINE_FAILED),
    );

  // HI-12: "failed" only when the workout is really still there. The records, Health Connect
  // and the widgets catch up on their own; they never turn a done delete into "failed".
  const onDelete = async (): Promise<void> => {
    if (!id) return;
    const ok = await askConfirm({
      title: 'Delete this workout?',
      body: 'This removes the workout and its sets.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setActionError(null);
    const outcome = await deleteWorkout(id);
    if (!outcome.deleted) {
      setActionError('Could not delete this workout. It is still here. Please try again.');
      return;
    }
    void useDashboard.getState().refresh().catch(() => undefined);
    try {
      if (router.canGoBack()) router.back();
      else router.replace('/history');
    } catch {
      // the workout is gone either way; the screen shows "not found" on its next read
    }
  };

  return (
    <Screen
      title={data ? sessionTitle(data.session) : 'Workout'}
      // HI-15: the year when it isn't this year. HI-19: an easy-week workout says so.
      subtitle={data ? `${dateWithYear(data.session.dateISO)}${data.easyWeek ? ' · Easy week' : ''}` : undefined}
      right={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {data ? (
            <Pressable
              onPress={() => setMenu(true)}
              accessibilityRole="button"
              accessibilityLabel="More"
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
              <Glyph name="more" size={20} color={color.inkSecondary} />
            </Pressable>
          ) : null}
          <IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />
        </View>
      }
    >
      {loading ? (
        <View style={{ gap: space.lg }}>
          <Skeleton width="100%" height={180} radius={radius.lg} />
          <Skeleton width="100%" height={160} radius={radius.lg} />
        </View>
      ) : data ? (
        <View style={{ gap: space.lg }}>
          <SessionSummary data={data} exercisesOpen />
          {/* HI-04: the workout's notes, under its summary (the name is the screen's title). */}
          {(() => {
            const note = shownNotes(data.session.title, data.session.notes);
            return note ? (
              <Card>
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted, letterSpacing: 0.4 }}>Notes</Text>
                <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.ink, marginTop: space.xs, lineHeight: 21 }}>{note}</Text>
              </Card>
            ) : null;
          })()}
          <View style={{ gap: space.md }}>
            <PrimaryButton label="Repeat this workout" icon="dumbbell" onPress={() => void onRepeat()} />
            <GhostButton label="Edit this workout" icon="check" onPress={() => void onEdit()} />
            <InlineError message={actionError} />
          </View>
          <TrackerSheet visible={menu} title="This workout" onClose={() => setMenu(false)}>
            <View style={{ gap: 2 }}>
              <SheetRow
                label="Share as a picture"
                leading={<Glyph name="image" size={20} color={color.accent} />}
                onPress={() => {
                  setMenu(false);
                  // Let the menu slide away before the share sheet slides up.
                  setTimeout(() => setSharing(true), 260);
                }}
              />
              <SheetRow
                label="Save as routine"
                leading={<Glyph name="list" size={20} color={color.accent} />}
                onPress={() => {
                  setMenu(false);
                  void onSaveRoutine();
                }}
              />
              <SheetRow
                label="Delete workout"
                danger
                leading={<Glyph name="trash" size={20} color={color.criticalText} />}
                onPress={() => {
                  setMenu(false);
                  setTimeout(() => void onDelete(), 260);
                }}
              />
            </View>
          </TrackerSheet>
          {scene ? (
            <ShareSheet
              visible={sharing}
              scene={scene}
              fileName={`forgeai-workout-${data.session.dateISO}`}
              title="Share this workout"
              onClose={() => setSharing(false)}
            />
          ) : null}
        </View>
      ) : loadFailed ? (
        <LoadError what="this workout" onRetry={summary.retry} />
      ) : (
        <EmptyState icon="dumbbell" title="Workout not found" body="This session may have been deleted." />
      )}
    </Screen>
  );
}
