/** R-526 (owner, 14 Nov 2026): the side menu and More in five small groups; Set up your gym is the owner's page. */
import { describe, expect, it } from 'vitest';

import { canOpen } from '../../src/crm/auth/permissions';
import { CLOSED_KEY, NAV_GROUPS, navSections, progressShare, progressShort, readClosed, saveClosed, sectionBadge } from '../../src/crm/logic/navGroups';
import type { NavGroupId } from '../../src/crm/logic/navGroups';

const row = (path: string, group?: NavGroupId, badge?: number) => ({ path, group, badge });

function memoryStore() {
  const map = new Map<string, string>();
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('menu groups', () => {
  it('the five groups, in the order the owner reads them', () => {
    expect(NAV_GROUPS.map((g) => g.title)).toEqual(['Members', 'Money', 'Training', 'Reach members', 'Your gym']);
  });

  it('the top rows come first under no heading, then each group in order; rows keep their order; empty groups go', () => {
    const s = navSections([row('/'), row('/settings', 'gym'), row('/money', 'money'), row('/setup'), row('/plans', 'money'), row('/members', 'members')]);
    expect(s.map((x) => x.title)).toEqual([null, 'Members', 'Money', 'Your gym']);
    expect(s[0]!.items.map((i) => i.path)).toEqual(['/', '/setup']);
    expect(s[2]!.items.map((i) => i.path)).toEqual(['/money', '/plans']);
  });

  it('a folded group shows the sum of its rows’ numbers', () => {
    expect(sectionBadge([row('/members', 'members', 4), row('/attendance', 'members', 2), row('/enquiries', 'members')])).toBe(6);
    expect(sectionBadge([row('/plans', 'money')])).toBe(0);
  });

  it('folded groups are kept in the browser, and a broken or unknown value opens everything', () => {
    const store = memoryStore();
    expect(readClosed(store).size).toBe(0);
    saveClosed(store, new Set<NavGroupId>(['training', 'reach']));
    expect([...readClosed(store)].sort()).toEqual(['reach', 'training']);
    store.map.set(CLOSED_KEY, '{oops');
    expect(readClosed(store).size).toBe(0);
    store.map.set(CLOSED_KEY, JSON.stringify(['money', 'nope', 3]));
    expect([...readClosed(store)]).toEqual(['money']);
    expect(readClosed(null).size).toBe(0);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readClosed(throwing).size).toBe(0);
    expect(() => saveClosed(throwing, new Set<NavGroupId>(['gym']))).not.toThrow();
  });

  it('the set-up mark: "3/8" and a ring filled 3/8 of the way', () => {
    expect(progressShort({ done: 3, total: 8 })).toBe('3/8');
    expect(progressShare({ done: 3, total: 8 })).toBe(0.375);
    expect(progressShare({ done: 0, total: 0 })).toBe(0);
    expect(progressShare({ done: 9, total: 8 })).toBe(1);
  });

  it('Set up your gym is the owner’s page: the front desk never sees it (an old get-started address too)', () => {
    expect(canOpen('owner', '/setup')).toBe(true);
    expect(canOpen('staff', '/setup')).toBe(false);
    expect(canOpen('staff', '/get-started')).toBe(false);
  });
});
