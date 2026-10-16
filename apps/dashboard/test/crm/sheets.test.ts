/**
 * Data migration (16 Oct 2026): a gym's export with several sheets, an old Excel 97-2003 .xls,
 * and gym software that saves a web page as ".xls". Real files are made here with SheetJS and read
 * back through the same function the screen uses.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { guessColumns, guessFromValues, planImport, sniffFile } from '../../src/crm/logic/importMembers';
import { bestSheet, readSheets, usableSheets } from '../../src/crm/logic/sheets';

const TODAY = '2026-10-16';

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

describe('review fixes (16 Oct 2026)', () => {
  it('old .xls dates are the dates in the file (they were a day early in India)', async () => {
    process.env.TZ = 'Asia/Kolkata';
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Member Name', 'Mobile No', 'Membership Type Name', 'Membership Start Date', 'Membership End Date', 'Date of Birth'],
      ['Riya Sharma', 9876543210, 'Quarterly', new Date(Date.UTC(2026, 7, 1)), new Date(Date.UTC(2026, 9, 31)), new Date(Date.UTC(1995, 2, 15))],
    ], { cellDates: true, UTC: true } as never);
    XLSX.utils.book_append_sheet(wb, ws, 'Members');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'biff8' }) as ArrayBuffer;
    const [sheet] = (await readSheets('old.xls', buf)) as { rows: unknown[][] }[];
    const rows = sheet!.rows as never;
    const map = guessFromValues(rows, 0, guessColumns((sheet!.rows[0] ?? []) as never), TODAY);
    const r = planImport(rows, 0, map, [], TODAY).rows[0]!;
    expect(r.draft?.phone).toBe('+919876543210');
    expect(r.draft?.dateOfBirth).toBe('1995-03-15');
    expect(r.term).toMatchObject({ startsOn: '2026-08-01', endsOn: '2026-10-31' });
  });

  it('a payments sheet that repeats its members does not beat the member list', () => {
    const members = [['Name', 'Mobile'], ...Array.from({ length: 50 }, (_, i) => [`M${i}`, `98${String(10000000 + i)}`])];
    const payments = [['Mobile', 'Amount'], ...Array.from({ length: 120 }, (_, i) => [`98${String(10000000 + (i % 50))}`, 1000])];
    const list = [{ name: 'Payments', rows: payments }, { name: 'Members', rows: members }];
    expect(list[bestSheet(list as never)]!.name).toBe('Members');
  });

  const page = (body: string) => new TextEncoder().encode(body).buffer as ArrayBuffer;

  it('a web page saved as .xls (even after blank lines): its table, day-first dates kept as written', async () => {
    const html = '\r\n\r\n\r\n\r\n  <html><body><table border=1><tr><th class="h">Member&nbsp;Name</th><th>Mobile</th><th>Start</th></tr>' +
      '<tr><td><b>Riya</b> Sharma</td><td>9876543210</td><td>01/08/2026</td></tr></table></body></html>';
    expect(sniffFile('members.xls', new Uint8Array(page(html)).subarray(0, 512))).toBe('html');
    const [sheet] = (await readSheets('members.xls', page(html))) as { rows: unknown[][] }[];
    const filled = sheet!.rows.filter((r) => r.some((c) => c != null && String(c).trim() !== ''));
    expect(String(filled[0]![0]).replace(/\s+/g, ' ')).toBe('Member Name');
    expect(filled[1]![0]).toBe('Riya Sharma');
    expect(String(filled[1]![2])).toBe('01/08/2026');
  });

  it('a page without closing tags reads fast and keeps its rows', async () => {
    const rows = Array.from({ length: 20000 }, (_, i) => `<tr><td>Member ${i}<td>98${String(10000000 + i)}`).join('');
    const html = `<html><table><tr><th>Name<th>Mobile${rows}</table></html>`;
    const t0 = Date.now();
    const [sheet] = (await readSheets('big.xls', page(html))) as { rows: unknown[][] }[];
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(sheet!.rows.filter((r) => r.some((c) => c != null)).length).toBe(20001);
  });

  it('an "Excel 2003 XML" .xls is read, not mistaken for a web page with no rows', async () => {
    const xml = '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Worksheet ss:Name="Members"><Table><Row><Cell><Data ss:Type="String">Name</Data></Cell><Cell><Data ss:Type="String">Mobile</Data></Cell></Row>' +
      '<Row><Cell><Data ss:Type="String">Riya</Data></Cell><Cell><Data ss:Type="String">9876543210</Data></Cell></Row></Table></Worksheet></Workbook>';
    const sheets = (await readSheets('export.xls', page(xml))) as { name: string; rows: unknown[][] }[];
    expect(sheets[0]!.name).toBe('Members');
    expect(sheets[0]!.rows[1]).toEqual(['Riya', '9876543210']);
  });
});

it('anything else is not a spreadsheet', async () => {
  expect(await readSheets('photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer)).toBe('unknown');
});
