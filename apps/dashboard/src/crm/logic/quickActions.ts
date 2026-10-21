/**
 * Quick action buttons at the top of Today (owner backlog, Planned; built 21 Oct 2026): big icon
 * buttons for the desk's most common jobs, which the owner picks and puts in order. Each button is a
 * link to a page that already does the job (two open their "add" form straight away). The choice is
 * kept in this browser per gym; a person only sees buttons for pages they may open. PURE.
 */
import type { IconName } from '../ui/icons';

export type QuickActionId = 'new-member' | 'dues' | 'check-in' | 'shop' | 'new-enquiry' | 'expense' | 'invite' | 'workouts';

export interface QuickAction {
  id: QuickActionId;
  label: string;
  path: string;
  icon: IconName;
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: 'new-member', label: 'New member', path: '/members/new', icon: 'members' },
  { id: 'dues', label: 'Collect dues', path: '/money/dues', icon: 'money' },
  { id: 'check-in', label: 'Check in', path: '/attendance', icon: 'visits' },
  { id: 'shop', label: 'Shop orders', path: '/shop', icon: 'shop' },
  { id: 'new-enquiry', label: 'New enquiry', path: '/enquiries/new', icon: 'today' },
  { id: 'expense', label: 'Add expense', path: '/expenses', icon: 'money' },
  { id: 'invite', label: 'Invite poster', path: '/settings/invite', icon: 'more' },
  { id: 'workouts', label: 'Workout plans', path: '/workouts', icon: 'workouts' },
];

export const DEFAULT_QUICK: readonly QuickActionId[] = ['new-member', 'dues', 'check-in', 'shop'];
export const MAX_QUICK = 6;

const byId = new Map(QUICK_ACTIONS.map((a) => [a.id, a]));

/** A saved list made safe: known ids only, no repeats, at most 6; nothing saved = the default. */
export function normalizeQuick(saved: unknown): QuickActionId[] {
  if (!Array.isArray(saved)) return [...DEFAULT_QUICK];
  const out: QuickActionId[] = [];
  for (const id of saved) {
    if (typeof id === 'string' && byId.has(id as QuickActionId) && !out.includes(id as QuickActionId)) out.push(id as QuickActionId);
    if (out.length === MAX_QUICK) break;
  }
  return out;
}

/** The buttons to draw, in order, leaving out pages this person may not open. */
export function quickButtons(ids: readonly QuickActionId[], mayOpen: (path: string) => boolean): QuickAction[] {
  return ids.map((id) => byId.get(id)).filter((a): a is QuickAction => Boolean(a) && mayOpen(a!.path));
}

/** Turn a button on (added at the end, while there is room) or off. */
export function toggleQuick(ids: readonly QuickActionId[], id: QuickActionId): QuickActionId[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return ids.length >= MAX_QUICK ? [...ids] : [...ids, id];
}

/** Move a button one place earlier (-1) or later (+1). */
export function moveQuick(ids: readonly QuickActionId[], id: QuickActionId, dir: -1 | 1): QuickActionId[] {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return [...ids];
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
