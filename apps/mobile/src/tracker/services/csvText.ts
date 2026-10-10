/**
 * CSV text as the import screens meet it — a Hevy or Strong export, or one the member opened and
 * saved again in Excel (audit IM-11): a byte-order mark, ";" or tab between fields (a European
 * Excel), Excel's "sep=;" first line, quoted fields with commas and doubled quotes, CRLF, and
 * numbers written "72,5" or "1.072,5". PURE.
 */

/** Split CSV text into rows of fields: quotes, doubled quotes, CRLF, a BOM. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

/** Excel's own first line naming the separator ("sep=;"), if any. */
function sepLine(text: string): string | null {
  const m = /^﻿?"?sep=(.)"?\s*\r?\n/i.exec(text);
  return m ? m[1] : null;
}

/** The text without Excel's "sep=" line. */
export function withoutSepLine(text: string): string {
  return sepLine(text) != null ? text.replace(/^﻿?"?sep=."?\s*\r?\n/i, '') : text;
}

/** The field separator: Excel's "sep=" line, else the most common of , ; and tab in the header (outside quotes). */
export function delimiterOf(text: string): string {
  const sep = sepLine(text);
  if (sep) return sep;
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const c of first) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && c in counts) counts[c] += 1;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : ',';
}

/**
 * A number as a person or a spreadsheet wrote it. A comma-decimal phone or Excel writes "72,5"
 * (often quoted, even in a comma-separated file); thousands marks too: "1.072,5" and "1,072.5".
 */
export function num(raw: string | number | null | undefined, commaDecimal: boolean): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = raw.trim().replace(/[\s  ']/g, '');
  if (s === '') return null;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    // Both: the last one is the decimal mark.
    s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (comma >= 0) {
    // Only a comma: a decimal mark ("72,5", or any in a ;-file), else thousands ("1,072").
    s = commaDecimal || /^-?\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Header names as compared: trimmed, lower case, single spaces (a BOM dropped). */
export const normHead = (h: string): string => h.replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * CSV text → one object per row, keyed by the (normalised) header. `commaDecimal` says whether
 * numbers in it use a decimal comma (a ";"-separated file, or a "72,5" in a number column).
 */
export function csvObjects(text: string): { rows: Record<string, string>[]; head: string[]; delimiter: string } {
  const delimiter = delimiterOf(text);
  const all = parseCsv(withoutSepLine(text), delimiter);
  const head = (all[0] ?? []).map(normHead);
  const rows = all.slice(1).map((r) => {
    const o: Record<string, string> = {};
    head.forEach((h, i) => {
      if (h !== '') o[h] = r[i] ?? '';
    });
    return o;
  });
  return { rows, head, delimiter };
}
