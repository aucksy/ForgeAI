/**
 * Where a new routine goes — audit Phase 4 (RP-08). PURE.
 *
 * "+ New routine", "Save as routine" and "Duplicate" ask where the routine goes. The first
 * choice (the default) is "My routines", a folder the member does not follow; the followed plan
 * is offered last and says what it means ("Today will include it"). The plan only changes when
 * the member picks it.
 */
import { countWord } from '@/lib/words';

import { MY_ROUTINES, OTHER_ROUTINES } from '../db/folderRepo';

export interface FolderChoice {
  /** null = "My routines" (made when the member has none yet). */
  folderId: string | null;
  label: string;
  value: string;
  following: boolean;
}

/** The choices, in order: "My routines" first, the member's other folders, the followed plan last. */
export function folderChoices(folders: readonly { id: string; name: string; following: boolean; routines: readonly unknown[] }[]): FolderChoice[] {
  const named = (n: string) => (name: string) => name.trim().toLowerCase() === n.toLowerCase();
  const isMine = named(MY_ROUTINES);
  // 16 Oct 2026 audit (C3-30): when the followed plan is itself an older "My Routines", new
  // routines go to "Other routines" (`myRoutinesFolderIdUnqueued`): the choice says so.
  const label = folders.some((f) => f.following && isMine(f.name)) ? OTHER_ROUTINES : MY_ROUTINES;
  const mine = folders.find((f) => !f.following && isMine(f.name)) ?? folders.find((f) => !f.following && named(label)(f.name));
  const out: FolderChoice[] = [
    {
      folderId: mine?.id ?? null,
      label: mine?.name ?? label,
      value: mine ? `Not in your plan · ${countWord(mine.routines.length, 'routine')}` : 'Not in your plan',
      following: false,
    },
  ];
  for (const f of folders) {
    if (f.following || f.id === mine?.id) continue;
    out.push({ folderId: f.id, label: f.name, value: countWord(f.routines.length, 'routine'), following: false });
  }
  const plan = folders.find((f) => f.following);
  if (plan) out.push({ folderId: plan.id, label: plan.name, value: 'Your plan · Today will include it', following: true });
  return out;
}
