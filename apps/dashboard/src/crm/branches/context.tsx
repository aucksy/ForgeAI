/**
 * Branches of one gym business (tracker #41, 24 Oct 2026) — what every screen may ask about them.
 *
 * THE MODEL (server: supabase/migrations/0031_branches.sql). Each BRANCH is its own gym row with its
 * own records, receipt series, join code, QR poster and front desk. Branches of one business share a
 * GROUP (gym_groups). Every owner is an owner of every branch of the group; desk staff belong to one
 * branch. A gym that never added a branch is a group of one and works exactly as before.
 *
 * The panel keeps ONE open branch at a time (its key is the device's key, auth/AuthProvider.tsx), so
 * every screen (members, plans, money, visits, shop, messages, staff) is automatically per branch.
 * Switching branch swaps the key and the whole panel remounts on it. The "All branches" screen and the
 * import's "a branch column" read the other branches through `dataFor`.
 *
 * This file is the seam: the provider (BranchProvider.tsx) fills it for an online owner; without a
 * provider (a browser-only gym, tests) the gym is its own only branch.
 */

import { createContext, useContext } from 'react';

import type { CrmData } from '../data/adapter';

export interface BranchInfo {
  gymId: string;
  /** The branch's name as its members see it ("Iron Temple, Vaishali Nagar"). */
  name: string;
  joinCode: string;
  /**
   * The start of this branch's receipt numbers ("B2" -> B2/2026-27/0001), so two branches under one
   * GST number never print the same number. Null for the first branch (its numbers never change).
   */
  receiptPrefix: string | null;
  /** The branch open on this device right now. */
  isCurrent: boolean;
}

export interface BranchContextValue {
  /** Every branch of the business, first branch first. A gym with no branches: just itself. */
  branches: readonly BranchInfo[];
  /** The business's name (the group); the gym's own name for a gym with one branch. */
  groupName: string;
  currentGymId: string;
  /** True for a signed-in owner of an online gym: may open the other branches and add one. */
  canOpenOthers: boolean;
  /** True when there are 2 or more branches (the switch at the top shows). */
  multi: boolean;
  /**
   * Another branch's records, loaded, to read or save into (the import puts members into the branch
   * their row names). Rejects with plain words when that branch can't be opened. Never the current
   * branch: use useCrm() for that, so the screens redraw.
   */
  dataFor: (gymId: string) => Promise<CrmData>;
}

/** The gym alone: no other branches. */
export function singleBranch(gymId: string, name: string, joinCode: string): BranchContextValue {
  return {
    branches: [{ gymId, name, joinCode, receiptPrefix: null, isCurrent: true }],
    groupName: name,
    currentGymId: gymId,
    canOpenOthers: false,
    multi: false,
    dataFor: () => Promise.reject(new Error('This gym has no other branches.')),
  };
}

export const BranchContext = createContext<BranchContextValue | null>(null);

/**
 * The branches. Without a provider (browser-only gym, a test) the answer is "this gym only", with an
 * empty id: callers that need the gym's id read it from useCrm().snapshot.gym.
 */
export function useBranches(): BranchContextValue {
  return useContext(BranchContext) ?? singleBranch('', '', '');
}

/**
 * Loose match of a branch name typed in a sheet against the real branches (an import's "Branch"
 * column): case, spaces, dots and dashes do not matter, and a word the gym always writes
 * ("Iron Temple") may be left out ("Vaishali" finds "Iron Temple, Vaishali Nagar"). Returns the one
 * branch it means, or null when none, or more than one, fits. PURE.
 */
export function matchBranchName(typed: string, branches: readonly Pick<BranchInfo, 'gymId' | 'name'>[]): string | null {
  const t = branchWords(typed);
  if (t.length === 0) return null;
  const whole = t.join(' ');
  const exact = branches.filter((b) => branchWords(b.name).join(' ') === whole);
  if (exact.length === 1) return exact[0].gymId;
  // Every typed word is in the branch's name (or the start of one of its words).
  const fits = branches.filter((b) => {
    const words = branchWords(b.name);
    return t.every((w) => words.some((bw) => bw === w || (w.length >= 3 && bw.startsWith(w))));
  });
  if (fits.length === 1) return fits[0].gymId;
  // The branch's own words that set it apart from the other branches appear in what was typed.
  const common = commonWords(branches.map((b) => branchWords(b.name)));
  const own = branches.filter((b) => {
    const mine = branchWords(b.name).filter((w) => !common.has(w));
    return mine.length > 0 && mine.every((w) => t.some((tw) => tw === w || (tw.length >= 3 && w.startsWith(tw))));
  });
  return own.length === 1 ? own[0].gymId : null;
}

function branchWords(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{Nd}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !NOISE.has(w));
}

/** Words that never tell two branches apart. */
const NOISE = new Set(['branch', 'the', 'gym', 'fitness', 'center', 'centre', 'club', 'and', 'of', 'shakha']);

function commonWords(lists: string[][]): Set<string> {
  if (lists.length < 2) return new Set();
  const [first, ...rest] = lists;
  return new Set(first.filter((w) => rest.every((l) => l.includes(w))));
}
