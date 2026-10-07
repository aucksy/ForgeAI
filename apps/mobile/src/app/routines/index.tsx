/**
 * Routines — Phase 4: folders. The folder you FOLLOW is your plan ("Today" on the Workout
 * tab comes from it) and sits first, open; the others fold shut under their name and count.
 * A folder's menu follows it, turns easy weeks on or off, adds a routine, renames, shares or
 * deletes it. Ready programs and the plan builder start here too; "+" adds a routine, a
 * folder, or a routine file someone shared.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Badge, EmptyState, GhostButton, Icon, IconButton, Screen, Skeleton } from '@/components/ui';
import type { IconName } from '@/components/ui';
import type { PlanDayFull } from '@/db/repos/planRepo';
import { todayISO } from '@/lib/date';
import { countWord } from '@/lib/words';
import { color, radius, space, type } from '@/theme/tokens';

import { NameSheet } from '@/tracker/components/NameSheet';
import { ShareRoutineSheet } from '@/tracker/components/ShareRoutineSheet';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { SheetRow, TrackerSheet } from '@/tracker/components/TrackerSheet';
import { createFolder, deleteFolder, followFolder, listFolders, renameFolder, type Folder } from '@/tracker/db/folderRepo';
import { createRoutine } from '@/tracker/db/routineRepo';
import { dayTypeLabel } from '@/tracker/services/finishSummary';
import { deleteFolderMessage, getPlanNow, moveEasyWeek, planLine, setEasyWeeks, showNoRoutinesYet, type PlanNow } from '@/tracker/services/planState';
import { pickAndImportRoutineFile } from '@/tracker/services/routineShare';
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

function RoutineCard({ r, onOpen, onStart }: { r: PlanDayFull; onOpen: () => void; onStart: () => void }) {
  return (
    <Pressable
      onPress={onOpen}
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.border,
        padding: space.lg,
        gap: space.md,
      }}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${r.name}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
            {r.name}
          </Text>
          <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Badge label={dayTypeLabel(r.dayType)} tone="accent" />
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
              {countWord(r.exercises.length, 'exercise')}
            </Text>
          </View>
        </View>
        <Icon name="chevron-right" size={20} color={color.inkMuted} />
      </View>
      {r.exercises.length > 0 ? (
        <GhostButton label="Start routine" icon="dumbbell" onPress={onStart} />
      ) : (
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
          Add exercises to start this routine.
        </Text>
      )}
    </Pressable>
  );
}

export default function RoutinesScreen() {
  const router = useRouter();
  const hydrate = useActiveWorkout((s) => s.hydrate);
  const startFromPlanDay = useActiveWorkout((s) => s.startFromPlanDay);
  const starting = useRef(false);

  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [plan, setPlan] = useState<PlanNow | null>(null);
  /** Folders opened or shut by the member; the followed one starts open, the rest shut. */
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menuFor, setMenuFor] = useState<Folder | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [naming, setNaming] = useState<{ mode: 'new' } | { mode: 'rename'; folder: Folder } | null>(null);
  const [sharing, setSharing] = useState<Folder | null>(null);

  const reload = useCallback(() => {
    let alive = true;
    Promise.all([listFolders(), getPlanNow().catch(() => null)])
      .then(([list, now]) => {
        if (!alive) return;
        setFolders(list);
        setPlan(now);
      })
      .catch(() => {
        if (alive) setFolders([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useFocusEffect(reload);

  // Two RN Modals swapping in the same frame can drop the second on Android.
  const after = (fn: () => void): void => {
    setMenuFor(null);
    setAddMenu(false);
    setTimeout(fn, 260);
  };

  const isOpen = (f: Folder): boolean => open[f.id] ?? f.following;

  const onNewRoutine = async (folderId: string | null): Promise<void> => {
    try {
      const id = await createRoutine({ name: 'New routine', dayType: 'full', folderId });
      router.push(`/routines/${id}`);
    } catch {
      Alert.alert('Could not create routine', 'Please try again.');
    }
  };

  const onStart = async (dayId: string): Promise<void> => {
    if (starting.current) return;
    starting.current = true;
    // Hydrate first: a persisted in-progress draft may exist but not be in memory yet
    // (it only loads on the Workout tab) — starting would overwrite it.
    await hydrate();
    if (useActiveWorkout.getState().active) {
      starting.current = false;
      Alert.alert('Finish your current workout first', 'You already have a workout in progress.');
      return;
    }
    try {
      await startFromPlanDay(dayId);
      router.replace('/session/active');
    } finally {
      starting.current = false;
    }
  };

  const onImport = async (): Promise<void> => {
    try {
      const res = await pickAndImportRoutineFile();
      if (!res) return;
      setOpen((o) => ({ ...o, [res.folderId]: true }));
      reload();
      const lines: string[] = [];
      if (res.added.length > 0) lines.push(`New in your library: ${res.added.join(', ')}.`);
      if (res.skipped.length > 0) lines.push(`Left out (no muscles in the file): ${res.skipped.join(', ')}.`);
      Alert.alert('Routines added', lines.length > 0 ? lines.join('\n\n') : 'They are in a new folder.');
    } catch (e) {
      Alert.alert('Could not open that file', e instanceof Error ? e.message : 'Please try again.');
    }
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

  const followedId = folders?.find((f) => f.following)?.id ?? null;

  return (
    <Screen
      title="Routines"
      subtitle="Start any routine in a tap."
      right={<IconButton icon="plus" onPress={() => setAddMenu(true)} accessibilityLabel="Add a routine, folder or file" />}
    >
      <View style={{ flexDirection: 'row', gap: space.md, marginBottom: space.lg }}>
        <EntryCard icon="trophy" title="Ready programs" sub="Gym, dumbbells or home, beginner to advanced" onPress={() => router.push('/programs')} />
        <EntryCard icon="sparkle" title="Build a plan" sub="From your goal, days, equipment and sore spots" onPress={() => router.push('/plan/build')} />
      </View>

      {folders == null ? (
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
            return (
              <View key={f.id} style={{ gap: space.md }}>
                {/* the heading is the fact and never folds: name, count, following */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Pressable
                    onPress={() => setOpen((o) => ({ ...o, [f.id]: !shown }))}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: shown }}
                    accessibilityLabel={`${f.name}, ${countWord(f.routines.length, 'routine')}${f.following ? ', your plan' : ''}${line ? `, ${line}` : ''}`}
                    style={{ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                  >
                    <View style={{ transform: [{ rotate: shown ? '90deg' : '0deg' }] }}>
                      <Icon name="chevron-right" size={18} color={color.inkMuted} />
                    </View>
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
                </View>
                {shown ? (
                  f.routines.length === 0 ? (
                    <GhostButton label="Add a routine" icon="plus" onPress={() => void onNewRoutine(f.id)} />
                  ) : (
                    f.routines.map((r) => (
                      <RoutineCard key={r.id} r={r} onOpen={() => router.push(`/routines/${r.id}`)} onStart={() => void onStart(r.id)} />
                    ))
                  )
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {/* "+": a routine (into your plan), a folder, or a shared file */}
      <TrackerSheet visible={addMenu} title="Add" onClose={() => setAddMenu(false)}>
        <SheetRow label="New routine" leading={<Icon name="dumbbell" size={18} color={color.accent} />} onPress={() => after(() => void onNewRoutine(followedId))} />
        <SheetRow label="New folder" leading={<Glyph name="list" size={18} color={color.accent} />} onPress={() => after(() => setNaming({ mode: 'new' }))} />
        <SheetRow label="Import a routine file" leading={<Glyph name="image" size={18} color={color.accent} />} onPress={() => after(() => void onImport())} />
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
                after(() => void setEasyWeeks(f, !f.settings.easy).then(reload).catch(() => undefined));
              }}
            />
            {menuFor.following && menuFor.settings.easy && plan && !plan.easy ? (
              <SheetRow
                label="Take an easy week now"
                leading={<Icon name="clock" size={18} color={color.accent} />}
                onPress={() => {
                  const f = menuFor;
                  after(() => void moveEasyWeek(f, 'now').then(reload).catch(() => undefined));
                }}
              />
            ) : null}
            {menuFor.following && plan?.easy ? (
              <SheetRow
                label="Train normally this week"
                leading={<Icon name="flame" size={18} color={color.accent} />}
                onPress={() => {
                  const f = menuFor;
                  after(() => void moveEasyWeek(f, 'skip').then(reload).catch(() => undefined));
                }}
              />
            ) : null}
            <SheetRow label="Add a routine here" leading={<Icon name="plus" size={18} color={color.accent} />} onPress={() => { const f = menuFor; after(() => void onNewRoutine(f.id)); }} />
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
