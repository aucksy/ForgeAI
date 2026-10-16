/**
 * Data migration (16 Oct 2026): a gym's export with several sheets, an old Excel 97-2003 .xls,
 * and gym software that saves a web page as ".xls". Real files are made here with SheetJS and read
 * back through the same function the screen uses.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { sniffFile } from '../../src/crm/logic/importMembers';
import { bestSheet, htmlTables, readSheets, usableSheets } from '../../src/crm/logic/sheets';

const SUMMARY = [['Gym summary'], ['Total members', 412], ['Active', 300]];
const MEMBERS = [
  ['Member Name', 'Mobile No', 'Plan'],
  ['Riya Sharma', '9876543210', 'Quarterly'],
  ['Asha Verma', '+91 98290-12345', 'Yearly'],
];
const PAYMENTS = [['Receipt', 'Amount'], ['R-1', 3000], ['R-2', 4500]];

function workbook(type: 'xlsx' | 'biff8'): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(SUMMARY), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(MEMBERS), 'Members');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(PAYMENTS), 'Payments');
  const out = XLSX.write(wb, { type: 'array', bookType: type }) as ArrayBuffer;
  return out;
}

describe('a file with several sheets', () => {
  it('.xlsx: every sheet is read, and the member list is opened (not the first sheet)', async () => {
    const sheets = await readSheets('export.xlsx', workbook('xlsx'));
    expect(sheets).not.toBe('unknown');
    const list = usableSheets(sheets as never);
    expect(list.map((s) => s.name)).toEqual(['Summary', 'Members', 'Payments']);
    expect(list[bestSheet(list)]!.name).toBe('Members');
  });

  it('old .xls (Excel 97-2003): read, all sheets, same pick', async () => {
    const buf = workbook('biff8');
    expect(sniffFile('export.xls', new Uint8Array(buf).subarray(0, 8))).toBe('xls');
    const list = usableSheets((await readSheets('export.xls', buf)) as never);
    expect(list.map((s) => s.name)).toEqual(['Summary', 'Members', 'Payments']);
    const members = list[bestSheet(list)]!;
    expect(members.name).toBe('Members');
    expect(members.rows[1]).toEqual(['Riya Sharma', '9876543210', 'Quarterly']);
  });

  it('a sheet with only a title is not offered; with no mobile numbers anywhere, the biggest sheet wins', () => {
    const list = usableSheets([
      { name: 'Title', rows: [['Gym export']] },
      { name: 'A', rows: [['x'], ['1']] },
      { name: 'B', rows: [['x'], ['1'], ['2']] },
    ]);
    expect(list.map((s) => s.name)).toEqual(['A', 'B']);
    expect(bestSheet(list)).toBe(1);
  });
});

describe('a web page saved as .xls', () => {
  const html =
    '﻿  <html><body><table border=1><tr><th>Member&nbsp;Name</th><th>Mobile</th><th colspan="2">Plan</th><th>Note</th></tr>' +
    '<tr><td><b>Riya</b> Sharma</td><td>9876543210</td><td>Quarterly</td><td></td><td>A &amp; B</td></tr></table>' +
    '<table><tr><td>Total</td><td>1</td></tr></table></body></html>';
  const bytes = new TextEncoder().encode(html);

  it('is recognised by its first letters, not its name', () => {
    expect(sniffFile('members.xls', bytes.subarray(0, 8))).toBe('html');
    // A tab-separated file named .xls stays text, as before.
    expect(sniffFile('members.xls', new TextEncoder().encode('Name\tMobile').subarray(0, 8))).toBe('csv');
  });

  it('its tables become sheets, text only, a merged cell keeps the columns lined up', async () => {
    const sheets = (await readSheets('members.xls', bytes.buffer as ArrayBuffer)) as ReturnType<typeof htmlTables>;
    expect(sheets.map((s) => s.name)).toEqual(['Table 1', 'Table 2']);
    expect(sheets[0]!.rows).toEqual([
      ['Member Name', 'Mobile', 'Plan', null, 'Note'],
      ['Riya Sharma', '9876543210', 'Quarterly', null, 'A & B'],
    ]);
    expect(bestSheet(sheets)).toBe(0);
  });
});

it('anything else is not a spreadsheet', async () => {
  expect(await readSheets('photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer)).toBe('unknown');
});
