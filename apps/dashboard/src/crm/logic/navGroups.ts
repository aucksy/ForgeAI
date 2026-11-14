/**
 * R-526 (owner, 14 Nov 2026): "reassess the different options now we have on the left hand side bar and see if you
 * can better reorganize them so they are not intimidating and easier to integrate and group properly". About 25 loose
 * menu rows became a short top (Today, Set up your gym while steps are left, AI Assistant, All branches) and five
 * small groups. The side menu, the phone's More page and their headings all come from here, so they never drift. PURE.
 *
 * A group can be folded with a tap on its heading (the side menu only); what is folded is kept in this browser (a
 * convenience: losing it only opens the groups again). A folded group shows the sum of its rows' numbers.
 */

export type NavGroupId = 'members' | 'money' | 'training' | 'reach' | 'gym';

/** The groups, in menu order, with their headings (English; drawn through t()). */
export const NAV_GROUPS: readonly { id: NavGroupId; title: string }[] = [
  { id: 'members', title: 'Members' },
  { id: 'money', title: 'Money' },
  { id: 'training', title: 'Training' },
  { id: 'reach', title: 'Reach members' },
  { id: 'gym', title: 'Your gym' },
];

export interface NavSection<T> {
  /** null: the top rows, under no heading. */
  group: NavGroupId | null;
  title: string | null;
  items: T[];
}

/**
 * The rows in sections: the top rows (no group) first, then each group in NAV_GROUPS order. Rows keep the order
 * they were given in; a group with no rows (everything in it hidden for this person) is left out. PURE.
 */
export function navSections<T extends { group?: NavGroupId }>(items: readonly T[]): NavSection<T>[] {
  const top = items.filter((i) => !i.group);
  const out: NavSection<T>[] = top.length ? [{ group: null, title: null, items: top }] : [];
  for (const g of NAV_GROUPS) {
    const inGroup = items.filter((i) => i.group === g.id);
    if (inGroup.length) out.push({ group: g.id, title: g.title, items: inGroup });
  }
  return out;
}

/** The number a folded group shows: the sum of its rows' numbers (0: none). PURE. */
export function sectionBadge(items: readonly { badge?: number }[]): number {
  return items.reduce((sum, i) => sum + (i.badge ?? 0), 0);
}

/** Set-up steps done of all, for the "Set up your gym" mark. */
export interface SetupProgress {
  done: number;
  total: number;
}

/** "3/8" beside the ring (short, for the side menu). PURE. */
export function progressShort(p: SetupProgress): string {
  return `${p.done}/${p.total}`;
}

/** The ring's filled part, 0 to 1. PURE. */
export function progressShare(p: SetupProgress): number {
  return p.total > 0 ? Math.min(1, Math.max(0, p.done / p.total)) : 0;
}

// ---------------------------------------------------------------- folded groups, kept per browser

export const CLOSED_KEY = 'forgeai.menu.closed';

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** The folded groups saved in this browser; nothing (all open) when unreadable. */
export function readClosed(store: Store | null): Set<NavGroupId> {
  if (!store) return new Set();
  try {
    const v = JSON.parse(store.getItem(CLOSED_KEY) ?? '[]') as unknown;
    const ids = new Set<string>(NAV_GROUPS.map((g) => g.id));
    return new Set(Array.isArray(v) ? (v.filter((x) => typeof x === 'string' && ids.has(x)) as NavGroupId[]) : []);
  } catch (e) {
    console.warn('[menu] folded groups unreadable', e);
    return new Set();
  }
}

export function saveClosed(store: Store | null, closed: ReadonlySet<NavGroupId>): void {
  if (!store) return;
  try {
    store.setItem(CLOSED_KEY, JSON.stringify([...closed]));
  } catch (e) {
    console.warn('[menu] could not keep the folded groups', e);
  }
}

/** This browser's storage, or null where it is blocked (a private window, a test). */
export function menuStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (e) {
    console.warn('[menu] no browser storage', e);
    return null;
  }
}
