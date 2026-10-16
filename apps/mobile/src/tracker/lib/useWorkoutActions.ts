/**
 * The actions on one saved workout — Repeat, Edit, Save as routine, Delete — shared by the
 * workout page (`app/session/[id].tsx`) and the Profile's Workouts feed (redesign R2: a card's ⋯
 * offers the same list as the page, so the two can never differ). Moved here unchanged from
 * the workout page.
 */
import { useRef, useState } from 'react';

import { askConfirm } from '@/components/ui';
import { EDIT_FAILED, SAVE_ROUTINE_FAILED, START_FAILED, runGuarded } from '@/lib/guardedAction';
import { dateWithYear } from '@/lib/date';
import { tell } from '@/lib/tell';
import { useDashboard } from '@/store/dashboardStore';

import { listFolders, type Folder } from '../db/folderRepo';
import { createRoutineFromWorkout } from '../db/routineRepo';
import { getSessionSetMeta } from '../db/trackerSets';
import { uneditableReason } from '../services/editDraft';
import type { SessionSummaryData } from '../services/finishSummary';
import { sessionTitle } from '../services/finishSummary';
import { deleteWorkout } from '../services/workoutDelete';
import { askAboutOpenWorkout, showActiveWorkout } from '../services/workoutStart';
import { useActiveWorkout } from '../store/activeWorkoutStore';

type Nav = Parameters<typeof showActiveWorkout>[0] & { push: (href: { pathname: '/routines/[id]'; params: { id: string } }) => void };

export interface WorkoutActions {
  /** A failed action, said under the buttons (HI-13 / LW-20); null = none. */
  actionError: string | null;
  setActionError: (e: string | null) => void;
  onRepeat: (data: SessionSummaryData) => Promise<unknown>;
  onEdit: (data: SessionSummaryData) => Promise<unknown>;
  /** RP-08: "Save as routine" first asks where it goes; the folders to offer, or null. */
  pickFolders: Folder[] | null;
  askSaveRoutine: () => void;
  closeFolders: () => void;
  onSaveRoutine: (data: SessionSummaryData, folderId: string | null, choices: readonly Folder[]) => Promise<unknown>;
  /** Asks first. `after` runs once the workout is really gone. */
  onDelete: (sessionId: string, after: () => void) => Promise<void>;
}

/**
 * `show` opens the workout screen after a Repeat / Edit. The workout page replaces itself with it
 * (`showActiveWorkout`, the default); a tab (the Profile feed) pushes it on top instead, so the
 * tabs stay underneath.
 */
export function useWorkoutActions(router: Nav, show?: () => void): WorkoutActions {
  const open = (): void => {
    if (show) show();
    else showActiveWorkout(router);
  };
  const startFromSession = useActiveWorkout((s) => s.startFromSession);
  const startEditingSession = useActiveWorkout((s) => s.startEditingSession);
  const hydrate = useActiveWorkout((s) => s.hydrate);
  // ONE guard for every action: they share the single draft slot, so a fast
  // Edit-then-Repeat could otherwise start both before either sets `active`.
  const busy = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pickFolders, setPickFolders] = useState<Folder[] | null>(null);

  const onRepeat = (data: SessionSummaryData): Promise<unknown> =>
    runGuarded(
      busy,
      async () => {
        setActionError(null);
        // Hydrate first: a persisted in-progress draft may exist but not yet be in memory
        // (it only loads on the Workout tab), and startFromSession would overwrite it.
        await hydrate();
        // LW-24: a workout already open is never a dead end: Resume it, or discard it and start this.
        if ((await askAboutOpenWorkout()) === 'resume') {
          open();
          return 'left' as const;
        }
        await startFromSession(data.session);
        open();
        return 'left' as const;
      },
      () => setActionError(START_FAILED),
    );

  const onEdit = (data: SessionSummaryData): Promise<unknown> =>
    runGuarded(
      busy,
      async () => {
        setActionError(null);
        // Same guard as Repeat: a persisted in-progress draft only loads on the Workout
        // tab, so hydrate first or editing would silently overwrite it.
        await hydrate();
        // LW-24: Resume the open workout, or discard it and edit this one.
        if ((await askAboutOpenWorkout({ startLabel: 'Discard it and edit this one' })) === 'resume') {
          open();
          return 'left' as const;
        }
        // Saving REPLACES every set, so refuse the cases the editor cannot represent
        // faithfully rather than quietly merging them away.
        const blocked = uneditableReason(data.session, await getSessionSetMeta(data.session.id));
        if (blocked) {
          void tell("Can't edit this one", blocked);
          return;
        }
        await startEditingSession(data.session);
        open();
        return 'left' as const;
      },
      () => setActionError(EDIT_FAILED),
    );

  const askSaveRoutine = (): void => {
    setActionError(null);
    listFolders()
      .then(setPickFolders)
      .catch(() => setActionError(SAVE_ROUTINE_FAILED));
  };

  const onSaveRoutine = (data: SessionSummaryData, folderId: string | null, choices: readonly Folder[]): Promise<unknown> =>
    runGuarded(
      busy,
      async () => {
        setActionError(null);
        const into = folderId ? choices.find((f) => f.id === folderId) ?? null : null;
        const s = data.session;
        const items = s.exercises.map((g) => ({
          exerciseId: g.exercise.id,
          workingSets: g.sets.filter((x) => !x.isWarmup).length,
        }));
        const routineId = await createRoutineFromWorkout({
          name: s.title?.trim() ? s.title.trim() : `${sessionTitle(s)} · ${dateWithYear(s.dateISO)}`,
          dayType: s.dayType === 'rest' ? 'full' : s.dayType,
          items,
          folderId,
        });
        void askConfirm({
          title: 'Saved as a routine',
          body: into?.following
            ? `It is in ${into.name}, your plan — Today will include it.`
            : `It is in ${into?.name ?? 'My routines'}. Your plan has not changed.`,
          confirmLabel: 'Open routine',
          cancelLabel: 'Done',
        }).then((open) => {
          if (open) router.push({ pathname: '/routines/[id]', params: { id: routineId } });
        });
      },
      () => setActionError(SAVE_ROUTINE_FAILED),
    );

  // HI-12: "failed" only when the workout is really still there. The records, Health Connect
  // and the widgets catch up on their own; they never turn a done delete into "failed".
  const onDelete = async (sessionId: string, after: () => void): Promise<void> => {
    const ok = await askConfirm({
      title: 'Delete this workout?',
      body: 'This removes the workout and its sets.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setActionError(null);
    const outcome = await deleteWorkout(sessionId);
    if (!outcome.deleted) {
      setActionError('Could not delete this workout. It is still here. Please try again.');
      return;
    }
    void useDashboard.getState().refresh().catch(() => undefined);
    after();
  };

  return {
    actionError,
    setActionError,
    onRepeat,
    onEdit,
    pickFolders,
    askSaveRoutine,
    closeFolders: () => setPickFolders(null),
    onSaveRoutine,
    onDelete,
  };
}
