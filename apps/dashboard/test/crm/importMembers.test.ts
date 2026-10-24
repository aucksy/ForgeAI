import { describe, expect, it } from 'vitest';

import { canOpen } from '../../src/crm/auth/permissions';
import { DuplicatePhoneError, PartialSaveError } from '../../src/crm/data/adapter';
import {
  cellText,
  columnLetter,
  decodeCsvBytes,
  detectDayFirst,
  emptyColumnMap,
  excelSerialToISO,
  fillBlanksPatch,
  findHeaderRow,
  fullYear,
  guessColumns,
  MAX_IMPORT_ROWS,
  parseCsv,
  parseGender,
  parseImportPhone,
  parseSheetDate,
  pastYear,
  planImport,
  rowVerdict,
  saveInBatches,
  skippedRowsCsv,
  skipReason,
  sniffFile,
  templateCsv,
  templateHeaders,
  type ColumnMap,
} from '../../src/crm/logic/importMembers';
import { makeMember } from './fixtures';

const TODAY = '2026-10-15';

describe('guessColumns', () => {
  it('reads plain English headers', () => {
    const m = guessColumns(['Name', 'Mobile', 'Joining date', 'Gender', 'DOB', 'Address', 'Batch', 'Plan', 'Amount', 'Expiry', 'Notes', 'Email']);
    expect(m).toEqual({
      fullName: 0, phone: 1, joinedOn: 2, gender: 3, dateOfBirth: 4, address: 5, batch: 6, plan: 7, amount: 8, expiry: 9, notes: 10, email: 11,
      startDate: null, total: null, due: null, paidOn: null, branch: null, paidFlag: null,
    });
  });

  it('reads Hinglish and Hindi headers', () => {
    const m = guessColumns(['Naam', 'Phone No.', 'DOJ', 'Male/Female', 'Janam din', 'Pata', 'Package', 'Fees', 'Valid till']);
    expect(m.fullName).toBe(0);
    expect(m.phone).toBe(1);
    expect(m.joinedOn).toBe(2);
    expect(m.gender).toBe(3);
    expect(m.dateOfBirth).toBe(4);
    expect(m.address).toBe(5);
    expect(m.plan).toBe(6);
    expect(m.amount).toBe(7);
    expect(m.expiry).toBe(8);

    const hindi = guessColumns(['नाम', 'मोबाइल', 'पता', 'जन्म तिथि', 'फीस']);
    expect(hindi.fullName).toBe(0);
    expect(hindi.phone).toBe(1);
    expect(hindi.address).toBe(2);
    expect(hindi.dateOfBirth).toBe(3);
    expect(hindi.amount).toBe(4);
  });

  it('reads the common register variants', () => {
    const m = guessColumns(['Sr No', 'Member Name', 'Contact Number', 'Date of Joining', 'Date of Birth', 'End Date', 'Remarks', 'Time']);
    expect(m.fullName).toBe(1);
    expect(m.phone).toBe(2);
    expect(m.joinedOn).toBe(3);
    expect(m.dateOfBirth).toBe(4);
    expect(m.expiry).toBe(5);
    expect(m.notes).toBe(6);
    expect(m.batch).toBe(7);
  });

  it('prefers the longer, more specific word', () => {
    const m = guessColumns(['Name', 'Plan Expiry Date', 'Plan', 'Package Amount', 'Joining Fees']);
    expect(m.expiry).toBe(1);
    expect(m.plan).toBe(2);
    // 15 Oct 2026: "Package Amount" is the plan's price; "Joining Fees" what was paid.
    expect(m.total).toBe(3);
    expect(m.amount).toBe(4);
    // "Joining Fees" is money, never the joining date.
    expect(m.joinedOn).toBeNull();
  });

  it('does not take a generic word inside a longer header', () => {
    const m = guessColumns(['Member ID', 'Receipt Number', 'Admission No', 'Payment Date']);
    expect(m.fullName).toBeNull();
    expect(m.phone).toBeNull();
    expect(m.joinedOn).toBeNull();
    expect(m.amount).toBeNull();
  });

  it('gives each column one field and each field one column', () => {
    const m = guessColumns(['Mobile', 'Phone', 'Name', 'Naam']);
    expect(m.phone).toBe(0);
    expect(m.fullName).toBe(2);
    const cols = Object.values(m).filter((v) => v !== null);
    expect(new Set(cols).size).toBe(cols.length);
  });

  it('recognises its own sample file', () => {
    const m = guessColumns(templateHeaders());
    expect(m).toMatchObject({ fullName: 0, phone: 1, joinedOn: 2, gender: 3, dateOfBirth: 4, address: 5, batch: 6, plan: 7, amount: 8, expiry: 9, notes: 10 });
  });
});

describe('findHeaderRow', () => {
  it('skips a title line above the column names', () => {
    const rows = [['Iron Temple Gym — Members 2026'], [], ['S.No', 'Name', 'Mobile', 'DOJ'], ['1', 'Riya', '9876543210', '15/08/2026']];
    expect(findHeaderRow(rows)).toBe(2);
  });
  it('falls back to the first row', () => {
    expect(findHeaderRow([['a', 'b'], ['c', 'd']])).toBe(0);
  });
});

describe('dates', () => {
  it('reads Excel date numbers, including after the fake 1900 leap day', () => {
    expect(excelSerialToISO(45519)).toBe('2024-08-15');
    expect(excelSerialToISO(1)).toBe('1900-01-01');
    expect(excelSerialToISO(61)).toBe('1900-03-01');
    expect(excelSerialToISO(60)).toBeNull();
    expect(excelSerialToISO(0)).toBeNull();
    expect(parseSheetDate(45519, TODAY)).toBe('2024-08-15');
    // Text is never a date number: only a real number cell is.
    expect(parseSheetDate('45519', TODAY)).toBeNull();
  });

  it('reads Indian day-first dates in every common spelling', () => {
    expect(parseSheetDate('15/08/2026', TODAY)).toBe('2026-08-15');
    expect(parseSheetDate('15-08-26', TODAY)).toBe('2026-08-15');
    expect(parseSheetDate('5.8.2026', TODAY)).toBe('2026-08-05');
    expect(parseSheetDate('05/08/2026', TODAY)).toBe('2026-08-05');
    expect(parseSheetDate('15-Aug-2026', TODAY)).toBe('2026-08-15');
    expect(parseSheetDate('15 August 2026', TODAY)).toBe('2026-08-15');
    expect(parseSheetDate('15th Aug, 26', TODAY)).toBe('2026-08-15');
    expect(parseSheetDate('Aug 15, 2026', TODAY)).toBe('2026-08-15');
    expect(parseSheetDate('2026-08-15', TODAY)).toBe('2026-08-15');
    expect(parseSheetDate('2026-08-15 00:00:00', TODAY)).toBe('2026-08-15');
    expect(parseSheetDate('15082026', TODAY)).toBe('2026-08-15');
    expect(parseSheetDate('20260815', TODAY)).toBe('2026-08-15');
  });

  it('reads a Date cell by its UTC day (how the spreadsheet library builds it)', () => {
    expect(parseSheetDate(new Date(Date.UTC(2026, 7, 15)), TODAY)).toBe('2026-08-15');
    expect(cellText(new Date(Date.UTC(1995, 0, 1)))).toBe('1995-01-01');
  });

  it('refuses impossible dates instead of rolling them over', () => {
    expect(parseSheetDate('31/02/2026', TODAY)).toBeNull();
    expect(parseSheetDate('15/13/2026', TODAY)).toBeNull();
    expect(parseSheetDate('soon', TODAY)).toBeNull();
    expect(parseSheetDate('', TODAY)).toBeNull();
    expect(parseSheetDate('32 Aug 2026', TODAY)).toBeNull();
  });

  it('turns two-digit years into this century unless that is far in the future', () => {
    expect(fullYear(26, 2026)).toBe(2026);
    expect(fullYear(36, 2026)).toBe(2036);
    expect(fullYear(95, 2026)).toBe(1995);
    expect(parseSheetDate('01/01/90', TODAY)).toBe('1990-01-01');
  });

  it('notices a column written month-first', () => {
    expect(detectDayFirst(['15/08/2026', '01/02/2026'])).toBe(true);
    expect(detectDayFirst(['08/15/2026', '01/02/2026'])).toBe(false);
    expect(detectDayFirst(['01/02/2026'])).toBe(true);
    expect(detectDayFirst([45519, null])).toBe(true);
    expect(parseSheetDate('08/15/2026', TODAY, false)).toBe('2026-08-15');
  });
});

describe('parseImportPhone', () => {
  it('reads Indian mobiles however they are written', () => {
    for (const raw of ['9876543210', 9876543210, '98765 43210', '+91 98765-43210', '919876543210', '09876543210', '0091 9876543210', '(+91) 98765 43210']) {
      expect(parseImportPhone(raw)).toEqual({ ok: true, e164: '+919876543210', extra: null });
    }
  });
  it('keeps a real 91-series mobile', () => {
    expect(parseImportPhone('9198765432')).toMatchObject({ ok: true, e164: '+919198765432' });
  });
  it('reads a foreign number written with its code', () => {
    expect(parseImportPhone('+971 50 123 4567')).toMatchObject({ ok: true, e164: '+971501234567' });
  });
  it('keeps the first of two numbers and hands back the other', () => {
    expect(parseImportPhone('98765 43210 / 94140 54321')).toEqual({ ok: true, e164: '+919876543210', extra: '94140 54321' });
  });
  it('says why a number is unusable', () => {
    expect(parseImportPhone('')).toEqual({ ok: false, why: 'missing' });
    expect(parseImportPhone('9.87654E+09')).toEqual({ ok: false, why: 'shortened' });
    expect(parseImportPhone('12345')).toEqual({ ok: false, why: 'invalid' });
    expect(parseImportPhone('5876543210')).toEqual({ ok: false, why: 'invalid' });
  });
});

describe('parseGender', () => {
  it('maps the usual words', () => {
    expect(parseGender('M')).toBe('male');
    expect(parseGender('Male')).toBe('male');
    expect(parseGender('ladka')).toBe('male');
    expect(parseGender('F')).toBe('female');
    expect(parseGender('Mahila')).toBe('female');
    expect(parseGender('महिला')).toBe('female');
    expect(parseGender('Other')).toBe('other');
    expect(parseGender('')).toBeNull();
    expect(parseGender('xyz')).toBe('unknown');
  });
});

describe('CSV and files', () => {
  it('parses quotes, doubled quotes, line breaks and CRLF', () => {
    const text = '﻿Name,Notes\r\n"Sharma, Riya","said ""hi""\nthen left"\r\nAmit,\r\n';
    expect(parseCsv(text)).toEqual([
      ['Name', 'Notes'],
      ['Sharma, Riya', 'said "hi"\nthen left'],
      ['Amit', ''],
    ]);
  });
  it('detects a semicolon or tab separator', () => {
    expect(parseCsv('Name;Mobile\nRiya;9876543210')).toEqual([['Name', 'Mobile'], ['Riya', '9876543210']]);
    expect(parseCsv('Name\tMobile\nRiya\t9876543210')).toEqual([['Name', 'Mobile'], ['Riya', '9876543210']]);
  });
  it('decodes UTF-8, and falls back to the Windows code page', () => {
    expect(decodeCsvBytes(new TextEncoder().encode('Naam,नाम'))).toBe('Naam,नाम');
    expect(decodeCsvBytes(new Uint8Array([0x52, 0xe9, 0x6d, 0x79]))).toBe('Rémy');
  });
  it('sniffs a file by its first bytes, then its name', () => {
    expect(sniffFile('members.xlsx', new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('xlsx');
    expect(sniffFile('members.xlsx.csv', new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('xlsx');
    expect(sniffFile('old.xls', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe('xls');
    expect(sniffFile('export.xls', new Uint8Array([0x4e, 0x61]))).toBe('csv');
    expect(sniffFile('list.CSV', new Uint8Array([0x4e, 0x61]))).toBe('csv');
    expect(sniffFile('photo.jpg', new Uint8Array([0xff, 0xd8]))).toBe('unknown');
  });
  it('names columns like Excel', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
  });
  it('makes a sample file with headers only', () => {
    const csv = templateCsv();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')).toHaveLength(1);
    expect(csv).toContain('Name,Mobile,Joining date');
  });
});

// ---------------------------------------------------------------- the plan

const HEAD = ['Name', 'Mobile', 'Joining date', 'Gender', 'DOB', 'Batch', 'Plan', 'Fees', 'Valid till', 'Notes'];

function plan(rows: unknown[][], roster = [] as ReturnType<typeof makeMember>[], map?: ColumnMap) {
  const all = [HEAD, ...rows];
  return planImport(all, 0, map ?? guessColumns(HEAD), roster, TODAY);
}

describe('digits typed as a date', () => {
  it('a number cell is an Excel date number only from 20000 to 60000', () => {
    expect(parseSheetDate(20000, TODAY)).toBe('1954-10-03');
    expect(parseSheetDate(60000, TODAY)).toBe('2064-04-08');
    // 150826 typed into a number cell: not a date number (that read as the year 2312), not a date.
    expect(parseSheetDate(150826, TODAY)).toBeNull();
    expect(parseSheetDate('150826', TODAY)).toBeNull();
    expect(parseSheetDate(19999, TODAY)).toBeNull();
    expect(parseSheetDate(60001, TODAY)).toBeNull();
    expect(parseSheetDate(45519.5, TODAY)).toBe('2024-08-15');
    expect(parseSheetDate(150826.5, TODAY)).toBeNull();
  });

  it('8 digits are ddmmyyyy, as text or as a number cell (Excel drops the leading zero)', () => {
    expect(parseSheetDate('15082026', TODAY)).toBe('2026-08-15');
    expect(parseSheetDate(15082026, TODAY)).toBe('2026-08-15');
    expect(parseSheetDate(1082026, TODAY)).toBe('2026-08-01');
    expect(parseSheetDate('01082026', TODAY)).toBe('2026-08-01');
    expect(parseSheetDate(20260815, TODAY)).toBe('2026-08-15');
    expect(parseSheetDate('31132026', TODAY)).toBeNull();
  });

  it('a joining date typed as 150826 is a problem, never a member who joins in 2312', () => {
    const p = planImport([['Name', 'Mobile', 'DOJ'], ['Riya', '9876543210', 150826]], 0, guessColumns(['Name', 'Mobile', 'DOJ']), [], TODAY);
    expect(p.rows[0]!.status).toBe('problem');
    expect(p.rows[0]!.problems[0]).toBe('Joining date “150826” is not a date we can read. Write it like 15/08/2026.');
  });
});

describe('two-digit birthday years', () => {
  it("'27-'99 are the 1900s, '00-'26 the 2000s, and never a birthday ahead of today", () => {
    expect(pastYear(27, 2026)).toBe(1927);
    expect(pastYear(99, 2026)).toBe(1999);
    expect(pastYear(0, 2026)).toBe(2000);
    expect(pastYear(26, 2026)).toBe(2026);
    expect(parseSheetDate('01/01/27', TODAY, true, true)).toBe('1927-01-01');
    expect(parseSheetDate('01/01/05', TODAY, true, true)).toBe('2005-01-01');
    expect(parseSheetDate('15-Aug-95', TODAY, true, true)).toBe('1995-08-15');
    // '26 but after today: a century back, never a future birthday.
    expect(parseSheetDate('15/12/26', TODAY, true, true)).toBe('1926-12-15');
    expect(parseSheetDate('01/01/26', TODAY, true, true)).toBe('2026-01-01');
    // A joining date keeps the old rule ('27 is next year).
    expect(parseSheetDate('01/01/27', TODAY)).toBe('2027-01-01');
  });

  it('the plan reads a 2-digit birthday year as the past', () => {
    const p = plan([['Riya', '9876543210', '', '', '05/03/30']]);
    expect(p.rows[0]!.draft?.dateOfBirth).toBe('1930-03-05');
    expect(p.rows[0]!.warnings.some((w) => w.includes('Birthday'))).toBe(false);
  });
});

describe('saveInBatches', () => {
  const rowsFor = (n: number) =>
    plan(Array.from({ length: n }, (_, i) => [`Member ${i}`, String(6000000000 + i)])).rows;

  it('saves in batches with progress after each, one save per batch', async () => {
    const rows = rowsFor(7);
    const calls: number[] = [];
    const progress: number[] = [];
    const out = await saveInBatches(
      rows,
      async (drafts) => {
        calls.push(drafts.length);
        return drafts.map((d) => makeMember({ phone: d.phone }));
      },
      (n) => progress.push(n),
      3,
    );
    expect(calls).toEqual([3, 3, 1]);
    expect(progress).toEqual([3, 6, 7]);
    expect(out).toMatchObject({ duplicates: [], notSaved: [], stopped: null });
    expect(out.added).toHaveLength(7);
  });

  it('a mobile another desk added meanwhile: that row is set aside, the batch saved again without it', async () => {
    const rows = rowsFor(4);
    const taken = rows[1]!.draft!.phone;
    const out = await saveInBatches(rows, async (drafts) => {
      if (drafts.some((d) => d.phone === taken)) throw new DuplicatePhoneError(makeMember({ phone: taken }));
      return drafts.map((d) => makeMember({ phone: d.phone }));
    }, () => undefined);
    expect(out.duplicates.map((r) => r.rowNumber)).toEqual([rows[1]!.rowNumber]);
    expect(out.added).toHaveLength(3);
    expect(out.stopped).toBeNull();
  });

  it('no internet: stops, says which rows were saved, and the rest are not saved', async () => {
    const rows = rowsFor(7);
    let n = 0;
    const out = await saveInBatches(rows, async (drafts) => {
      n += 1;
      if (n === 2) throw new Error('No internet. Check the connection.');
      return drafts.map((d) => makeMember({ phone: d.phone }));
    }, () => undefined, 3);
    expect(out.added.map((r) => r.rowNumber)).toEqual(rows.slice(0, 3).map((r) => r.rowNumber));
    expect(out.notSaved).toHaveLength(4);
    expect(out.stopped).toBe('No internet. Check the connection.');
  });

  it('a batch the cloud split part-saved: the saved part counts as added', async () => {
    const rows = rowsFor(4);
    const out = await saveInBatches(rows, async (drafts) => {
      throw new PartialSaveError([makeMember({ phone: drafts[0]!.phone }), makeMember({ phone: drafts[1]!.phone })], new Error('Failed to fetch'));
    }, () => undefined);
    expect(out.added.map((r) => r.rowNumber)).toEqual([rows[0]!.rowNumber, rows[1]!.rowNumber]);
    expect(out.notSaved.map((r) => r.rowNumber)).toEqual([rows[2]!.rowNumber, rows[3]!.rowNumber]);
    expect(out.stopped).toBe('Failed to fetch');
  });
});

describe('planImport', () => {
  it('a joining date more than a year ahead is a problem; within a year, a warning', () => {
    const p = plan([['Riya', '9876543210', '01/01/2028'], ['Amit', '9876500001', '14/10/2027']]);
    expect(p.rows[0]!.status).toBe('problem');
    expect(p.rows[0]!.problems).toEqual(['Joining date 1 Jan 2028 is more than a year away. Check the year.']);
    expect(p.rows[1]!.status).toBe('add');
    expect(p.rows[1]!.warnings).toEqual(['Joining date 14 Oct 2027 is in the future.']);
  });

  it('turns a clean row into a member as valid as a typed one', () => {
    const p = plan([['  Riya   Sharma ', '98765 43210', '15/08/2026', 'F', '01/01/1995', 'morning 6-8', 'Monthly', '1,500', '14/09/2026', 'Knee pain']]);
    expect(p.counts).toEqual({ add: 1, duplicate: 0, problem: 0 });
    const r = p.rows[0]!;
    expect(r.rowNumber).toBe(2);
    expect(r.draft).toMatchObject({
      fullName: 'Riya Sharma',
      phone: '+919876543210',
      joinedOn: '2026-08-15',
      gender: 'female',
      dateOfBirth: '1995-01-01',
      batch: 'morning 6-8',
      archived: false,
      photoUri: null,
    });
    // Plan, fees and expiry are kept as words, never turned into a sale.
    // 15 Oct 2026 (data migration): the plan with its end date is a real membership and receipt now,
    // not a line in the notes.
    expect(r.draft!.notes).toBe('Knee pain');
    expect(r.term).toMatchObject({ planName: 'Monthly', startsOn: '2026-08-15', endsOn: '2026-09-14', priceP: 150000, paidP: 150000, length: { unit: 'month', count: 1 } });
    expect(rowVerdict(r)).toBe('Will be added');
  });

  it('names every problem in plain words', () => {
    const p = plan([
      ['', '9876543210'],
      ['Amit', ''],
      ['Amit', '12345'],
      ['Amit', '9.87654E+09'],
      ['Amit', '9876500001', 'next week'],
      ['Amit', '9876500002', '15/08/1990'],
    ]);
    expect(p.counts.problem).toBe(6);
    expect(p.rows.map((r) => r.problems[0])).toEqual([
      'No name.',
      'No mobile number.',
      'Mobile “12345” is not a 10-digit number.',
      'Mobile “9.87654E+09” was shortened by Excel. Set that column to Text in Excel and save again.',
      'Joining date “next week” is not a date we can read. Write it like 15/08/2026.',
      'Joining date 15 Aug 1990 looks wrong. Check the year.',
    ]);
    expect(skipReason(p.rows[0]!)).toBe('No name.');
    // A row is shown by its own name, even when it cannot be added.
    expect(p.rows[1]!.name).toBe('Amit');
  });

  it('lists every problem on a row, not just the first', () => {
    const p = plan([['', '123']]);
    expect(p.rows[0]!.problems).toHaveLength(2);
  });

  it('uses the add-member rules (a one-letter name is refused)', () => {
    const p = plan([['A', '9876543210']]);
    expect(p.rows[0]!.status).toBe('problem');
    expect(p.rows[0]!.problems).toEqual(['Type the member’s name.']);
  });

  it('adds with a warning, never a skip, for optional fields it cannot read', () => {
    const p = plan([['Riya', '9876543210', '', 'xyz', 'someday', '', '', '', '', '']]);
    const r = p.rows[0]!;
    expect(r.status).toBe('add');
    expect(r.draft).toMatchObject({ joinedOn: TODAY, gender: null, dateOfBirth: null });
    expect(r.warnings).toEqual([
      'No joining date. Today’s date is used.',
      'Birthday “someday” can’t be read. Left blank.',
      'Gender “xyz” can’t be read. Left blank.',
    ]);
  });

  it('leaves out a future birthday, and warns on a future joining date', () => {
    const p = plan([['Riya', '9876543210', '01/01/2027', '', '01/01/2030']]);
    const r = p.rows[0]!;
    expect(r.status).toBe('add');
    expect(r.draft).toMatchObject({ joinedOn: '2027-01-01', dateOfBirth: null });
    expect(r.warnings).toHaveLength(2);
  });

  it('catches the same mobile twice in one file', () => {
    const p = plan([
      ['Riya', '9876543210'],
      ['Riya S', '+91 98765 43210'],
    ]);
    expect(p.counts).toEqual({ add: 1, duplicate: 1, problem: 0 });
    expect(p.rows[1]!.sameAsRow).toBe(2);
    expect(rowVerdict(p.rows[1]!)).toBe('Same mobile as row 2 — skipped');
  });

  it('a broken first row does not block a good later row with the same mobile', () => {
    const p = plan([
      ['', '9876543210'],
      ['Riya', '9876543210'],
    ]);
    expect(p.rows.map((r) => r.status)).toEqual(['problem', 'add']);
  });

  it('catches members already in the gym, archived ones included', () => {
    const riya = makeMember({ fullName: 'Riya Sharma', phone: '+919876543210' });
    const old = makeMember({ fullName: 'Old Amit', phone: '+919876500001', archived: true });
    const p = plan([
      ['Riya', '9876543210'],
      ['Amit', '9876500001'],
      ['New', '9876500002'],
    ], [riya, old]);
    expect(p.counts).toEqual({ add: 1, duplicate: 2, problem: 0 });
    expect(p.rows[0]!.existing?.id).toBe(riya.id);
    expect(rowVerdict(p.rows[0]!)).toBe('Already a member (Riya Sharma)');
    expect(rowVerdict(p.rows[1]!)).toBe('Already a member (Old Amit, archived)');
  });

  it('uses the gym’s own spelling of a batch', () => {
    const p = plan([['Riya', '9876543210', '', '', '', 'MORNING 6-8'], ['Amit', '9876500001', '', '', '', 'morning   6-8']], [
      makeMember({ phone: '+919000000000', batch: 'Morning 6-8' }),
    ]);
    expect(p.rows.map((r) => r.draft?.batch)).toEqual(['Morning 6-8', 'Morning 6-8']);
  });

  it('skips blank rows and counts Excel row numbers from the header', () => {
    const p = planImport([['Title'], HEAD, ['Riya', '9876543210'], ['', ''], ['Amit', '9876500001']], 1, guessColumns(HEAD), [], TODAY);
    expect(p.rows.map((r) => r.rowNumber)).toEqual([3, 5]);
  });

  it('reads a month-first date column the right way round', () => {
    const p = plan([['Riya', '9876543210', '08/15/2026'], ['Amit', '9876500001', '02/01/2026']]);
    expect(p.rows.map((r) => r.draft?.joinedOn)).toEqual(['2026-08-15', '2026-02-01']);
  });

  it('works with columns picked by hand', () => {
    const map = { ...emptyColumnMap(), fullName: 1, phone: 0 };
    const p = planImport([['x', 'y'], ['9876543210', 'Riya']], 0, map, [], TODAY);
    expect(p.rows[0]!.draft).toMatchObject({ fullName: 'Riya', phone: '+919876543210', joinedOn: TODAY });
    expect(p.rows[0]!.warnings).toEqual([]);
  });

  it('stops at the row limit and says how many were left out', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 3 }, (_, i) => [`Member ${i}`, String(6000000000 + i)]);
    const p = plan(rows);
    expect(p.rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(p.leftOut).toBe(3);
  });
});

describe('fillBlanksPatch', () => {
  it('fills only what the member has blank, never name, mobile or joining date', () => {
    const existing = makeMember({ fullName: 'Riya Sharma', email: 'r@x.in', gender: null, address: null, batch: null, notes: 'VIP' });
    const p = plan([['Riya S', '9876543210', '01/01/2026', 'F', '01/01/1995', 'Evening']], [existing]);
    const patch = fillBlanksPatch(existing, p.rows[0]!.draft!);
    expect(patch).toEqual({ gender: 'female', dateOfBirth: '1995-01-01', batch: 'Evening' });
  });
  it('is empty when there is nothing new', () => {
    const existing = makeMember();
    const p = plan([['Riya', '9876543210']], [existing]);
    expect(fillBlanksPatch(existing, p.rows[0]!.draft!)).toEqual({});
  });
});

describe('skippedRowsCsv', () => {
  it('puts the row number and reason first, then the row as it was', () => {
    const p = plan([['', '9876543210', '=cmd']]);
    const csv = skippedRowsCsv(HEAD, p.rows.map((row) => ({ row, reason: skipReason(row) })));
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Row,Why skipped,Name,Mobile,Joining date,Gender,DOB,Batch,Plan,Fees,Valid till,Notes');
    expect(lines[1]!.startsWith('2,')).toBe(true);
    // The formula guard still applies to cells copied back out.
    expect(lines[1]).toContain(`"'=cmd"`);
  });
});

describe('who may import', () => {
  it('owner and Staff may both open the import page', () => {
    expect(canOpen('owner', '/members/import')).toBe(true);
    expect(canOpen('staff', '/members/import')).toBe(true);
  });
});

describe('R-67: a title in front of a name is left out (the member app checks the first name)', () => {
  it('Mr, Mrs, Smt, Shri, Kumari, Dr, with or without a dot; never a real name', async () => {
    const { withoutTitle } = await import('../../src/crm/logic/members');
    expect(withoutTitle('Mr. Ramesh Gupta')).toBe('Ramesh Gupta');
    expect(withoutTitle('MRS sunita  gupta')).toBe('sunita gupta');
    expect(withoutTitle('Smt. Kamla Devi')).toBe('Kamla Devi');
    expect(withoutTitle('Dr.Anil Mehta')).toBe('Anil Mehta');
    expect(withoutTitle('Shri Mohan Lal')).toBe('Mohan Lal');
    // Real names that start like a title stay whole.
    expect(withoutTitle('Mridul Jain')).toBe('Mridul Jain');
    expect(withoutTitle('Sri Lakshmi')).toBe('Sri Lakshmi');
    expect(withoutTitle('Drishti Rao')).toBe('Drishti Rao');
    // A title alone is all there is: kept.
    expect(withoutTitle('Mr.')).toBe('Mr.');
  });

  it('the same person with and without a title', async () => {
    const { samePersonName } = await import('../../src/crm/logic/importMembers');
    expect(samePersonName('Mr. Ramesh Gupta', 'Ramesh')).toBe(true);
    expect(samePersonName('Mr. Ramesh Gupta', 'Mr. Suresh Gupta')).toBe(false);
  });
});
