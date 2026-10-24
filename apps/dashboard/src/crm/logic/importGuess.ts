/**
 * The import screen's first guess for a sheet, in one place (tracker #36, 24 Oct 2026). PURE.
 *
 * The screen and the fixture tests (test/crm/importFixtures.test.ts) both call these, so a test
 * that imports a real-shaped sheet runs exactly what the owner's screen runs: the header row, the
 * columns by name, then by what is in them, ID-number columns taken out, the Branch column (only
 * with several branches), and every other column kept as an extra detail.
 */
import { findIdColumns, freeColumns, type IdColumn } from './aiImport';
import { guessBranchColumn } from './importBranches';
import {
  cellText,
  columnLetter,
  findHeaderRow,
  guessColumns,
  guessFromValues,
  IMPORT_FIELDS,
  isRowNumberColumn,
  type ColumnMap,
  type ExtraColumn,
} from './importMembers';
import type { DateISO } from './dates';

/** The widest row: how many columns the sheet has (every row, not just the first ones). PURE. */
export function sheetWidth(rows: readonly (readonly unknown[])[]): number {
  let w = 0;
  for (const r of rows) if (r.length > w) w = r.length;
  return w;
}

/** The guessed columns with any ID-number column taken back out. PURE. */
export function withoutIdColumns(map: ColumnMap, ids: readonly IdColumn[]): ColumnMap {
  const out = { ...map };
  const set = new Set(ids.map((c) => c.col));
  for (const f of IMPORT_FIELDS) if (out[f] !== null && set.has(out[f]!)) out[f] = null;
  return out;
}

/**
 * Our guess for one header row. `match` is the loose branch matcher when the gym has 2 or more
 * branches (a column of branch names is found even when its name says nothing); null for a gym with
 * one branch, where a "Branch" column is just another detail to keep. PURE.
 */
export function guessMapAt(rows: readonly (readonly unknown[])[], headerRow: number, today: DateISO, match: ((typed: string) => string | null) | null): ColumnMap {
  const ids = findIdColumns(rows, headerRow, sheetWidth(rows));
  const guessed = withoutIdColumns(guessFromValues(rows, headerRow, guessColumns(rows[headerRow] ?? []), today), ids);
  return match ? guessBranchColumn(rows, headerRow, guessed, match, ids.map((c) => c.col)) : { ...guessed, branch: null };
}

/** The header row and the columns, as the screen first shows them. PURE. */
export function guessSheet(rows: readonly (readonly unknown[])[], today: DateISO, match: ((typed: string) => string | null) | null): { headerRow: number; map: ColumnMap } {
  const headerRow = findHeaderRow(rows);
  return { headerRow, map: guessMapAt(rows, headerRow, today, match) };
}

export type ExtraChoice = Pick<ExtraColumn, 'label' | 'on' | 'ai' | 'aiIgnored'>;

/**
 * #36: every column that is not a field, not ID numbers and not empty, as an extra detail: kept
 * (ticked) unless the owner or the AI said no, or it only numbers the rows. The owner's choices win.
 * PURE.
 */
export function sheetExtras(
  rows: readonly (readonly unknown[])[],
  headerRow: number,
  map: ColumnMap,
  idCols: readonly number[],
  choices: Readonly<Record<number, ExtraChoice>> = {},
): ExtraColumn[] {
  const headers = (rows[headerRow] ?? []).map(cellText);
  return freeColumns(rows, headerRow, sheetWidth(rows), map, idCols).map((col) => {
    const choice = choices[col];
    const rowNumbers = !choice && isRowNumberColumn(rows, headerRow, col);
    return {
      col,
      label: choice?.label ?? ((headers[col] ?? '').trim() || `Column ${columnLetter(col)}`),
      on: choice?.on ?? !rowNumbers,
      ai: choice?.ai ?? false,
      aiIgnored: choice?.aiIgnored ?? false,
      rowNumbers,
    };
  });
}
