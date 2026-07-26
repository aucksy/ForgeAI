/**
 * CSV export — PURE.
 *
 * The gym's accountant works in Excel, so the collections report has to leave the
 * app as a file. Two things this does that a naive `rows.join(',')` does not:
 *
 *  1. **CRLF line endings and a UTF-8 BOM.** Without the BOM, Excel on Windows
 *     opens the file in the system codepage and every ₹ and every Devanagari name
 *     becomes mojibake. The BOM is added by `csvDocument`, not by `toCsv`, so
 *     tests can compare clean strings.
 *  2. **A formula-injection guard.** A spreadsheet treats a cell beginning `=`,
 *     `+`, `-` or `@` as a formula, so a member note or a UPI reference typed as
 *     `=cmd|'/c calc'!A1` becomes executable the moment the accountant opens the
 *     export. Any such string is prefixed with an apostrophe, which Excel and
 *     LibreOffice both read as "this is text".
 */

export type CsvValue = string | number | null | undefined;

/** Byte-order mark that makes Excel read the file as UTF-8. */
export const CSV_BOM = '﻿';

const NEEDS_QUOTES = /[",\r\n]/;
const RISKY_LEAD = /^[=+\-@\t\r]/;

/** Escape one field. Numbers pass through; strings are guarded and quoted as needed. */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';

  // Neutralise a formula BEFORE quoting, so the apostrophe ends up inside the quotes.
  const risky = RISKY_LEAD.test(value);
  const guarded = risky ? `'${value}` : value;

  // A guarded field is ALWAYS quoted. Bare `'=1+1` is legal CSV, but quoting is
  // what makes every spreadsheet agree the cell is text rather than a formula.
  if (risky || NEEDS_QUOTES.test(guarded) || guarded !== guarded.trim()) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/** A CSV body: header row plus data rows, CRLF-separated, no trailing newline. */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): string {
  const lines = [headers.map(csvField).join(',')];
  for (const row of rows) lines.push(row.map(csvField).join(','));
  return lines.join('\r\n');
}

/** The full file contents, ready to hand to a Blob. */
export function csvDocument(
  headers: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): string {
  return CSV_BOM + toCsv(headers, rows);
}

/**
 * A filesystem-safe filename. Spaces and punctuation from a gym's name would
 * otherwise produce something a browser silently mangles or refuses to save.
 */
export function csvFilename(parts: readonly string[]): string {
  const slug = parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'export'}.csv`;
}
