/**
 * A saved workout's page — redesign R5, Hevy's Workout Detail (PLAN §4.5): the name, the day and
 * time, then `WorkoutDetail` (stats, note, muscle split, every exercise with its sets and records;
 * tap an exercise → its page). Top right, as in Hevy: share (a picture or text) and ⋯ — the same
 * list as the Profile feed's ⋯ (`useWorkoutActions`): Save as routine · Repeat workout · Edit
 * workout · Share as a picture · Share as text · Delete workout (asks first).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { EmptyState, LoadError, Screen, Skeleton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { goBack } from '@/lib/goBack';
import { navigateOnce } from '@/lib/guardedAction';
import { useLoad } from '@/lib/useLoad';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space } from '@/theme/tokens';

import type { Folder } from '@/tracker/db/folderRepo';
import { useWorkoutActions } from '@/tracker/lib/useWorkoutActions';
import { FolderPickerSheet } from '@/tracker/components/FolderPickerSheet';
import { Glyph, type GlyphName } from '@/tracker/components/TrackerGlyph';
import { SheetRow, TrackerSheet } from '@/tracker/components/TrackerSheet';

import { ShareSheet } from '@/tracker/components/ShareSheet';
import { shareTextNow } from '@/tracker/components/ShareTextRow';
import { WorkoutDetail } from '@/tracker/components/WorkoutDetail';
import { workoutText } from '@/tracker/services/shareText';
import { getSessionSummary, sessionTitle } from '@/tracker/services/finishSummary';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import { detailWhen } from '@/tracker/services/workoutDetail';
import { workoutShareScene } from '@/tracker/share/workoutCard';
import { workoutShareInput } from '@/tracker/share/workoutInput';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

/** Let one sheet slide away before the next slides up. */
const SLIDE_MS = 260;

function TopButton({ glyph, label, onPress }: { glyph: GlyphName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color.surfaceRaised,
        borderWidth: 1,
        borderColor: color.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Glyph name={glyph} size={20} color={color.inkSecondary} />
    </Pressable>
  );
}

export default function SessionDetailScreen() {
  useUnits(); // v0.27.0: the record and set texts follow Settings → Units
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  // HI-11: a failed read says so with Try again — "Workout not found" only when the read
  // really answered that there is no such workout.
  const summary = useLoad<SessionSummaryData | null>(() => (id ? getSessionSummary(id) : Promise.resolve(null)), [id]);
  const data = summary.data;
  const loading = summary.state === 'loading';
  const loadFailed = summary.state === 'error';
  // Repeat / Edit / Save as routine / Delete — the same actions as the Profile feed's ⋯
  // (`useWorkoutActions`). HI-13 / LW-20: a failed one says so here and frees the buttons.
  const actions = useWorkoutActions(router);
  const { actionError, pickFolders } = actions;
  const [menu, setMenu] = useState<'menu' | 'share' | null>(null);
  const [sharing, setSharing] = useState(false);
  // v0.25.1: the body figure chosen in Settings → Units.
  const figure = useTrackerPrefs((s) => s.bodyFigure);
  // Phase 3: the same picture the finish screen shares.
  const scene = useMemo(() => (data ? workoutShareScene({ ...workoutShareInput(data), figure }) : null), [data, figure]);
  // One exercise page per tap, however fast the taps.
  const nav = useRef(false);

  const close = (then?: () => void): void => {
    setMenu(null);
    if (then) setTimeout(then, SLIDE_MS);
  };

  const onSaveRoutine = (folderId: string | null, choices: readonly Folder[]): Promise<unknown> =>
    data ? actions.onSaveRoutine(data, folderId, choices) : Promise.resolve();

  const onDelete = async (): Promise<void> => {
    if (!id) return;
    await actions.onDelete(id, () => {
      try {
        if (router.canGoBack()) router.back();
        else router.dismissTo('/profile');
      } catch {
        // the workout is gone either way; the screen shows "not found" on its next read
      }
    });
  };

  const title = data ? sessionTitle(data.session) : 'Workout';
  const shareRows = data ? (
    <>
      <SheetRow label="Share as a picture" leading={<Glyph name="image" size={20} color={color.accent} />} onPress={() => close(() => setSharing(true))} />
      <SheetRow
        label="Share as text"
        leading={<Glyph name="share" size={20} color={color.accent} />}
        onPress={() => close(() => void shareTextNow(() => workoutText(data), sessionTitle(data.session)))}
      />
    </>
  ) : null;

  return (
    <Screen
      title={title}
      // HI-15 / Hevy: the day and the time it started. HI-19: an easy-week workout says so.
      subtitle={data ? `${detailWhen(data.session.dateISO, data.session.startedAt)}${data.easyWeek ? ' · Easy week' : ''}` : undefined}
      right={
        data ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <TopButton glyph="share" label="Share" onPress={() => setMenu('share')} />
            <TopButton glyph="more" label="More" onPress={() => setMenu('menu')} />
          </View>
        ) : undefined
      }
      onBack={() => goBack(router, '/profile')}
    >
      {loading ? (
        <View style={{ gap: space.lg }}>
          <Skeleton width="100%" height={180} radius={radius.lg} />
          <Skeleton width="100%" height={160} radius={radius.lg} />
        </View>
      ) : data ? (
        <View style={{ gap: space.lg }}>
          <InlineError message={actionError} />
          <WorkoutDetail
            data={data}
            onOpenExercise={(exerciseId) => navigateOnce(nav, () => router.push({ pathname: '/exercise/[id]', params: { id: exerciseId } }))}
          />
          <TrackerSheet visible={menu != null} title={menu === 'share' ? 'Share' : 'This workout'} onClose={() => close()}>
            <View style={{ gap: 2 }}>
              {menu === 'share' ? (
                shareRows
              ) : (
                <>
                  <SheetRow label="Save as routine" leading={<Glyph name="list" size={20} color={color.accent} />} onPress={() => close(actions.askSaveRoutine)} />
                  <SheetRow label="Repeat workout" leading={<Glyph name="play" size={20} color={color.accent} />} onPress={() => close(() => void actions.onRepeat(data))} />
                  <SheetRow label="Edit workout" leading={<Glyph name="pencil" size={20} color={color.accent} />} onPress={() => close(() => void actions.onEdit(data))} />
                  {shareRows}
                  <SheetRow label="Delete workout" danger leading={<Glyph name="trash" size={20} color={color.criticalText} />} onPress={() => close(() => void onDelete())} />
                </>
              )}
            </View>
          </TrackerSheet>
          <FolderPickerSheet
            visible={pickFolders != null}
            title="Where should the routine go?"
            folders={pickFolders ?? []}
            onClose={actions.closeFolders}
            onPick={(folderId) => {
              const choices = pickFolders ?? [];
              actions.closeFolders();
              // Let the sheet slide away before the saved message.
              setTimeout(() => void onSaveRoutine(folderId, choices), SLIDE_MS);
            }}
          />
          {scene ? <ShareSheet visible={sharing} scene={scene} fileName={`forgeai-workout-${data.session.dateISO}`} onClose={() => setSharing(false)} /> : null}
        </View>
      ) : loadFailed ? (
        <LoadError what="this workout" onRetry={summary.retry} />
      ) : (
        <EmptyState icon="dumbbell" title="Workout not found" body="This workout may have been deleted." />
      )}
    </Screen>
  );
}
