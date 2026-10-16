/**
 * Files with several sheets, and "Excel" files that are really web pages (16 Oct 2026, data
 * migration). PURE.
 *
 * A gym's export often has more than one sheet (Members, Payments, Plans, a summary). The import
 * opens the sheet that looks most like a member list (the most mobile numbers), and the owner can
 * switch. Some gym software saves an HTML table and names it .xls: its tables are read as sheets.
 */
import { decodeCsvBytes, parseCsv, sniffFile, type Cell } from './importMembers';

export interface SheetRows {
  name: string;
  rows: Cell[][];
}

const MOBILE = /^(?:\+?91|0)?[6-9]\d{9}$/;

/** Cells in a sheet that hold an Indian mobile number. */
function mobileCount(rows: readonly (readonly Cell[])[]): number {
  let n = 0;
  for (const r of rows) {
    for (const c of r) {
      if (c == null) continue;
      const t = String(c).replace(/[\s\-().]/g, '');
      if (MOBILE.test(t)) n += 1;
    }
  }
  return n;
}

/** The sheet most like a member list: the most mobile numbers, else the most rows; ties: first. */
export function bestSheet(sheets: readonly SheetRows[]): number {
  let best = 0;
  let bestScore = -1;
  sheets.forEach((s, i) => {
    const filled = s.rows.filter((r) => r.some((c) => c != null && String(c).trim() !== '')).length;
    const score = mobileCount(s.rows) * 100_000 + filled;
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

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every <table> in an HTML "Excel" file, as sheets ("Table 1", ...). Text only; tags dropped. */
export function htmlTables(html: string): SheetRows[] {
  const out: SheetRows[] = [];
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  tables.forEach((t, i) => {
    const rows: Cell[][] = [];
    for (const tr of t.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cells: Cell[] = [];
      for (const m of tr.matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
        const text = decode(m[3]!.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''));
        cells.push(text === '' ? null : text);
        const span = /colspan\s*=\s*["']?(\d+)/i.exec(m[2]!);
        for (let k = 1; k < Math.min(Number(span?.[1] ?? 1), 50); k += 1) cells.push(null);
      }
      rows.push(cells);
    }
    out.push({ name: `Table ${i + 1}`, rows });
  });
  return out;
}


/**
 * Every sheet of a picked file, whatever it is: .xlsx (all sheets), an old .xls (SheetJS), a web
 * page saved as .xls, or CSV / tab-separated text. 'unknown' = not a spreadsheet. The readers load
 * only when such a file is picked, so the panel's first load stays small. Throws when a file of a
 * known kind cannot be read. `pause` lets the page draw between slow steps.
 */
export async function readSheets(name: string, buffer: ArrayBuffer, pause: () => Promise<void> = async () => {}): Promise<SheetRows[] | 'unknown'> {
  const bytes = new Uint8Array(buffer);
  const kind = sniffFile(name, bytes.subarray(0, 8));
  if (kind === 'unknown') return 'unknown';
  if (kind === 'csv') return [{ name, rows: parseCsv(decodeCsvBytes(bytes)) }];
  if (kind === 'html') return htmlTables(decodeCsvBytes(bytes));
  if (kind === 'xls') {
    const XLSX = await import('xlsx');
    await pause();
    const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
    return wb.SheetNames.map((n) => ({
      name: n,
      rows: XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[n]!, { header: 1, raw: true, defval: null, blankrows: true }),
    }));
  }
  const { default: readXlsxFile } = await import('read-excel-file/universal');
  await pause();
  return (await readXlsxFile(buffer)).map((sh) => ({ name: sh.sheet, rows: sh.data as unknown as Cell[][] }));
}
