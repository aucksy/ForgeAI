/**
 * Saving an import, branch by branch, without ever stopping halfway (tracker #36 and #41,
 * 24 Oct 2026). No React; the stores are handed in, so every path is tested with fakes.
 *
 * For each branch the rows go to (the open branch first, then the others):
 *  1. the new members, 500 a save (`saveInBatches`, going on after a failed batch);
 *  2. "Fill in their blank details" for members already there (one save each);
 *  3. the plans and payments of every member that is now really in that branch.
 * A branch that can't be opened, a batch that fails, a row that fails: each only holds back its
 * own rows (they "wait", with the reason, and "Try again" sends just them). Everything else goes
 * in. One import id for the whole file; each branch's "Undo this import" sees its own records.
 */
import type { ImportTermItem, ImportTermsResult } from '../data/adapter';
import type { Member, MemberDraft } from '../types';
import { fillBlanksPatch, rowBringsTerm, saveInBatches, skipReason, IMPORT_BATCH_SIZE, type ImportRow } from './importMembers';

/** What one branch's store must do for an import (useCrm() for the open branch, dataFor() for the rest). */
export interface ImportSaver {
  createMembers(drafts: readonly MemberDraft[]): Promise<Member[]>;
  updateMember(id: string, patch: Partial<MemberDraft>): Promise<Member>;
  importTerms(items: readonly ImportTermItem[], importId: string): Promise<ImportTermsResult>;
}

export interface BranchSaveResult {
  /** '' = a gym with one branch. */
  gymId: string;
  added: number;
  updated: number;
  /** The last sheet row saved as a member here (0 when none). */
  lastSavedRow: number;
  terms: ImportTermsResult | null;
  termsError: string | null;
  /** The first failure's words when some rows here were not saved; null when all went through. */
  stopped: string | null;
  /** The branch could not be opened (its rows all wait). */
  openError: string | null;
}

export interface SkippedRow {
  row: ImportRow;
  reason: string;
  /** Not saved because something failed: "Try again" sends it. False = left out on purpose. */
  waiting: boolean;
}

export interface ImportSaveResult {
  branches: BranchSaveResult[];
  /** Every row not added, sorted by row number (the waiting ones included). */
  skipped: SkippedRow[];
  /** A Staff session: the plans in the file were left for the owner. */
  termsForStaff: boolean;
}

export const NOT_SAVED =
  'Not saved. Saving stopped, maybe because the internet went off. Tap “Try again”, or import this file again. Members already added are skipped.';

/** After this many fills in a row fail, the rest of that branch's fills wait (the internet is gone). */
const FILL_FAILS_IN_A_ROW = 3;

export interface SaveImportInput {
  rows: readonly ImportRow[];
  dupMode: 'skip' | 'fill';
  role: 'owner' | 'staff';
  importId: string;
  /** The store for a branch ('' or the open branch's id = the open branch). Rejects when it can't be opened. */
  saverFor: (gymId: string) => Promise<ImportSaver>;
  /** A branch's name, for the reasons. */
  branchName?: (gymId: string) => string;
  /** The open branch: saved first. */
  currentGymId?: string;
  onProgress?: (done: number, total: number) => void;
  batchSize?: number;
}

export async function saveImport(input: SaveImportInput): Promise<ImportSaveResult> {
  const { rows, dupMode, role, importId } = input;
  const nameOf = input.branchName ?? (() => 'that branch');
  const current = input.currentGymId ?? '';
  const skipped: SkippedRow[] = [];

  // Which rows are work, by branch, in the order they appear (the open branch first).
  const groups = new Map<string, ImportRow[]>();
  for (const r of rows) {
    const g = r.gymId ?? '';
    const list = groups.get(g) ?? [];
    list.push(r);
    groups.set(g, list);
  }
  const order = [...groups.keys()].sort((a, b) => Number(b === current) - Number(a === current));

  const isAdd = (r: ImportRow) => r.status === 'add' && r.draft !== null;
  const isFill = (r: ImportRow) => dupMode === 'fill' && r.existing !== null && r.sameAsRow === null && r.draft !== null;
  const total = rows.filter((r) => isAdd(r) || isFill(r)).length;
  let done = 0;
  const tick = (n: number) => {
    done += n;
    input.onProgress?.(Math.min(done, total), total);
  };

  const branches: BranchSaveResult[] = [];
  let termsForStaff = false;
  for (const gymId of order) {
    const list = groups.get(gymId)!;
    const adds = list.filter(isAdd);
    const fills = list.filter(isFill);
    const work = new Set([...adds, ...fills]);
    // Problems, duplicates left alone, and repeats with nothing to bring: skipped on purpose.
    // A repeat or member-already-here row whose plan and payment the owner adds is not skipped (C7-37).
    for (const r of list) {
      // (A row whose branch could not be opened before the import is a problem row: importing the
      // file again, once the branch opens, brings it. "Try again" cannot, so it does not wait.)
      if (!work.has(r) && !rowBringsTerm(r, role)) skipped.push({ row: r, reason: skipReason(r), waiting: false });
    }
    // Nothing to save here (only problem rows, or rows the owner skipped): the branch is not opened.
    if (work.size === 0 && !list.some((r) => rowBringsTerm(r, role) || (r.term && r.draft && role !== 'owner'))) continue;
    const result: BranchSaveResult = { gymId, added: 0, updated: 0, lastSavedRow: 0, terms: null, termsError: null, stopped: null, openError: null };
    branches.push(result);

    let saver: ImportSaver;
    try {
      saver = await input.saverFor(gymId);
    } catch (e) {
      const why = e instanceof Error && e.message ? e.message : 'It could not be opened.';
      console.warn('[ForgeErr] import members: branch could not be opened', gymId, e);
      result.openError = why;
      const reason = `The branch “${nameOf(gymId)}” could not be opened: ${why} Tap “Try again”.`;
      for (const r of list) if (work.has(r) || rowBringsTerm(r, role)) skipped.push({ row: r, reason, waiting: true });
      tick(work.size);
      continue;
    }

    // 1. New members.
    const outcome = await saveInBatches(
      adds,
      (drafts) => saver.createMembers(drafts.map((d) => ({ ...d, importId }))),
      (n) => input.onProgress?.(Math.min(done + n, total), total),
      input.batchSize ?? IMPORT_BATCH_SIZE,
      true,
    );
    done += adds.length;
    input.onProgress?.(Math.min(done, total), total);
    for (const r of outcome.duplicates) skipped.push({ row: r, reason: 'Already a member.', waiting: false });
    for (const r of outcome.notSaved) skipped.push({ row: r, reason: NOT_SAVED, waiting: true });
    result.added = outcome.added.length;
    result.lastSavedRow = outcome.added.reduce((max, r) => Math.max(max, r.rowNumber), 0);
    result.stopped = outcome.stopped;

    // 2. Blank details of members already in this branch. One failure never stops the rest; three
    // in a row means the connection is gone, and the rest wait.
    let failsInARow = 0;
    for (const row of fills) {
      if (failsInARow >= FILL_FAILS_IN_A_ROW) {
        skipped.push({ row, reason: NOT_SAVED, waiting: true });
        tick(1);
        continue;
      }
      try {
        const patch = row.existing && row.draft ? fillBlanksPatch(row.existing, row.draft) : {};
        if (!row.existing || Object.keys(patch).length === 0) {
          skipped.push({ row, reason: 'Already a member. Nothing new to fill in.', waiting: false });
        } else {
          await saver.updateMember(row.existing.id, patch);
          result.updated += 1;
        }
        failsInARow = 0;
      } catch (e) {
        console.warn(`[ForgeErr] import members: row ${row.rowNumber} not filled in`, e);
        failsInARow += 1;
        result.stopped ??= e instanceof Error && e.message ? e.message : 'Saving stopped.';
        skipped.push({ row, reason: NOT_SAVED, waiting: true });
      }
      tick(1);
    }

    // 3. Plans and payments, for members now really here: a new member saved above, a member
    // already in this branch, or a repeat row of one of those (file order).
    const saved = new Set(outcome.added);
    const byNumber = new Map(list.map((r) => [r.rowNumber, r] as const));
    const inBranch = (r: ImportRow): boolean => {
      if (r.existing !== null) return true;
      if (r.sameAsRow !== null) {
        const head = byNumber.get(r.sameAsRow);
        return !!head && (saved.has(head) || head.existing !== null);
      }
      return saved.has(r);
    };
    const termRows = list.filter((r) => r.term && r.draft && (saved.has(r) || r.existing !== null || r.sameAsRow !== null)).sort((a, b) => a.rowNumber - b.rowNumber);
    const ready = termRows.filter(inBranch);
    // A repeat row whose member was not saved waits with that member.
    for (const r of termRows) if (!inBranch(r) && rowBringsTerm(r, role)) skipped.push({ row: r, reason: NOT_SAVED, waiting: true });
    if (ready.length > 0 && role === 'owner') {
      try {
        result.terms = await saver.importTerms(
          ready.map((r) => ({ phone: r.draft!.phone, term: r.term! })),
          importId,
        );
      } catch (e) {
        console.warn('[ForgeErr] import members: plans and payments not saved', gymId, e);
        result.termsError = e instanceof Error && e.message ? e.message : 'Saving stopped.';
      }
    } else if (termRows.length > 0 && role !== 'owner') {
      termsForStaff = true;
    }
  }

  skipped.sort((a, b) => a.row.rowNumber - b.row.rowNumber);
  return { branches, skipped, termsForStaff };
}

/**
 * "Try again" sent only the waiting rows: put its answer together with the first one. PURE.
 * What waited and went in now counts as added; what still fails still waits.
 */
export function mergeSaveResults(first: ImportSaveResult, retry: ImportSaveResult): ImportSaveResult {
  // "Try again" sends every waiting row (`rowsToRetry`): its answer replaces theirs.
  const kept = first.skipped.filter((s) => !s.waiting);
  const branches = first.branches.map((b) => ({ ...b }));
  for (const r of retry.branches) {
    const b = branches.find((x) => x.gymId === r.gymId);
    if (!b) {
      branches.push({ ...r });
      continue;
    }
    b.added += r.added;
    b.updated += r.updated;
    b.lastSavedRow = Math.max(b.lastSavedRow, r.lastSavedRow);
    b.stopped = r.stopped;
    b.openError = r.openError;
    if (r.terms) {
      b.terms = b.terms
        ? {
            plans: b.terms.plans + r.terms.plans,
            memberships: b.terms.memberships + r.terms.memberships,
            payments: b.terms.payments + r.terms.payments,
            skipped: b.terms.skipped + r.terms.skipped,
          }
        : r.terms;
    }
    b.termsError = r.termsError ?? b.termsError;
  }
  const skipped = [...kept, ...retry.skipped].sort((a, b) => a.row.rowNumber - b.row.rowNumber);
  return { branches, skipped, termsForStaff: first.termsForStaff || retry.termsForStaff };
}

/** The rows "Try again" sends: every row that waits. PURE. */
export function rowsToRetry(result: ImportSaveResult): ImportRow[] {
  return result.skipped.filter((s) => s.waiting).map((s) => s.row);
}
