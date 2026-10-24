/**
 * Importing into a gym with several branches (tracker #41, 24 Oct 2026). PURE.
 *
 * Two ways an owner brings his branches:
 *  (a) one sheet for all of them, with a column naming each member's branch. The names are matched
 *      loosely (branches/context.tsx `matchBranchName`: "vaishali" finds "Iron Temple, Vaishali
 *      Nagar"); each name it can't place is listed ONCE, and the owner picks its branch or "Skip
 *      these rows";
 *  (b) one sheet per branch (a workbook with several sheets): the owner picks the branch for the
 *      sheet he is importing (its name is matched first).
 * With one branch nothing here runs: the import works exactly as before.
 *
 * The rows themselves are routed by `planImport` (its `branches` option); this file only reads the
 * Branch column for the screen and finds it when its header says nothing.
 */
import { branchKey, branchTarget, cellText, IMPORT_FIELDS, notMemberReason, SKIP_BRANCH, type BranchRouting, type ColumnMap, type ImportRow } from './importMembers';

/** One branch name as the file writes it, once, with how many rows carry it. */
export interface BranchNameInFile {
  /** `branchKey` of the name ('' = rows with no branch written). */
  key: string;
  /** The name as first written ('' = none). */
  shown: string;
  rows: number;
  /** The branch the loose matcher found (null = none fits, or more than one does). */
  matched: string | null;
  /** Where these rows go now: the owner's pick, else the match (null = waiting for a pick). */
  target: string | null;
}

/**
 * Every different branch name in the Branch column, once: the ones that need the owner's pick first,
 * then the most used. Blank rows, totals rows and stray cells are not counted. PURE.
 */
export function branchNamesInFile(
  rows: readonly (readonly unknown[])[],
  headerRow: number,
  map: ColumnMap,
  routing: Pick<BranchRouting, 'match' | 'answers'>,
): BranchNameInFile[] {
  const col = map.branch;
  if (col === null) return [];
  const by = new Map<string, BranchNameInFile>();
  for (let i = headerRow + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (row.every((c) => cellText(c) === '') || notMemberReason(row, map)) continue;
    const shown = cellText(row[col]).replace(/\s+/g, ' ').trim();
    const key = branchKey(shown);
    const had = by.get(key);
    if (had) {
      had.rows += 1;
      continue;
    }
    const matched = shown ? routing.match(shown) : null;
    by.set(key, { key, shown, rows: 1, matched, target: branchTarget(shown, routing as BranchRouting) });
  }
  return [...by.values()].sort((a, b) => Number(a.target !== null) - Number(b.target !== null) || b.rows - a.rows || a.shown.localeCompare(b.shown));
}

/**
 * A column whose header said nothing ("Location", "Area", no name at all) but whose values are the
 * gym's branch names becomes the Branch column: 60% of at least 2 filled cells match a branch.
 * Free columns are tried first; an address column only when its values really are branch names
 * (an address column of members' homes never matches). PURE.
 */
export function guessBranchColumn(
  rows: readonly (readonly unknown[])[],
  headerRow: number,
  map: ColumnMap,
  match: (typed: string) => string | null,
  idCols: readonly number[] = [],
): ColumnMap {
  if (map.branch !== null) return map;
  const width = Math.max(0, ...rows.slice(headerRow, headerRow + 201).map((r) => r.length));
  const used = new Set<number>([...IMPORT_FIELDS.map((f) => map[f]).filter((c): c is number => c !== null), ...idCols]);
  const body = rows.slice(headerRow + 1, headerRow + 201).filter((r) => !r.every((c) => cellText(c) === ''));
  const fits = (col: number): boolean => {
    const filled = body.map((r) => cellText(r[col])).filter((t) => t !== '');
    if (filled.length < 2) return false;
    return filled.filter((t) => match(t) !== null).length / filled.length >= 0.6;
  };
  const free = Array.from({ length: width }, (_, c) => c).filter((c) => !used.has(c));
  const freeHit = free.find(fits);
  if (freeHit !== undefined) return { ...map, branch: freeHit };
  for (const f of ['address', 'notes', 'batch'] as const) {
    const c = map[f];
    if (c !== null && fits(c)) return { ...map, [f]: null, branch: c };
  }
  return map;
}

/** The other branches the plan needs opened (to check duplicates and to save into). PURE. */
export function branchesToOpen(names: readonly BranchNameInFile[], sheetGymId: string | null, currentGymId: string, usesColumn: boolean): string[] {
  const ids = usesColumn ? names.map((n) => n.target) : [sheetGymId];
  return [...new Set(ids.filter((id): id is string => !!id && id !== currentGymId && id !== SKIP_BRANCH))];
}

/** How many rows each branch gets, for the line under the list ("Vaishali Nagar: 12 to add"). PURE. */
export function rowsPerBranch(rows: readonly ImportRow[]): Map<string, { add: number; duplicate: number }> {
  const out = new Map<string, { add: number; duplicate: number }>();
  for (const r of rows) {
    if (r.gymId === undefined || r.status === 'problem') continue;
    const c = out.get(r.gymId) ?? { add: 0, duplicate: 0 };
    if (r.status === 'add') c.add += 1;
    else c.duplicate += 1;
    out.set(r.gymId, c);
  }
  return out;
}
