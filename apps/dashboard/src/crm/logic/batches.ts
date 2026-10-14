/**
 * Batches — the time slot a member trains in ("Morning 6-8", "Evening 6-9", "Ladies 11-12").
 * PURE (no network, no storage, no React). 15 Oct 2026.
 *
 * Research (Audit/crm-research/RESEARCH.md, "Batches | Common"): a batch is a FIELD on the member
 * plus a FILTER, not a timetable. So a batch is just a name the gym types once; every later member
 * picks it from chips. There is no batch table to keep in step — the list of batches IS the names
 * the gym's members carry, counted.
 *
 * One batch, many spellings: the desk types "morning 6-8" on Monday and "Morning  6-8" on Tuesday.
 * Names are compared case-insensitively after trimming and collapsing spaces, and the FIRST
 * spelling the gym used is the one shown everywhere, so the filter never shows the same batch twice.
 *
 * Old members saved before batches existed carry no `batch` at all: undefined reads as "no batch".
 */

import type { Member } from '../types';

/** Longest batch name the form accepts — a chip, not a paragraph. */
export const BATCH_MAX = 40;

/** Filter value for "every member", and for "members with no batch". Never a real batch's key. */
export const ALL_BATCHES = '';
export const NO_BATCH = '\u0000none';

/** Trim and collapse inner spaces; blank (or not a string at all) is no batch. */
export function normalizeBatch(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.trim().replace(/\s+/g, ' ');
  return clean === '' ? null : clean;
}

/** The comparison key: two names with the same key are the same batch. */
export function batchKey(raw: unknown): string | null {
  const clean = normalizeBatch(raw);
  return clean === null ? null : clean.toLowerCase();
}

/** A member's batch, cleaned. Old members with no `batch` field have none. */
export function memberBatch(m: Pick<Member, 'batch'> | { batch?: unknown }): string | null {
  return normalizeBatch(m.batch);
}

export interface BatchCount {
  /** The first spelling this gym used. */
  name: string;
  /** Lower-cased comparison key — the value a filter holds. */
  key: string;
  countN: number;
}

/**
 * Every batch in use among `members`, with how many members are in each. Most used first (that is
 * the order the form's chips want: the batch most new members join is one tap away), ties by name.
 * A batch's name is the first spelling met in `members` order.
 */
export function listBatches(members: readonly { batch?: unknown }[]): BatchCount[] {
  const byKey = new Map<string, BatchCount>();
  for (const m of members) {
    const name = normalizeBatch(m.batch);
    if (name === null) continue;
    const key = name.toLowerCase();
    const hit = byKey.get(key);
    if (hit) hit.countN += 1;
    else byKey.set(key, { name, key, countN: 1 });
  }
  return [...byKey.values()].sort((a, b) => b.countN - a.countN || a.name.localeCompare(b.name));
}

/**
 * The batches the Members filter offers: those carried by members who are NOT archived, so a batch
 * only archived members still carry never sits in the list as "(0)".
 */
export function activeBatches(members: readonly { batch?: unknown; archived?: boolean }[]): BatchCount[] {
  return listBatches(members.filter((m) => !m.archived));
}

/**
 * What to store for a typed batch name: the gym's existing spelling when it matches one
 * case-insensitively, else the cleaned name, else null for blank.
 */
export function resolveBatch(raw: unknown, existing: readonly string[]): string | null {
  const clean = normalizeBatch(raw);
  if (clean === null) return null;
  const key = clean.toLowerCase();
  const known = existing.find((name) => normalizeBatch(name)?.toLowerCase() === key);
  return known !== undefined ? (normalizeBatch(known) as string) : clean;
}

/**
 * Does this member pass a batch filter? `ALL_BATCHES` passes everyone, `NO_BATCH` passes those
 * with none, anything else is a batch key (from `listBatches`) and matches case-insensitively.
 */
export function inBatch(m: { batch?: unknown }, filter: string): boolean {
  if (filter === ALL_BATCHES) return true;
  const key = batchKey(m.batch);
  if (filter === NO_BATCH) return key === null;
  return key === filter;
}

/** How many of `members` have no batch. */
export function countWithoutBatch(members: readonly { batch?: unknown }[]): number {
  let n = 0;
  for (const m of members) if (normalizeBatch(m.batch) === null) n += 1;
  return n;
}
