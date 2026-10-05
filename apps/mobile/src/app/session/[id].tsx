/**
 * Detail of a past workout (from History) — repeat or edit it; the "more" menu
 * holds Save as routine (Phase 1) and Delete.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { EmptyState, GhostButton, Icon, IconButton, PrimaryButton, Screen, Skeleton } from '@/components/ui';
import { deleteSessionAndReconcile } from '@/tracker/services/prRebuild';
import { shortDate } from '@/lib/date';
import { useDashboard } from '@/store/dashboardStore';
import { color, radius, space } from '@/theme/tokens';

import { createRoutineFromWorkout } from '@/tracker/db/routineRepo';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { SheetRow, TrackerSheet } from '@/tracker/components/TrackerSheet';

import { getSessionSetMeta } from '@/tracker/db/trackerSets';
import { uneditableReason } from '@/tracker/services/editDraft';
import { SessionSummary } from '@/tracker/components/SessionSummary';
import { dayTypeLabel, getSessionSummary } from '@/tracker/services/finishSummary';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

export default function SessionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const startFromSession = useActiveWorkout((s) => s.startFromSession);
  const startEditingSession = useActiveWorkout((s) => s.startEditingSession);
  const hydrate = useActiveWorkout((s) => s.hydrate);
  // ONE guard for both actions: they share the single draft slot, so a fast
  // Edit-then-Repeat could otherwise start both before either sets `active`.
  const busy = useRef(false);

  const [data, setData] = useState<SessionSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    let alive = true;
    if (id) {
      getSessionSummary(id)
        .then((d) => {
          if (alive) {
            setData(d);
            setLoading(false);
          }
        })
        .catch(() => {
          if (alive) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => {
      alive = false;
    };
  }, [id]);

  const onRepeat = async (): Promise<void> => {
    if (!data || busy.current) return;
    busy.current = true;
    // Hydrate first: a persisted in-progress draft may exist but not yet be in memory
    // (it only loads on the Workout tab), and startFromSession would overwrite it.
    await hydrate();
    if (useActiveWorkout.getState().active) {
      busy.current = false;
      Alert.alert('Finish your current workout first', 'You already have a workout in progress.');
      return;
    }
    await startFromSession(data.session);
    router.replace('/session/active');
  };

  const onEdit = async (): Promise<void> => {
    if (!data || busy.current) return;
    busy.current = true;
    // Same guard as Repeat: a persisted in-progress draft only loads on the Workout
    // tab, so hydrate first or editing would silently overwrite it.
    await hydrate();
    if (useActiveWorkout.getState().active) {
      busy.current = false;
      Alert.alert(
        'Finish your current workout first',
        'You have a workout in progress. Finish or discard it before editing an older one.',
      );
      return;
    }
    try {
      // Saving REPLACES every set, so refuse the cases the editor cannot represent
      // faithfully rather than quietly merging them away.
      const blocked = uneditableReason(data.session, await getSessionSetMeta(data.session.id));
      if (blocked) {
        busy.current = false;
        Alert.alert("Can't edit this one", blocked);
        return;
      }
      await startEditingSession(data.session);
      router.replace('/session/active');
    } catch {
      busy.current = false;
      Alert.alert('Could not open the editor', 'Something went wrong. Please try again.');
    }
  };

  const onSaveRoutine = async (): Promise<void> => {
    if (!data || busy.current) return;
    busy.current = true;
    try {
      const s = data.session;
      const items = s.exercises.map((g) => ({
        exerciseId: g.exercise.id,
        workingSets: g.sets.filter((x) => !x.isWarmup).length,
      }));
      const routineId = await createRoutineFromWorkout({
        name: `${dayTypeLabel(s.dayType)} · ${shortDate(s.dateISO)}`,
        dayType: s.dayType === 'rest' ? 'full' : s.dayType,
        items,
      });
      busy.current = false;
      Alert.alert('Saved as a routine', 'You can rename it and start it from the Workout tab.', [
        { text: 'Done', style: 'cancel' },
        { text: 'Open routine', onPress: () => router.push({ pathname: '/routines/[id]', params: { id: routineId } }) },
      ]);
    } catch {
      busy.current = false;
      Alert.alert('Could not save the routine', 'Something went wrong. Please try again.');
    }
  };

  const onDelete = (): void => {
    if (!id) return;
    Alert.alert('Delete workout?', 'This permanently removes this workout and its sets.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteSessionAndReconcile(id)
            .then(() => {
              void useDashboard.getState().refresh();
              router.back();
            })
            .catch(() => Alert.alert('Delete failed', 'Could not delete this workout. Please try again.'));
        },
      },
    ]);
  };

  return (
    <Screen
      title={data ? dayTypeLabel(data.session.dayType) : 'Workout'}
      subtitle={data ? shortDate(data.session.dateISO) : undefined}
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
          <SessionSummary data={data} />
          <View style={{ gap: space.md }}>
            <PrimaryButton label="Repeat this workout" icon="dumbbell" onPress={() => void onRepeat()} />
            <GhostButton label="Edit this workout" icon="check" onPress={() => void onEdit()} />
          </View>
          <TrackerSheet visible={menu} title="This workout" onClose={() => setMenu(false)}>
            <View style={{ gap: 2 }}>
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
                  setTimeout(onDelete, 260);
                }}
              />
            </View>
          </TrackerSheet>
        </View>
      ) : (
        <EmptyState icon="dumbbell" title="Workout not found" body="This session may have been deleted." />
      )}
    </Screen>
  );
}
