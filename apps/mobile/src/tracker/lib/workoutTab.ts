/**
 * Redesign R4 — the Workout tab's routines, in Hevy's layout (PLAN §2 items 3–8). PURE.
 *
 * Under the Up next card: "+ Start empty workout", the "Routines" heading with a new-folder
 * button, "New routine" and "Explore", then every folder inline ("▸ Push Pull Legs (6)" + ⋯)
 * with its routine cards (title, a grey line of exercises, ⋯, "Start routine").
 *
 * The rules here are the ones a test can hold:
 *  - which folder is open (the member's own choice, remembered; else the folder that drives Up
 *    next, or the only folder);
 *  - the small tags: "Following" on the followed folder, "Up next" on the folder Up next comes
 *    from otherwise, "Next" on the routine Up next names. They read the ONE Up next answer and
 *    add no rule of their own;
 *  - what each ⋯ menu offers, and the moves (the followed folder always stays first, as the
 *    folder list has always shown it);
 *  - where "New routine" goes (RP-08: never into the followed plan without asking);
 *  - the words of the two delete questions.
 *
 * Drag to reorder is not built: "Move up", "Move down" and "Move to folder…" in the routine's
 * ⋯ do the same job with 48 dp targets that work with TalkBack and at 200 % text.
 */
import { countWord } from '@/lib/words';

export interface RoutineLite {
  id: string;
  name: string;
  exercises: readonly { exercise: { name: string } }[];
}

export interface FolderLite {
  id: string;
  name: string;
  following: boolean;
  routines: readonly RoutineLite[];
}

/** What the tags read from the Up next answer. */
export interface UpNextRef {
  /** The folder Up next comes from (followed, or the folder of the routine done last), or null. */
  folderId: string | null;
  /** The routine Up next names ('next' and 'doneToday'), or null. */
  nextId: string | null;
}

// ---------------------------------------------------------------- words

/** "Push Pull Legs (6)". */
export function folderTitle(f: Pick<FolderLite, 'name' | 'routines'>): string {
  return `${f.name} (${f.routines.length})`;
}

/** The grey line under a routine's name: its exercises in order, or "No exercises yet". */
export function exerciseLine(r: Pick<RoutineLite, 'exercises'>): string {
  if (r.exercises.length === 0) return 'No exercises yet';
  return r.exercises.map((e) => e.exercise.name).join(', ');
}

export type FolderTag = 'Following' | 'Up next';

/** The small tag beside a folder's name: the followed folder, or where Up next comes from. */
export function folderTag(f: Pick<FolderLite, 'id' | 'following'>, up: UpNextRef): FolderTag | null {
  if (f.following) return 'Following';
  return up.folderId != null && f.id === up.folderId ? 'Up next' : null;
}

/** "Next" on the routine Up next names; null on every other. */
export function routineTag(r: Pick<RoutineLite, 'id'>, up: UpNextRef): 'Next' | null {
  return up.nextId != null && r.id === up.nextId ? 'Next' : null;
}

/** What a screen reader says for a folder row: "Push Pull Legs folder, 6 routines, open, Following". */
export function folderA11y(f: Pick<FolderLite, 'name' | 'routines'>, open: boolean, tag: FolderTag | null): string {
  return [`${f.name} folder`, countWord(f.routines.length, 'routine'), open ? 'open' : 'shut', tag].filter((x): x is string => !!x).join(', ');
}

/** What a screen reader says for a routine card: "Pull 1, next, Lat Pulldown, Seated Row". */
export function routineA11y(r: RoutineLite, tag: 'Next' | null): string {
  return [r.name, tag ? 'next' : null, exerciseLine(r)].filter((x): x is string => !!x).join(', ');
}

// ---------------------------------------------------------------- open / shut

/** At most this many remembered folders (deleted folders' entries are dropped as they go). */
export const OPEN_MAP_MAX = 300;

/** A stored open/shut map, cleaned: only true/false values, never more than OPEN_MAP_MAX. */
export function cleanOpenMap(v: unknown): Record<string, boolean> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, boolean> = {};
  let n = 0;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (typeof x !== 'boolean' || k.length === 0 || k.length > 64) continue;
    out[k] = x;
    n += 1;
    if (n >= OPEN_MAP_MAX) break;
  }
  return out;
}

/**
 * Is this folder open? The member's own choice wins (remembered). Before they ever chose: the
 * folder Up next comes from (or the followed one) is open, and so is a lone folder; the rest
 * are shut, as in Hevy.
 */
export function isFolderOpen(saved: Readonly<Record<string, boolean>>, f: Pick<FolderLite, 'id' | 'following'>, up: UpNextRef, folderCount: number): boolean {
  const mine = saved[f.id];
  if (typeof mine === 'boolean') return mine;
  return f.following || (up.folderId != null && f.id === up.folderId) || folderCount === 1;
}

/** The remembered map without folders that no longer exist. */
export function prunedOpenMap(saved: Readonly<Record<string, boolean>>, folderIds: readonly string[]): Record<string, boolean> {
  const keep = new Set(folderIds);
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(saved)) if (keep.has(k)) out[k] = v;
  return out;
}

// ---------------------------------------------------------------- moves

/** Swap a neighbour; null when it cannot move that way. */
function swapped<T>(list: readonly T[], index: number, dir: -1 | 1): T[] | null {
  const next = index + dir;
  if (index < 0 || next < 0 || next >= list.length) return null;
  const out = [...list];
  [out[index], out[next]] = [out[next], out[index]];
  return out;
}

/**
 * RP-07: the new order of the folders after moving one up or down — the ids of the folders the
 * member does NOT follow, top to bottom (what `reorderFolders` saves). The followed folder
 * always stays first and does not move. null = it cannot move that way.
 */
export function movedFolderOrder(folders: readonly Pick<FolderLite, 'id' | 'following'>[], id: string, dir: -1 | 1): string[] | null {
  const rest = folders.filter((f) => !f.following);
  const out = swapped(rest, rest.findIndex((f) => f.id === id), dir);
  return out ? out.map((f) => f.id) : null;
}

/** The order of a folder's routines after moving one up or down (ids); null = it cannot. */
export function movedRoutineOrder(routines: readonly Pick<RoutineLite, 'id'>[], id: string, dir: -1 | 1): string[] | null {
  const out = swapped(routines, routines.findIndex((r) => r.id === id), dir);
  return out ? out.map((r) => r.id) : null;
}

/** The folders a routine can move to: every other folder, in the list's order. */
export function moveTargets<F extends Pick<FolderLite, 'id'>>(folders: readonly F[], fromFolderId: string): F[] {
  return folders.filter((f) => f.id !== fromFolderId);
}

// ---------------------------------------------------------------- new routine

export type NewRoutineTarget = { kind: 'ask' } | { kind: 'folder'; folderId: string | null };

/**
 * Where "New routine" goes (Hevy asks which folder when there are 2+). RP-08 still holds: a new
 * routine never joins the followed plan by itself, so a lone folder that is followed asks too
 * (the picker offers "My routines" first). No folder at all → "My routines" (made then).
 */
export function newRoutineTarget(folders: readonly Pick<FolderLite, 'id' | 'following'>[]): NewRoutineTarget {
  if (folders.length === 0) return { kind: 'folder', folderId: null };
  if (folders.length === 1 && !folders[0].following) return { kind: 'folder', folderId: folders[0].id };
  return { kind: 'ask' };
}

// ---------------------------------------------------------------- menus

export interface MenuItem<A extends string> {
  action: A;
  label: string;
  value?: string;
  danger?: boolean;
}

export type FolderAction = 'rename' | 'add' | 'share' | 'moveUp' | 'moveDown' | 'easy' | 'follow' | 'unfollow' | 'delete';

/** A folder's ⋯ menu, in Hevy's order, with ForgeAI's own plan rows before Delete. */
export function folderMenu(
  f: FolderLite & { easyOn: boolean },
  folders: readonly Pick<FolderLite, 'id' | 'following'>[],
): MenuItem<FolderAction>[] {
  const out: MenuItem<FolderAction>[] = [
    { action: 'rename', label: 'Rename folder' },
    { action: 'add', label: 'Add new routine' },
  ];
  if (f.routines.length > 0) out.push({ action: 'share', label: 'Share folder' });
  if (movedFolderOrder(folders, f.id, -1)) out.push({ action: 'moveUp', label: 'Move folder up' });
  if (movedFolderOrder(folders, f.id, 1)) out.push({ action: 'moveDown', label: 'Move folder down' });
  out.push({ action: 'easy', label: 'Easy weeks…', value: f.easyOn ? 'On' : 'Off' });
  out.push(f.following ? { action: 'unfollow', label: 'Stop following' } : { action: 'follow', label: 'Follow this plan' });
  out.push({ action: 'delete', label: 'Delete folder', danger: true });
  return out;
}

export type RoutineAction = 'share' | 'duplicate' | 'edit' | 'moveUp' | 'moveDown' | 'moveTo' | 'delete';

/** A routine's ⋯ menu: Hevy's four, plus the moves that stand in for drag. */
export function routineMenu(
  folder: Pick<FolderLite, 'id' | 'routines'>,
  routineId: string,
  folders: readonly Pick<FolderLite, 'id'>[],
): MenuItem<RoutineAction>[] {
  const out: MenuItem<RoutineAction>[] = [
    { action: 'share', label: 'Share routine' },
    { action: 'duplicate', label: 'Duplicate routine' },
    { action: 'edit', label: 'Edit routine' },
  ];
  if (movedRoutineOrder(folder.routines, routineId, -1)) out.push({ action: 'moveUp', label: 'Move up' });
  if (movedRoutineOrder(folder.routines, routineId, 1)) out.push({ action: 'moveDown', label: 'Move down' });
  if (moveTargets(folders, folder.id).length > 0) out.push({ action: 'moveTo', label: 'Move to folder…' });
  out.push({ action: 'delete', label: 'Delete routine', danger: true });
  return out;
}

// ---------------------------------------------------------------- questions

/** Hevy's words for deleting a folder, plus what happens to its routines. */
export function deleteFolderQuestion(f: Pick<FolderLite, 'name' | 'following' | 'routines'>): { title: string; body: string } {
  const n = f.routines.length;
  const gone = n === 0 ? 'It has no routines.' : n === 1 ? 'Its routine goes too.' : `Its ${n} routines go too.`;
  return {
    title: `Delete '${f.name}' folder?`,
    body: `It'll be gone forever. ${gone} Your workout history stays.${f.following ? ' You stop following this plan.' : ''}`,
  };
}

export function deleteRoutineQuestion(r: Pick<RoutineLite, 'name'>): { title: string; body: string } {
  return {
    title: `Delete '${r.name}'?`,
    body: 'The routine and its exercise list go. Your workout history stays.',
  };
}
