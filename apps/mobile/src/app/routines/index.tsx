/**
 * Routines — Phase 4: folders. The folder you FOLLOW is your plan ("Today" on the Workout
 * tab comes from it) and sits first, open; the others fold shut under their name and count.
 * A folder's menu follows it, turns easy weeks on or off, adds a routine, renames, shares or
 * deletes it. Ready programs and the plan builder start here too; "+" adds a routine, a
 * folder, or a routine file someone shared.
 *
 * Audit Phase 4: routines are compact rows with a small Start, as in Hevy (tap a row for a calm
 * preview); "Reorder" moves routines inside a folder and folders in the list (RP-07 — in the
 * followed folder the order IS the rotation); a new routine asks where it goes and never joins
 * the plan by itself (RP-08); the same file imported again offers to update its folder (RP-18).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Badge, EmptyState, GhostButton, Icon, IconButton, LoadError, Screen, Skeleton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import type { IconName } from '@/components/ui';
import { todayISO } from '@/lib/date';
import { START_FAILED, runGuarded } from '@/lib/guardedAction';
import { tap } from '@/lib/haptics';
import { countWord } from '@/lib/words';
import { color, radius, space, type } from '@/theme/tokens';

import { FolderPickerSheet } from '@/tracker/components/FolderPickerSheet';
import { NameSheet } from '@/tracker/components/NameSheet';
import { ShareRoutineSheet } from '@/tracker/components/ShareRoutineSheet';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { SheetRow, TrackerSheet } from '@/tracker/components/TrackerSheet';
import {
  createFolder,
  deleteFolder,
  followFolder,
  listFolders,
  reorderFolders,
  renameFolder,
  type Folder,
  type RoutineFull,
} from '@/tracker/db/folderRepo';
import { createRoutine, reorderRoutines } from '@/tracker/db/routineRepo';
import { dayTypeLabel } from '@/tracker/services/finishSummary';
import { deleteFolderMessage, getPlanNow, moveEasyWeek, planLine, setEasyWeeks, showNoRoutinesYet, type PlanNow } from '@/tracker/services/planState';
import type { ExistingChoice } from '@/tracker/services/plansService';
import { pickAndImportRoutineFile } from '@/tracker/services/routineShare';
import { askAboutOpenWorkout, showActiveWorkout } from '@/tracker/services/workoutStart';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

function EntryCard({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        flex: 1,
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.border,
        padding: space.md,
        gap: 6,
      }}
    >
      <Icon name={icon} size={20} color={color.accent} />
      <Text style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.ink }}>{title}</Text>
      <Text numberOfLines={2} style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
        {sub}
      </Text>
    </Pressable>
  );
}

/** Up / down for reorder mode — 48 dp targets (the icon set has no vertical chevron: rotate). */
function MoveButtons({ name, first, last, onMove }: { name: string; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void }) {
  const btn = (dir: -1 | 1, disabled: boolean) => (
    <Pressable
      onPress={() => {
        if (disabled) return;
        tap();
        onMove(dir);
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={`Move ${name} ${dir === -1 ? 'up' : 'down'}`}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ transform: [{ rotate: dir === -1 ? '-90deg' : '90deg' }] }}>
        <Icon name="chevron-right" size={20} color={disabled ? color.inkDisabled : color.accent} />
      </View>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', gap: space.xs }}>
      {btn(-1, first)}
      {btn(1, last)}
    </View>
  );
}

/** A compact routine row (Hevy style): name and facts, a small Start on the right. */
function RoutineRow({
  r,
  divider,
  reordering,
  first,
  last,
  onOpen,
  onStart,
  onMove,
  error,
}: {
  r: RoutineFull;
  divider: boolean;
  reordering: boolean;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onStart: () => void;
  onMove: (dir: -1 | 1) => void;
  error?: string | null;
}) {
  const facts = r.exercises.length > 0 ? `${countWord(r.exercises.length, 'exercise')} · ${dayTypeLabel(r.dayType)}` : 'No exercises yet';
  return (
    <View style={{ borderTopWidth: divider ? 1 : 0, borderTopColor: color.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 64, paddingLeft: space.md, paddingRight: space.sm }}>
        <Pressable
          onPress={reordering ? undefined : onOpen}
          disabled={reordering}
          accessibilityRole="button"
          accessibilityLabel={`${r.name}, ${facts}`}
          accessibilityHint="Shows the routine"
          style={{ flex: 1, minHeight: 56, justifyContent: 'center' }}
        >
          <Text numberOfLines={1} style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.ink }}>
            {r.name}
          </Text>
          <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
            {facts}
          </Text>
        </Pressable>
        {reordering ? (
          <MoveButtons name={r.name} first={first} last={last} onMove={onMove} />
        ) : r.exercises.length > 0 ? (
          <Pressable
            onPress={onStart}
            accessibilityRole="button"
            accessibilityLabel={`Start ${r.name}`}
            hitSlop={4}
            style={({ pressed }) => ({
              minHeight: 44,
              minWidth: 76,
              paddingHorizontal: space.md,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? color.accentSoft : color.surfaceRaised,
              borderWidth: 1,
              borderColor: color.accent,
            })}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>Start</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
          <InlineError message={error} />
        </View>
      ) : null}
    </View>
  );
}

/** Swap two neighbours in a list (pure helper for the reorder buttons). */
function moved<T>(list: readonly T[], index: number, dir: -1 | 1): T[] {
  const next = index + dir;
  if (next < 0 || next >= list.length) return [...list];
  const out = [...list];
  [out[index], out[next]] = [out[next], out[index]];
  return out;
}

export default function RoutinesScreen() {
  const router = useRouter();
  const hydrate = useActiveWorkout((s) => s.hydrate);
  const startFromPlanDay = useActiveWorkout((s) => s.startFromPlanDay);
  const starting = useRef(false);

  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [plan, setPlan] = useState<PlanNow | null>(null);
  // RP-13: a failed read shows "Couldn't load your routines — Try again", never "No routines yet"
  // (which invites rebuilding or re-importing them as duplicates).
  const [loadFailed, setLoadFailed] = useState(false);
  // RP-14: a failed Start says so and the button works again.
  const [startError, setStartError] = useState<{ dayId: string; message: string } | null>(null);
  /** Folders opened or shut by the member; the followed one starts open, the rest shut. */
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menuFor, setMenuFor] = useState<Folder | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [naming, setNaming] = useState<{ mode: 'new' } | { mode: 'rename'; folder: Folder } | null>(null);
  const [sharing, setSharing] = useState<Folder | null>(null);
  /** RP-07: reorder mode — up/down on routines and folders instead of Start. */
  const [reordering, setReordering] = useState(false);
  /** RP-08: where a new routine goes. */
  const [picking, setPicking] = useState(false);
  /** RP-18: the same file again — update its folder or add a copy. */
  const [existing, setExisting] = useState<{ name: string; resolve: (c: ExistingChoice | null) => void } | null>(null);

  const reload = useCallback(() => {
    let alive = true;
    Promise.all([listFolders(), getPlanNow().catch(() => null)])
      .then(([list, now]) => {
        if (!alive) return;
        setFolders(list);
        setPlan(now);
        setLoadFailed(false);
      })
      .catch(() => {
        // Keep folders already on screen; with none, the screen shows LoadError.
        if (alive) setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useFocusEffect(reload);

  const retryLoad = (): void => {
    setLoadFailed(false);
    setFolders(null);
    reload();
  };

  // Two RN Modals swapping in the same frame can drop the second on Android.
  const after = (fn: () => void): void => {
    setMenuFor(null);
    setAddMenu(false);
    setPicking(false);
    setTimeout(fn, 260);
  };

  const isOpen = (f: Folder): boolean => reordering || (open[f.id] ?? f.following);

  const onNewRoutine = async (folderId: string | null): Promise<void> => {
    try {
      // RP-08: no folder given → "My routines" (not followed), never the plan by itself.
      const id = await createRoutine({ name: 'New routine', dayType: 'full', folderId });
      router.push(`/routines/${id}`);
    } catch {
      Alert.alert('Could not create routine', 'Please try again.');
    }
  };

  const onStart = async (dayId: string): Promise<void> => {
    // A ref guard (not state) so a double tap can't start twice; released however it ends.
    await runGuarded(
      starting,
      async () => {
        setStartError(null);
        // Hydrate first: a persisted in-progress draft may exist but not be in memory yet
        // (it only loads on the Workout tab) — starting would overwrite it.
        await hydrate();
        // LW-24: a workout already open is never a dead end: Resume it, or discard it and start this.
        if ((await askAboutOpenWorkout()) === 'resume') {
          showActiveWorkout(router);
          return 'left' as const;
        }
        await startFromPlanDay(dayId);
        showActiveWorkout(router);
        return 'left' as const;
      },
      () => setStartError({ dayId, message: START_FAILED }),
    );
  };

  const onImport = async (): Promise<void> => {
    try {
      const res = await pickAndImportRoutineFile(
        (name) =>
          new Promise<ExistingChoice | null>((resolve) => {
            setExisting({ name, resolve });
          }),
      );
      if (!res) return;
      setOpen((o) => ({ ...o, [res.folderId]: true }));
      reload();
      const lines: string[] = [];
      if (res.added.length > 0) lines.push(`New in your library: ${res.added.join(', ')}.`);
      if (res.skipped.length > 0) lines.push(`Left out (no muscles in the file): ${res.skipped.join(', ')}.`);
      Alert.alert(
        res.updated ? 'Folder updated' : 'Routines added',
        lines.length > 0 ? lines.join('\n\n') : res.updated ? 'You had this file already, so its folder was updated.' : 'They are in a new folder.',
      );
    } catch (e) {
      Alert.alert('Could not open that file', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const answerExisting = (c: ExistingChoice | null): void => {
    const e = existing;
    setExisting(null);
    e?.resolve(c);
  };

  const confirmDelete = (f: Folder): void => {
    const n = f.routines.length;
    Alert.alert(
      `Delete ${f.name}?`,
      deleteFolderMessage(n, f.following),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void deleteFolder(f.id).then(reload).catch(() => Alert.alert('Delete failed', 'Please try again.')),
        },
      ],
    );
  };

  /** RP-07: move a routine inside its folder — saved at once; a failed save says so. */
  const onMoveRoutine = (f: Folder, index: number, dir: -1 | 1): void => {
    if (!folders) return;
    const routines = moved(f.routines, index, dir);
    setFolders(folders.map((x) => (x.id === f.id ? { ...x, routines } : x)));
    reorderRoutines(routines.map((r) => r.id)).catch(() => {
      Alert.alert('Could not save the new order', 'Please try again.');
      reload();
    });
  };

  /** RP-07: move a folder in the list (the followed one always stays first). */
  const onMoveFolder = (index: number, dir: -1 | 1): void => {
    if (!folders) return;
    const lead = folders.filter((f) => f.following);
    const rest = moved(folders.filter((f) => !f.following), index, dir);
    setFolders([...lead, ...rest]);
    reorderFolders(rest.map((f) => f.id)).catch(() => {
      Alert.alert('Could not save the new order', 'Please try again.');
      reload();
    });
  };

  const others = folders?.filter((f) => !f.following) ?? [];
  const canReorder = (folders ?? []).some((f) => f.routines.length > 1) || others.length > 1;

  return (
    <Screen
      title="Routines"
      subtitle={reordering ? 'Move routines and folders. Your plan goes in this order.' : 'Start any routine in a tap.'}
      right={
        reordering ? (
          <Pressable
            onPress={() => setReordering(false)}
            accessibilityRole="button"
            accessibilityLabel="Done reordering"
            style={{ minHeight: 48, minWidth: 64, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.accent }}>Done</Text>
          </Pressable>
        ) : (
          <IconButton icon="plus" onPress={() => setAddMenu(true)} accessibilityLabel="Add a routine, folder or file" />
        )
      }
    >
      {!reordering ? (
        <View style={{ flexDirection: 'row', gap: space.md, marginBottom: space.lg }}>
          <EntryCard icon="trophy" title="Ready programs" sub="Gym, dumbbells or home, beginner to advanced" onPress={() => router.push('/programs')} />
          <EntryCard icon="sparkle" title="Build a plan" sub="From your goal, days, equipment and sore spots" onPress={() => router.push('/plan/build')} />
        </View>
      ) : null}

      {folders == null && loadFailed ? (
        <LoadError what="your routines" onRetry={retryLoad} />
      ) : folders == null ? (
        <View style={{ gap: space.md }}>
          <Skeleton width="100%" height={92} radius={radius.lg} />
          <Skeleton width="100%" height={92} radius={radius.lg} />
        </View>
      ) : showNoRoutinesYet(folders) ? (
        <View style={{ gap: space.lg }}>
          <EmptyState icon="dumbbell" title="No routines yet" body="Follow a ready program, build a plan, or make your own routine." />
          <GhostButton label="New routine" icon="plus" onPress={() => void onNewRoutine(null)} />
        </View>
      ) : (
        <View style={{ gap: space.lg }}>
          {folders.map((f) => {
            const shown = isOpen(f);
            const line = f.following ? planLine(plan) : null;
            const otherIndex = others.findIndex((x) => x.id === f.id);
            return (
              <View key={f.id} style={{ gap: space.sm }}>
                {/* the heading is the fact and never folds: name, count, following */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Pressable
                    onPress={() => setOpen((o) => ({ ...o, [f.id]: !shown }))}
                    disabled={reordering}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: shown }}
                    accessibilityLabel={`${f.name}, ${countWord(f.routines.length, 'routine')}${f.following ? ', your plan' : ''}${line ? `, ${line}` : ''}`}
                    style={{ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                  >
                    {!reordering ? (
                      <View style={{ transform: [{ rotate: shown ? '90deg' : '0deg' }] }}>
                        <Icon name="chevron-right" size={18} color={color.inkMuted} />
                      </View>
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                        <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
                          {f.name}
                        </Text>
                        {f.following ? <Badge label="Your plan" tone="accent" /> : null}
                      </View>
                      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: line && plan?.easy ? color.accent : color.inkMuted }}>
                        {line ? `${countWord(f.routines.length, 'routine')} · ${line}` : countWord(f.routines.length, 'routine')}
                      </Text>
                    </View>
                  </Pressable>
                  {reordering ? (
                    otherIndex >= 0 && others.length > 1 ? (
                      <MoveButtons name={f.name} first={otherIndex === 0} last={otherIndex === others.length - 1} onMove={(dir) => onMoveFolder(otherIndex, dir)} />
                    ) : null
                  ) : (
                    <Pressable
                      onPress={() => setMenuFor(f)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`More for ${f.name}`}
                      style={{
                        width: 40,
                        height: 40,
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
                  )}
                </View>
                {f.following && reordering && f.routines.length > 1 ? (
                  <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>Today goes in this order.</Text>
                ) : null}
                {shown ? (
                  f.routines.length === 0 ? (
                    reordering ? null : <GhostButton label="Add a routine" icon="plus" onPress={() => void onNewRoutine(f.id)} />
                  ) : (
                    <View style={{ backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, overflow: 'hidden' }}>
                      {f.routines.map((r, i) => (
                        <RoutineRow
                          key={r.id}
                          r={r}
                          divider={i > 0}
                          reordering={reordering}
                          first={i === 0}
                          last={i === f.routines.length - 1}
                          onOpen={() => router.push(`/routines/view/${r.id}`)}
                          onStart={() => void onStart(r.id)}
                          onMove={(dir) => onMoveRoutine(f, i, dir)}
                          error={startError?.dayId === r.id ? startError.message : null}
                        />
                      ))}
                    </View>
                  )
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {/* "+": a routine (asks where — RP-08), a folder, or a shared file */}
      <TrackerSheet visible={addMenu} title="Add" onClose={() => setAddMenu(false)}>
        <SheetRow label="New routine" leading={<Icon name="dumbbell" size={18} color={color.accent} />} onPress={() => after(() => setPicking(true))} />
        <SheetRow label="New folder" leading={<Glyph name="list" size={18} color={color.accent} />} onPress={() => after(() => setNaming({ mode: 'new' }))} />
        <SheetRow label="Import a routine file" leading={<Glyph name="image" size={18} color={color.accent} />} onPress={() => after(() => void onImport())} />
        {/* v0.29.0: routines copied exactly from a Hevy share link */}
        <SheetRow label="Import routines from Hevy" leading={<Icon name="globe" size={18} color={color.accent} />} onPress={() => after(() => router.push('/import/routines'))} />
        {canReorder ? (
          <SheetRow label="Reorder routines and folders" leading={<Glyph name="list" size={18} color={color.accent} />} onPress={() => after(() => setReordering(true))} />
        ) : null}
      </TrackerSheet>

      <FolderPickerSheet
        visible={picking}
        title="Where should the routine go?"
        folders={folders ?? []}
        onClose={() => setPicking(false)}
        onPick={(folderId) => after(() => void onNewRoutine(folderId))}
      />

      {/* RP-18: this file was imported before */}
      <TrackerSheet
        visible={existing != null}
        title="You have this file already"
        subtitle={existing ? `It is in "${existing.name}".` : undefined}
        onClose={() => answerExisting(null)}
      >
        <SheetRow label="Update the existing folder" leading={<Icon name="check" size={18} color={color.accent} />} onPress={() => answerExisting('update')} />
        <SheetRow label="Add a copy" leading={<Icon name="plus" size={18} color={color.accent} />} onPress={() => answerExisting('copy')} />
      </TrackerSheet>

      {/* a folder's menu */}
      <TrackerSheet visible={menuFor != null} title={menuFor?.name ?? ''} onClose={() => setMenuFor(null)}>
        {menuFor ? (
          <View style={{ gap: 2 }}>
            {!menuFor.following ? (
              <SheetRow
                label="Follow this plan"
                value="Today's workout"
                leading={<Icon name="target" size={18} color={color.accent} />}
                onPress={() => {
                  const f = menuFor;
                  after(() => void followFolder(f.id, todayISO()).then(reload).catch(() => Alert.alert('Could not follow', 'Please try again.')));
                }}
              />
            ) : null}
            <SheetRow
              label="Easy week every 6 weeks"
              value={menuFor.settings.easy ? 'On' : 'Off'}
              leading={<Icon name="heart" size={18} color={color.accent} />}
              onPress={() => {
                const f = menuFor;
                after(() => void setEasyWeeks(f, !f.settings.easy).then(reload).catch(() => Alert.alert('Could not save', 'Please try again.')));
              }}
            />
            {menuFor.following && menuFor.settings.easy && plan && !plan.easy ? (
              <SheetRow
                label="Take an easy week now"
                value="7 days from today"
                leading={<Icon name="clock" size={18} color={color.accent} />}
                onPress={() => {
                  const f = menuFor;
                  after(() => void moveEasyWeek(f, 'now').then(reload).catch(() => Alert.alert('Could not save', 'Please try again.')));
                }}
              />
            ) : null}
            {menuFor.following && plan?.easy ? (
              <SheetRow
                label="Train normally this week"
                leading={<Icon name="flame" size={18} color={color.accent} />}
                onPress={() => {
                  const f = menuFor;
                  after(() => void moveEasyWeek(f, 'skip').then(reload).catch(() => Alert.alert('Could not save', 'Please try again.')));
                }}
              />
            ) : null}
            <SheetRow label="Add a routine here" leading={<Icon name="plus" size={18} color={color.accent} />} onPress={() => { const f = menuFor; after(() => void onNewRoutine(f.id)); }} />
            {menuFor.routines.length > 1 ? (
              <SheetRow label="Reorder routines" leading={<Glyph name="list" size={18} color={color.accent} />} onPress={() => after(() => setReordering(true))} />
            ) : null}
            <SheetRow label="Rename folder" leading={<Glyph name="pencil" size={18} color={color.accent} />} onPress={() => { const f = menuFor; after(() => setNaming({ mode: 'rename', folder: f })); }} />
            {menuFor.routines.length > 0 ? (
              <SheetRow label="Share folder" leading={<Icon name="send" size={18} color={color.accent} />} onPress={() => { const f = menuFor; after(() => setSharing(f)); }} />
            ) : null}
            <SheetRow label="Delete folder" danger leading={<Glyph name="trash" size={18} color={color.criticalText} />} onPress={() => { const f = menuFor; after(() => confirmDelete(f)); }} />
          </View>
        ) : null}
      </TrackerSheet>

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
          const job = n.mode === 'rename' ? renameFolder(n.folder.id, name) : createFolder(name).then((id) => setOpen((o) => ({ ...o, [id]: true })));
          void job.then(reload).catch(() => Alert.alert('Could not save', 'Please try again.'));
        }}
      />

      <ShareRoutineSheet visible={sharing != null} folder={sharing?.name ?? null} routines={sharing?.routines ?? []} onClose={() => setSharing(null)} />
    </Screen>
  );
}
