/**
 * Files with several sheets, and "Excel" files that are really web pages (16 Oct 2026, data
 * migration). PURE.
 *
 * A gym's export often has more than one sheet (Members, Payments, Plans, a summary). The import
 * opens the sheet that looks most like a member list (the most DIFFERENT mobile numbers: a
 * payments sheet repeats its members), and the owner can switch. Some gym software saves an HTML
 * table, or an "Excel 2003 XML" file, and names it .xls: SheetJS reads both (review, 16 Oct: a
 * hand-made HTML reader froze on pages without closing tags and lost rows in nested tables).
 */
import { decodeCsvBytes, parseCsv, sniffFile, type Cell } from './importMembers';

export interface SheetRows {
  name: string;
  rows: Cell[][];
}

const MOBILE = /^(?:\+?91|0)?[6-9]\d{9}$/;

/** Different Indian mobile numbers in a sheet (last 10 digits), and how many cells repeat one. */
function mobiles(rows: readonly (readonly Cell[])[]): { distinct: number; repeats: number } {
  const seen = new Set<string>();
  let all = 0;
  for (const r of rows) {
    for (const c of r) {
      if (c == null) continue;
      const t = String(c).replace(/[\s\-().]/g, '');
      if (MOBILE.test(t)) {
        seen.add(t.slice(-10));
        all += 1;
      }
    }
  }
  return { distinct: seen.size, repeats: all - seen.size };
}

/**
 * The sheet most like a member list: the most different mobile numbers; then the one that repeats
 * them least (a payments sheet lists a member once per payment); then the most rows; ties: first.
 */
export function bestSheet(sheets: readonly SheetRows[]): number {
  let best = 0;
  let bestScore = -1;
  sheets.forEach((s, i) => {
    const filled = s.rows.filter((r) => r.some((c) => c != null && String(c).trim() !== '')).length;
    const m = mobiles(s.rows);
    const score = m.distinct * 1e9 - m.repeats * 1e4 + filled;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

/** Sheets with at least a header row and one more row (empty or one-line sheets are not offered). */
export function usableSheets(sheets: readonly SheetRows[]): SheetRows[] {
  return sheets.filter((s) => s.rows.filter((r) => r.some((c) => c != null && String(c).trim() !== '')).length >= 2);
}

/**
 * Every sheet of a picked file, whatever it is: .xlsx (all sheets), an old .xls, a web page or an
 * "Excel 2003 XML" file saved as .xls (SheetJS), or CSV / tab-separated text. 'unknown' = not a spreadsheet. The readers load
 * only when such a file is picked, so the panel's first load stays small. Throws when a file of a
 * known kind cannot be read. `pause` lets the page draw between slow steps.
 */
export async function readSheets(name: string, buffer: ArrayBuffer, pause: () => Promise<void> = async () => {}): Promise<SheetRows[] | 'unknown'> {
  const bytes = new Uint8Array(buffer);
  const kind = sniffFile(name, bytes.subarray(0, 512));
  if (kind === 'unknown') return 'unknown';
  if (kind === 'csv') return [{ name, rows: parseCsv(decodeCsvBytes(bytes)) }];
  if (kind === 'xls' || kind === 'html') {
    const XLSX = await import('xlsx');
    await pause();
    // Review: no cellDates. SheetJS makes Dates at LOCAL midnight, which read back a day early in
    // India; the raw day numbers go through the same path as an .xlsx file's. `raw` on a web page
    // keeps "01/08/2026" as text, so it is read day-first (SheetJS would guess month-first).
    // Bold / colour tags inside a cell are dropped first: SheetJS glues "<b>Riya</b> Sharma" into
    // "RiyaSharma". The pattern stops at the next "<" or ">", so a broken tag cannot make it slow.
    const wb =
      kind === 'html'
        ? XLSX.read(decodeCsvBytes(bytes).replace(/<\/?(?:b|i|u|em|strong|span|font|a|small|big)(?:\s[^<>]*)?>/gi, ''), { type: 'string', raw: true })
        : XLSX.read(bytes, { type: 'array' });
    return wb.SheetNames.map((n) => ({
      name: n,
      rows: XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[n]!, { header: 1, raw: true, defval: null, blankrows: true }),
    }));
  }
  const { default: readXlsxFile } = await import('read-excel-file/universal');
  await pause();
  return (await readXlsxFile(buffer)).map((sh) => ({ name: sh.sheet, rows: sh.data as unknown as Cell[][] }));
}
