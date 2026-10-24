/**
 * Redesign R4 — the Workout tab under the Up next card, in Hevy's layout (PLAN §2 items 3–8):
 *
 *   + Start empty workout
 *   Routines                                  [new folder]
 *   [New routine]  [Explore]
 *   ▸ Push Pull Legs (6)   Following            ⋯
 *       Push 1   Next                           ⋯
 *       Bench Press, Incline Dumbbell Press, …
 *       [ Start routine ]
 *
 * The rules (open/shut, tags, menus, moves, where a new routine goes, the delete questions) are
 * in `lib/workoutTab.ts`; every write goes through the existing queued repos (folderRepo,
 * routineRepo, planState) and keeps their safety rules: a delete asks first, a new or copied
 * routine never joins the followed plan by itself (RP-08), the followed folder stays first.
 * Reorder: press and hold a routine, then drag it within its folder (15 Oct 2026, as Hevy does;
 * DragList). The routine ⋯ keeps Move up / Move down / Move to folder… (moving between folders).
 */
import { reachedLimit } from '@/cloud/limitsFlag';
import { explainLimit } from '@/cloud/limitsPrompt';
import { DragGrip } from './DragGrip';
import { DragList } from './DragList';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type MutableRefObject } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Badge, Icon, LoadError, Skeleton, askConfirm, type IconName } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { todayISO } from '@/lib/date';
import { START_FAILED, runGuarded } from '@/lib/guardedAction';
import { tap } from '@/lib/haptics';
import { readWithRetry } from '@/lib/retryRead';
import { tell } from '@/lib/tell';
import { useRereadWhenFailed } from '@/lib/useRereadWhenFailed';
import { countWord } from '@/lib/words';
import { fromGymLine } from '@/shop/gymPlans';
import { useGymShop } from '@/shop/gymStore';
import { accentTint } from '@/theme/tint';
import { color, radius, space, type } from '@/theme/tokens';

import {
  createFolder,
  deleteFolder,
  folderOfRoutine,
  followFolder,
  moveRoutine,
  renameFolder,
  reorderFolders,
  unfollowFolder,
  type Folder,
  type RoutineFull,
} from '../db/folderRepo';
import { createRoutine, deleteRoutine, duplicateRoutine, reorderRoutines } from '../db/routineRepo';
import {
  deleteFolderQuestion,
  deleteRoutineQuestion,
  exerciseLine,
  folderA11y,
  folderMenu,
  folderTag,
  folderTitle,
  isFolderOpen,
  movedFolderOrder,
  movedRoutineOrder,
  moveTargets,
  newRoutineTarget,
  routineA11y,
  routineMenu,
  routineTag,
  type FolderAction,
  type RoutineAction,
  type UpNextRef,
} from '../lib/workoutTab';
import { moveEasyWeek, setEasyWeeks, type PlanNow } from '../services/planState';
import { syncGymPlans } from '../services/gymPlansSync';
import { forgetWorkoutFolders, getWorkoutFolders } from '../services/workoutFolders';
import { askAboutOpenWorkout, openActiveWorkout } from '../services/workoutStart';
import { useActiveWorkout } from '../store/activeWorkoutStore';
import { useFolderOpen } from '../store/folderOpenStore';
import { FolderPickerSheet } from './FolderPickerSheet';
import { NameSheet } from './NameSheet';
import { ShareRoutineSheet } from './ShareRoutineSheet';
import { Glyph } from './TrackerGlyph';
import { SheetRow, TrackerSheet } from './TrackerSheet';

/** At this text size and up, side-by-side buttons stack (200 % text never squeezes a label). */
const STACK_AT_FONT_SCALE = 1.5;
/** Two RN Modals swapping in the same frame can drop the second on Android. */
const SHEET_SWAP_MS = 260;

/** Hevy's new-folder icon: a folder with a plus, drawn like the app's icons (24×24, 1.8 stroke). */
function FolderPlus({ size = 24, tint = color.ink }: { size?: number; tint?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 7.2a1.7 1.7 0 0 1 1.7-1.7h4.2l2 2.2h7.4a1.7 1.7 0 0 1 1.7 1.7v8.4a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7Z"
        stroke={tint}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M12 10.6v5.2M9.4 13.2h5.2" stroke={tint} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** Hevy's dark filled buttons ("+ Start Empty Workout", "New Routine", "Explore"). */
function TileButton({ label, icon, onPress, a11y, half }: { label: string; icon: IconName; onPress: () => void; a11y?: string; half?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      style={({ pressed }) => ({
        // Side by side, the two share the row equally; stacked (or alone), each sizes to its label.
        ...(half ? { flexGrow: 1, flexBasis: 0 } : null),
        minHeight: 52,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.border,
        backgroundColor: pressed ? color.surfaceRaised : color.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
      })}
    >
      <Icon name={icon} size={20} color={color.ink} />
      <Text style={{ flexShrink: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{label}</Text>
    </Pressable>
  );
}

/** The ⋯ button: 48 dp, named for what it is about. */
function MoreButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Glyph name="more" size={22} color={color.inkSecondary} />
    </Pressable>
  );
}

function RoutineCard({
  r,
  tag,
  error,
  onOpen,
  onStart,
  onMore,
  canDrag = false,
}: {
  r: RoutineFull;
  tag: 'Next' | null;
  error: string | null;
  onOpen: () => void;
  onStart: () => void;
  onMore: () => void;
  /** Two routines or more in the folder: the bar at the top says press, hold and drag. */
  canDrag?: boolean;
}) {
  const empty = r.exercises.length === 0;
  return (
    <View style={{ backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: tag ? accentTint(0.45) : color.border, padding: space.md, gap: space.sm }}>
      {canDrag ? <DragGrip style={{ marginTop: -space.xs, marginBottom: -space.xs }} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.xs }}>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={routineA11y(r, tag)}
          accessibilityHint="Shows the routine"
          style={{ flex: 1, minHeight: 48, justifyContent: 'center', gap: 2 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm }}>
            <Text style={{ flexShrink: 1, fontFamily: type.heading, fontSize: type.size.body, color: color.ink }}>{r.name}</Text>
            {tag ? <Badge label={tag} tone="accent" /> : null}
          </View>
          <Text numberOfLines={1} style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>
            {exerciseLine(r)}
          </Text>
        </Pressable>
        <MoreButton label={`More for ${r.name}`} onPress={onMore} />
      </View>
      <Pressable
        onPress={onStart}
        accessibilityRole="button"
        accessibilityLabel={empty ? `Add exercises to ${r.name}` : `Start routine ${r.name}`}
        style={({ pressed }) => ({
          minHeight: 48,
          paddingVertical: space.sm,
          paddingHorizontal: space.md,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? color.accentSoft : empty ? 'transparent' : accentTint(0.1),
          borderWidth: 1,
          borderColor: empty ? color.borderStrong : color.accent,
        })}
      >
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: empty ? color.ink : color.accentBright, textAlign: 'center' }}>
          {empty ? 'Add exercises' : 'Start routine'}
        </Text>
      </Pressable>
      <InlineError message={error} />
    </View>
  );
}

export function WorkoutRoutines({
  up,
  active,
  plan,
  refreshKey,
  startGuard,
  onStartEmpty,
  onChanged,
}: {
  /** Where Up next comes from — for the "Following" / "Up next" and "Next" tags. */
  up: UpNextRef;
  /** A workout (or an edit) is open: "Start empty workout" hides; Resume is on the card above. */
  active: boolean;
  /** The followed plan's week (easy weeks), as the Up next card reads it. */
  plan: PlanNow | null;
  /** Read again when this changes (the tab's own refresh). */
  refreshKey: number;
  /** The tab's one start guard: Up next's Start and a routine's Start never run together. */
  startGuard: MutableRefObject<boolean>;
  onStartEmpty: () => void;
  /** Something that can change Up next was saved (follow, delete, a move…): read it again. */
  onChanged: () => void;
}) {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const stack = fontScale >= STACK_AT_FONT_SCALE;
  const startFromPlanDay = useActiveWorkout((s) => s.startFromPlanDay);
  const hydrate = useActiveWorkout((s) => s.hydrate);
  const saved = useFolderOpen((s) => s.open);
  const setOpen = useFolderOpen((s) => s.setOpen);

  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [startError, setStartError] = useState<{ id: string; message: string } | null>(null);
  const [folderFor, setFolderFor] = useState<Folder | null>(null);
  const [routineFor, setRoutineFor] = useState<{ folder: Folder; routine: RoutineFull } | null>(null);
  const [easyFor, setEasyFor] = useState<Folder | null>(null);
  const [moveFor, setMoveFor] = useState<{ folder: Folder; routine: RoutineFull } | null>(null);
  const [naming, setNaming] = useState<{ mode: 'new' } | { mode: 'rename'; folder: Folder } | null>(null);
  const [picking, setPicking] = useState(false);
  const [sharing, setSharing] = useState<{ folder: string | null; routines: RoutineFull[] } | null>(null);

  const reload = useCallback(() => {
    let alive = true;
    // Phone test run 38144864717: a read that failed for a moment at app start left
    // "Couldn't load your routines" up; it is tried again (300 ms, 1 s, 2.5 s) before that shows.
    readWithRetry(getWorkoutFolders, { wanted: () => alive })
      .then((list) => {
        if (!alive) return;
        setFolders(list);
        setLoadFailed(false);
        if (useFolderOpen.persist.hasHydrated()) useFolderOpen.getState().prune(list.map((f) => f.id));
      })
      .catch(() => {
        // Keep folders already on screen; with none, the section shows "Couldn't load".
        if (alive) setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
    // refreshKey: the tab asks for a fresh read (a new day, a change made here).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useFocusEffect(reload);
  // Still failed: read again when the app is back in front, or after the next save.
  useRereadWhenFailed(folders == null && loadFailed, reload);

  /** After a write: forget the kept list, read it and Up next again. */
  const changed = (): void => {
    forgetWorkoutFolders();
    onChanged();
  };

  // OWNER-INBOX #6: workout plans the member's gym sent arrive as folders (at most every 10 min).
  const gymLink = useGymShop((st) => st.link);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void syncGymPlans(gymLink).then((did) => {
        if (alive && did) changed();
      });
      return () => {
        alive = false;
      };
      // changed only calls stable setters and the tab's callback.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gymLink]),
  );
  const failed = (title: string) => (): void => {
    void tell(title, 'Please try again.');
    changed();
  };

  // Two RN Modals swapping in the same frame can drop the second on Android.
  const after = (fn: () => void): void => {
    setFolderFor(null);
    setRoutineFor(null);
    setPicking(false);
    setTimeout(fn, SHEET_SWAP_MS);
  };

  const list = folders ?? [];

  // ------------------------------------------------------------ actions

  const onNewRoutine = async (folderId: string | null): Promise<void> => {
    // #43: the free plan's limit (switched off at launch; gym members never meet it).
    if (await reachedLimit('routines')) {
      void explainLimit('routines', () => router.push('/settings/gym'));
      return;
    }
    try {
      // RP-08: no folder given → "My routines" (not followed), never the plan by itself.
      const id = await createRoutine({ name: 'New routine', dayType: 'full', folderId });
      forgetWorkoutFolders();
      if (folderId) setOpen(folderId, true);
      router.push(`/routines/${id}`);
    } catch {
      void tell('Could not create routine', 'Please try again.');
    }
  };

  const onNewRoutineButton = (): void => {
    tap();
    const target = newRoutineTarget(list);
    if (target.kind === 'ask') setPicking(true);
    else void onNewRoutine(target.folderId);
  };

  const onStartRoutine = (r: RoutineFull): void => {
    if (r.exercises.length === 0) {
      router.push(`/routines/${r.id}`);
      return;
    }
    void runGuarded(
      startGuard,
      async () => {
        setStartError(null);
        // A workout saved before Android closed the app loads first — Start must not replace it.
        await hydrate();
        // LW-24: a workout already open is never a dead end: Resume it, or discard it and start this.
        if ((await askAboutOpenWorkout()) === 'resume') {
          openActiveWorkout(router);
          return;
        }
        await startFromPlanDay(r.id);
        openActiveWorkout(router);
      },
      () => setStartError({ id: r.id, message: START_FAILED }),
    );
  };

  const moveFolder = (f: Folder, dir: -1 | 1): void => {
    const order = movedFolderOrder(list, f.id, dir);
    if (!order) return;
    // Show the new order at once (the followed folder stays first); a failed save says so.
    const lead = list.filter((x) => x.following);
    const byId = new Map(list.map((x) => [x.id, x]));
    setFolders([...lead, ...order.flatMap((id) => (byId.has(id) ? [byId.get(id) as Folder] : []))]);
    reorderFolders(order).then(changed, failed('Could not save the new order'));
  };

  /** A new order for a folder's routines (Move up / down, or a drag): shown at once, then saved. */
  const reorderWithin = (f: Folder, order: string[]): void => {
    const byId = new Map(f.routines.map((x) => [x.id, x]));
    const routines = order.flatMap((id) => (byId.has(id) ? [byId.get(id) as RoutineFull] : []));
    if (routines.length !== f.routines.length) return;
    setFolders(list.map((x) => (x.id === f.id ? { ...x, routines } : x)));
    // RP-07: in the followed folder the order IS the rotation — Up next reads it again.
    reorderRoutines(order).then(changed, failed('Could not save the new order'));
  };

  const moveWithin = (f: Folder, r: RoutineFull, dir: -1 | 1): void => {
    const order = movedRoutineOrder(f.routines, r.id, dir);
    if (!order) return;
    const byId = new Map(f.routines.map((x) => [x.id, x]));
    const routines = order.flatMap((id) => (byId.has(id) ? [byId.get(id) as RoutineFull] : []));
    setFolders(list.map((x) => (x.id === f.id ? { ...x, routines } : x)));
    // RP-07: in the followed folder the order IS the rotation — Up next reads it again.
    reorderRoutines(order).then(changed, failed('Could not save the new order'));
  };

  const onFolderAction = (f: Folder, action: FolderAction): void => {
    switch (action) {
      case 'rename':
        after(() => setNaming({ mode: 'rename', folder: f }));
        return;
      case 'add':
        after(() => void onNewRoutine(f.id));
        return;
      case 'share':
        after(() => setSharing({ folder: f.name, routines: f.routines }));
        return;
      case 'moveUp':
      case 'moveDown':
        setFolderFor(null);
        moveFolder(f, action === 'moveUp' ? -1 : 1);
        return;
      case 'easy':
        after(() => setEasyFor(f));
        return;
      case 'follow':
        setFolderFor(null);
        setOpen(f.id, true);
        followFolder(f.id, todayISO()).then(changed, failed('Could not follow'));
        return;
      case 'unfollow':
        after(() => {
          void askConfirm({
            title: `Stop following '${f.name}'?`,
            body: 'Up next then comes from the routine you did last. Following it again starts its weeks from that day.',
            confirmLabel: 'Stop following',
          }).then((ok) => {
            if (ok) unfollowFolder(f.id).then(changed, failed('Could not save'));
          });
        });
        return;
      case 'delete':
        after(() => {
          const q = deleteFolderQuestion(f);
          void askConfirm({ title: q.title, body: q.body, confirmLabel: 'Delete', destructive: true }).then((ok) => {
            if (ok) deleteFolder(f.id).then(changed, failed('Delete failed'));
          });
        });
        return;
    }
  };

  const onRoutineAction = (f: Folder, r: RoutineFull, action: RoutineAction): void => {
    switch (action) {
      case 'share':
        after(() => setSharing({ folder: null, routines: [r] }));
        return;
      case 'duplicate':
        setRoutineFor(null);
        // RP-08: the copy stays in its folder — unless that is the followed plan, then it goes
        // to "My routines" so Up next's rotation never changes by itself.
        duplicateRoutine(r.id)
          .then(async (newId) => {
            const to = await folderOfRoutine(newId).catch(() => null);
            changed();
            if (to && to.id !== f.id) {
              setOpen(to.id, true);
              void tell('Copy saved', `"${r.name} (copy)" is in ${to.name}, so your plan stays as it is.`);
            }
          }, failed('Duplicate failed'));
        return;
      case 'edit':
        setRoutineFor(null);
        router.push(`/routines/${r.id}`);
        return;
      case 'moveUp':
      case 'moveDown':
        setRoutineFor(null);
        moveWithin(f, r, action === 'moveUp' ? -1 : 1);
        return;
      case 'moveTo':
        after(() => setMoveFor({ folder: f, routine: r }));
        return;
      case 'delete':
        after(() => {
          const q = deleteRoutineQuestion(r);
          void askConfirm({ title: q.title, body: q.body, confirmLabel: 'Delete', destructive: true }).then((ok) => {
            if (ok) deleteRoutine(r.id).then(changed, failed('Delete failed'));
          });
        });
        return;
    }
  };

  // ------------------------------------------------------------ view

  const buttons = (
    <View style={{ flexDirection: stack ? 'column' : 'row', gap: space.md }}>
      <TileButton half={!stack} label="New routine" icon="list" onPress={onNewRoutineButton} />
      <TileButton half={!stack} label="Explore" icon="search" a11y="Explore programs" onPress={() => router.push('/programs')} />
    </View>
  );

  const easyFolder = easyFor;
  const easyFollowed = easyFolder?.following === true;

  return (
    <View style={{ gap: space.lg }}>
      {!active ? <TileButton label="Start empty workout" icon="plus" onPress={onStartEmpty} /> : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginTop: space.xs }}>
        <Text accessibilityRole="header" style={{ flexShrink: 1, fontFamily: type.display, fontSize: type.size.h2, color: color.ink }}>
          Routines
        </Text>
        <Pressable
          onPress={() => {
            tap();
            setNaming({ mode: 'new' });
          }}
          accessibilityRole="button"
          accessibilityLabel="New folder"
          style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <FolderPlus />
        </Pressable>
      </View>

      {buttons}

      {folders == null && loadFailed ? (
        <LoadError what="your routines" onRetry={reload} />
      ) : folders == null ? (
        <View style={{ gap: space.md }}>
          <Skeleton width="100%" height={48} radius={radius.md} />
          <Skeleton width="100%" height={48} radius={radius.md} />
        </View>
      ) : folders.length === 0 ? (
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 19, color: color.inkSecondary }}>
          No routines yet. Make your own, or explore ready programs.
        </Text>
      ) : (
        <View style={{ gap: space.xs }}>
          {folders.map((f) => {
            const tag = folderTag(f, up);
            const open = isFolderOpen(saved, f, up, folders.length);
            return (
              <View key={f.id} style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                  <Pressable
                    onPress={() => {
                      tap();
                      setOpen(f.id, !open);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={folderA11y(f, open, tag)}
                    style={{ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                  >
                    <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
                      <Icon name="chevron-right" size={18} color={color.inkSecondary} />
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm }}>
                      <Text numberOfLines={2} style={{ flexShrink: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.inkSecondary }}>
                        {folderTitle(f)}
                      </Text>
                      {tag ? <Badge label={tag} tone="accent" /> : null}
                      {f.settings.fromGym ? (
                        <Text style={{ flexBasis: '100%', fontFamily: type.body, fontSize: type.size.caption, color: f.settings.fromGym.gone ? color.inkMuted : color.accentBright }}>
                          {fromGymLine(f.settings.fromGym)}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                  <MoreButton label={`More for ${f.name}`} onPress={() => setFolderFor(f)} />
                </View>
                {open ? (
                  f.routines.length === 0 ? (
                    <Pressable
                      onPress={() => void onNewRoutine(f.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add new routine to ${f.name}`}
                      style={({ pressed }) => ({
                        minHeight: 48,
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: color.borderStrong,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: space.sm,
                        opacity: pressed ? 0.7 : 1,
                        marginBottom: space.sm,
                      })}
                    >
                      <Icon name="plus" size={18} color={color.accent} />
                      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>Add new routine</Text>
                    </Pressable>
                  ) : (
                    <DragList
                      items={f.routines}
                      gap={space.md}
                      style={{ marginBottom: space.sm }}
                      onReorder={(ids) => reorderWithin(f, ids)}
                      renderItem={(r) => (
                        <RoutineCard
                          r={r}
                          tag={routineTag(r, up)}
                          error={startError?.id === r.id ? startError.message : null}
                          onOpen={() => router.push(`/routines/view/${r.id}`)}
                          onStart={() => onStartRoutine(r)}
                          onMore={() => setRoutineFor({ folder: f, routine: r })}
                          canDrag={f.routines.length > 1}
                        />
                      )}
                    />
                  )
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {/* a folder's ⋯ */}
      <TrackerSheet visible={folderFor != null} title={folderFor?.name ?? ''} subtitle={folderFor ? countWord(folderFor.routines.length, 'routine') : undefined} onClose={() => setFolderFor(null)}>
        {folderFor ? (
          <View style={{ gap: 2 }}>
            {folderMenu({ ...folderFor, easyOn: !!folderFor.settings.easy }, list).map((m) => (
              <SheetRow
                key={m.action}
                label={m.label}
                value={m.value}
                danger={m.danger}
                leading={<FolderMenuGlyph action={m.action} />}
                onPress={() => onFolderAction(folderFor, m.action)}
              />
            ))}
          </View>
        ) : null}
      </TrackerSheet>

      {/* a routine's ⋯ */}
      <TrackerSheet visible={routineFor != null} title={routineFor?.routine.name ?? ''} onClose={() => setRoutineFor(null)}>
        {routineFor ? (
          <View style={{ gap: 2 }}>
            {routineMenu(routineFor.folder, routineFor.routine.id, list).map((m) => (
              <SheetRow
                key={m.action}
                label={m.label}
                danger={m.danger}
                leading={<RoutineMenuGlyph action={m.action} />}
                onPress={() => onRoutineAction(routineFor.folder, routineFor.routine, m.action)}
              />
            ))}
          </View>
        ) : null}
      </TrackerSheet>

      {/* Easy weeks… (the folder menu's rows from before, unchanged) */}
      <TrackerSheet
        visible={easyFolder != null}
        title="Easy weeks"
        subtitle="Half the sets, the same weights. Kept out of your records."
        onClose={() => setEasyFor(null)}
      >
        {easyFolder ? (
          <View style={{ gap: 2 }}>
            <SheetRow
              label="Easy week every 6 weeks"
              value={easyFolder.settings.easy ? 'On' : 'Off'}
              leading={<Icon name="heart" size={18} color={color.accent} />}
              onPress={() => {
                const f = easyFolder;
                setEasyFor(null);
                setEasyWeeks(f, !f.settings.easy).then(changed, failed('Could not save'));
              }}
            />
            {easyFollowed && easyFolder.settings.easy && plan && !plan.easy ? (
              <SheetRow
                label="Take an easy week now"
                value="7 days from today"
                leading={<Icon name="heart" size={18} color={color.accent} />}
                onPress={() => {
                  const f = easyFolder;
                  setEasyFor(null);
                  moveEasyWeek(f, 'now').then(changed, failed('Could not save'));
                }}
              />
            ) : null}
            {easyFollowed && plan?.easy ? (
              <SheetRow
                label="Train normally this week"
                leading={<Icon name="dumbbell" size={18} color={color.accent} />}
                onPress={() => {
                  const f = easyFolder;
                  setEasyFor(null);
                  moveEasyWeek(f, 'skip').then(changed, failed('Could not save'));
                }}
              />
            ) : null}
          </View>
        ) : null}
      </TrackerSheet>

      {/* Move to folder… (stands in for dragging a routine into another folder) */}
      <TrackerSheet
        visible={moveFor != null}
        title="Move to folder"
        subtitle={moveFor?.routine.name}
        onClose={() => setMoveFor(null)}
      >
        {moveFor ? (
          <ScrollView style={{ maxHeight: 400 }} nestedScrollEnabled contentContainerStyle={{ gap: 2 }}>
            {moveTargets(list, moveFor.folder.id).map((t) => (
              <SheetRow
                key={t.id}
                label={t.name}
                value={t.following ? 'Your plan' : countWord(t.routines.length, 'routine')}
                leading={<Icon name={t.following ? 'check' : 'list'} size={18} color={color.accent} />}
                onPress={() => {
                  const r = moveFor.routine;
                  setMoveFor(null);
                  setOpen(t.id, true);
                  moveRoutine(r.id, t.id).then(changed, failed('Could not move'));
                }}
              />
            ))}
          </ScrollView>
        ) : null}
      </TrackerSheet>

      {/* New routine with 2+ folders (or one followed): which folder — RP-08 */}
      <FolderPickerSheet
        visible={picking}
        title="Where should the routine go?"
        folders={list}
        onClose={() => setPicking(false)}
        onPick={(folderId) => after(() => void onNewRoutine(folderId))}
      />

      <NameSheet
        visible={naming != null}
        title={naming?.mode === 'rename' ? 'Rename folder' : 'New folder'}
        initial={naming?.mode === 'rename' ? naming.folder.name : ''}
        placeholder="Folder name"
        action={naming?.mode === 'rename' ? 'Save name' : 'Create folder'}
        onClose={() => setNaming(null)}
        onSave={(name) => {
          const n = naming;
          setNaming(null);
          if (!n) return;
          const job = n.mode === 'rename' ? renameFolder(n.folder.id, name) : createFolder(name).then((id) => setOpen(id, true));
          job.then(changed, failed('Could not save'));
        }}
      />

      <ShareRoutineSheet visible={sharing != null} folder={sharing?.folder ?? null} routines={sharing?.routines ?? []} onClose={() => setSharing(null)} />
    </View>
  );
}

function FolderMenuGlyph({ action }: { action: FolderAction }) {
  const c = action === 'delete' ? color.criticalText : color.accent;
  switch (action) {
    case 'rename':
      return <Glyph name="pencil" size={18} color={c} />;
    case 'add':
      return <Icon name="plus" size={18} color={c} />;
    case 'share':
      return <Glyph name="share" size={18} color={c} />;
    case 'moveUp':
      return <Glyph name="chevron-up" size={18} color={c} />;
    case 'moveDown':
      return <Glyph name="chevron-down" size={18} color={c} />;
    case 'easy':
      return <Icon name="heart" size={18} color={c} />;
    case 'follow':
      return <Icon name="check" size={18} color={c} />;
    case 'unfollow':
      return <Icon name="close" size={18} color={c} />;
    case 'delete':
      return <Glyph name="trash" size={18} color={c} />;
  }
}

function RoutineMenuGlyph({ action }: { action: RoutineAction }) {
  const c = action === 'delete' ? color.criticalText : color.accent;
  switch (action) {
    case 'share':
      return <Glyph name="share" size={18} color={c} />;
    case 'duplicate':
      return <Glyph name="list" size={18} color={c} />;
    case 'edit':
      return <Glyph name="pencil" size={18} color={c} />;
    case 'moveUp':
      return <Glyph name="chevron-up" size={18} color={c} />;
    case 'moveDown':
      return <Glyph name="chevron-down" size={18} color={c} />;
    case 'moveTo':
      return <Glyph name="swap" size={18} color={c} />;
    case 'delete':
      return <Glyph name="trash" size={18} color={c} />;
  }
}
