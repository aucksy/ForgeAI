/**
 * Tracker #36 (24 Oct 2026): "an AI import that never fails". Made-up sheets in the shapes Indian
 * gyms really bring (a GGMS export, a register typed by hand, Hindi and Hinglish headers, a title
 * and group row above the header, dates five ways, messy mobiles, fees with ₹ / Rs. / "/-", a totals
 * row, duplicates, extra columns), read from COMMITTED files (fixtures/import/) and run through the
 * same steps as the import screen: header row, column guesses (logic/importGuess.ts), every other
 * column kept as a detail, then the row-by-row plan. Every name and number here is invented.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { AI_WORDS, aiAnswer, applyAiPicks, findIdColumns } from '../../src/crm/logic/aiImport';
import { guessSheet, sheetExtras, sheetWidth } from '../../src/crm/logic/importGuess';
import {
  applyCellEdits,
  decodeCsvBytes,
  extrasOverCap,
  guessColumns,
  isRowNumberColumn,
  MAX_EXTRA_BYTES,
  MAX_EXTRAS,
  parseCsv,
  planImport,
  rowVerdict,
  skippedRowsCsv,
  skipReason,
  type Cell,
  type PlanOptions,
} from '../../src/crm/logic/importMembers';
import { readSheets } from '../../src/crm/logic/sheets';
import type { Member } from '../../src/crm/types';
import { makeMember } from './fixtures';

const TODAY = '2026-10-24';

function fixture(name: string): string[][] {
  const path = fileURLToPath(new URL(`./fixtures/import/${name}`, import.meta.url));
  return parseCsv(decodeCsvBytes(new Uint8Array(readFileSync(path))));
}

/** What the screen does with a picked sheet, before the owner changes anything. */
function importSheet(rows: readonly (readonly unknown[])[], roster: readonly Member[] = [], branches?: PlanOptions['branches'], match: ((t: string) => string | null) | null = null) {
  const { headerRow, map } = guessSheet(rows, TODAY, match);
  const idCols = findIdColumns(rows, headerRow, sheetWidth(rows)).map((c) => c.col);
  const extras = sheetExtras(rows, headerRow, map, idCols);
  const plan = planImport(rows, headerRow, map, roster, TODAY, { extras, idCols, branches });
  const byName = (name: string) => plan.rows.find((r) => (r.draft?.fullName ?? r.name) === name);
  return { headerRow, map, idCols, extras, plan, byName };
}

describe('a GGMS-style export (Sr. No., Member ID, Package, Amount / Paid / Balance, Trainer, Status)', () => {
  const { headerRow, map, extras, plan, byName } = importSheet(fixture('ggms-export.csv'));

  it('finds the real header under the report title and the date range', () => {
    expect(headerRow).toBe(2);
    expect(map).toMatchObject({ fullName: 2, gender: 3, phone: 4, email: 5, dateOfBirth: 6, plan: 7, joinedOn: 8, startDate: 9, expiry: 10, total: 11, amount: 13, due: 14 });
  });

  it('"Amount" beside "Paid" is the plan price; the discount comes out of the price', () => {
    const aarav = byName('Aarav Testwala')!;
    expect(aarav.status).toBe('add');
    expect(aarav.draft).toMatchObject({ phone: '+919876500101', gender: 'male', dateOfBirth: '1995-03-12', joinedOn: '2025-01-05', email: 'aarav.test@example.com' });
    expect(aarav.term).toMatchObject({ planName: '3 Months', startsOn: '2026-08-01', endsOn: '2026-10-31', priceP: 400000, paidP: 300000 });
    expect(byName('Chirag Fakely')!.term).toMatchObject({ planName: 'Annual', startsOn: '2026-06-01', endsOn: '2027-05-31', paidP: 1100000 });
  });

  it('keeps Member ID, Discount, Payment Mode, Trainer and Status as details; Sr. No. is only row numbers', () => {
    const on = extras.filter((e) => e.on).map((e) => e.label);
    expect(on).toEqual(['Member ID', 'Discount', 'Payment Mode', 'Trainer', 'Status']);
    expect(extras.find((e) => e.label === 'Sr. No.')).toMatchObject({ on: false, rowNumbers: true });
    expect(byName('Aarav Testwala')!.draft!.extra).toEqual({ 'Member ID': 'GM1001', Discount: '500', 'Payment Mode': 'UPI', Trainer: 'Coach Demo', Status: 'Active' });
    expect(byName('Bhavna Sampleton')!.draft!.extra).toEqual({ 'Member ID': 'GM1002', Discount: '0', 'Payment Mode': 'Cash', Status: 'Active' });
  });

  it('the member with no mobile goes to "Rows to check"; the totals row is not a member', () => {
    expect(plan.counts).toEqual({ add: 4, duplicate: 0, problem: 1 });
    expect(byName('Eshan Notreal')).toMatchObject({ status: 'problem', problems: ['No mobile number.'] });
    expect(plan.notMembers).toEqual([{ rowNumber: 10, why: 'total' }]);
    expect(plan.rows.some((r) => r.name === 'Total')).toBe(false);
  });
});

describe('a register typed into Excel by hand', () => {
  const { map, extras, plan, byName } = importSheet(fixture('register-handtyped.csv'));

  it('reads headers with stray spaces and any case', () => {
    expect(map).toMatchObject({ fullName: 1, phone: 2, joinedOn: 3, amount: 4, notes: 5 });
    expect(extras.find((e) => e.col === 0)).toMatchObject({ on: false, rowNumbers: true });
  });

  it('tidies the names, keeps blank cells blank and takes a title off the name', () => {
    expect(byName('ramesh KUMAR test')!.draft).toMatchObject({ phone: '+919876500201', joinedOn: '2026-08-01', notes: 'morning batch\nFrom Excel — Fees: ₹1,500' });
    const sunita = byName('SUNITA devi test')!;
    expect(sunita.draft!.joinedOn).toBe(TODAY);
    expect(sunita.warnings).toContain('No joining date. Today’s date is used.');
    expect(byName('ajay sample')!.draft!.joinedOn).toBe('2026-09-03');
    expect(byName('ajay sample')!.warnings).toContain('"mr." left out of the name.');
    expect(byName('Kavita Example')!.draft).toMatchObject({ phone: '+919876500204', joinedOn: '2026-09-15' });
  });

  it('empty rows in the middle are skipped, and rows with only a number are left out by name', () => {
    expect(plan.rows).toHaveLength(4);
    expect(plan.counts).toEqual({ add: 4, duplicate: 0, problem: 0 });
    expect(plan.notMembers).toEqual([
      { rowNumber: 4, why: 'stray' },
      { rowNumber: 9, why: 'stray' },
      { rowNumber: 10, why: 'stray' },
      { rowNumber: 11, why: 'stray' },
    ]);
  });
});

describe('Hindi headers', () => {
  const { map, plan, byName } = importSheet(fixture('hindi-headers.csv'));

  it('reads नाम, मोबाइल, लिंग, पता, जॉइनिंग, फीस, समाप्ति', () => {
    expect(map).toMatchObject({ fullName: 1, phone: 2, gender: 3, address: 4, joinedOn: 5, amount: 6, expiry: 7 });
    expect(plan.counts.add).toBe(3);
  });

  it('brings each member with a plan from the joining date to the end date', () => {
    const ramesh = byName('रमेश परीक्षण')!;
    expect(ramesh.draft).toMatchObject({ phone: '+919876500301', gender: 'male', address: 'वैशाली नगर, जयपुर', joinedOn: '2026-09-01' });
    expect(ramesh.term).toMatchObject({ startsOn: '2026-09-01', endsOn: '2026-09-30', paidP: 150000 });
    expect(byName('सुनीता नमूना')!.draft!.gender).toBe('female');
    // क्रमांक only numbers the rows: not kept.
    expect(ramesh.draft!.extra).toBeUndefined();
  });
});

describe('Hinglish headers', () => {
  const { map, plan, byName } = importSheet(fixture('hinglish-headers.csv'));

  it('reads Member ka naam, Mob No, Ling, Pata, Bharti, Shulk, Baaki, Khatam, Batch timing', () => {
    expect(map).toMatchObject({ fullName: 1, phone: 2, gender: 3, address: 4, joinedOn: 5, plan: 6, amount: 7, due: 8, expiry: 9, batch: 10 });
    expect(plan.counts.add).toBe(2);
  });

  it('a "Mahina" plan is one month; paid + baaki is the price', () => {
    const rohit = byName('Rohit Testkumar')!;
    expect(rohit.draft).toMatchObject({ gender: 'male', batch: 'Subah 6-7', joinedOn: '2026-10-05' });
    expect(rohit.term).toMatchObject({ planName: 'Mahina', startsOn: '2026-10-05', endsOn: '2026-11-04', priceP: 150000, paidP: 100000 });
    expect(byName('Pooja Namoona')!.term).toMatchObject({ planName: 'Teen Mahine', length: { unit: 'month', count: 3 }, paidP: 300000 });
  });
});

describe('a title row and a group row above the real header', () => {
  const { headerRow, map, plan } = importSheet(fixture('two-row-header.csv'));

  it('skips "RAM\'S GYM MEMBER LIST 2026" and "Personal Details / Membership"', () => {
    expect(headerRow).toBe(2);
    expect(map).toMatchObject({ fullName: 1, phone: 2, gender: 3, plan: 4, startDate: 5, expiry: 6 });
    expect(plan.counts).toEqual({ add: 3, duplicate: 0, problem: 0 });
    expect(plan.rows.map((r) => r.draft!.fullName)).toEqual(['Test Member One', 'Test Member Two', 'Test Member Three']);
    expect(plan.rows[1]!.term).toMatchObject({ planName: 'Quarterly', startsOn: '2026-09-01', endsOn: '2026-11-30' });
    // No joining column: each member joins on their plan's start.
    expect(plan.rows[1]!.draft!.joinedOn).toBe('2026-09-01');
  });
});

describe('dates written five ways, Excel date numbers, and a month-first sheet', () => {
  it('15/08/2026, 15-08-26, 15-Aug-2026, 2026-08-15 and "15 August 2026" are all 15 Aug 2026', () => {
    const { plan } = importSheet(fixture('dates-five-formats.csv'));
    const good = plan.rows.filter((r) => r.status === 'add');
    expect(good).toHaveLength(5);
    for (const r of good) {
      expect(r.draft!.joinedOn).toBe('2026-08-15');
      expect(r.term).toMatchObject({ startsOn: '2026-08-15', endsOn: '2026-09-14' });
    }
  });

  it('a date that is not real (31 Feb) waits in "Rows to check"; fixed there, it goes in', () => {
    const rows = fixture('dates-five-formats.csv');
    const { plan } = importSheet(rows);
    const six = plan.rows.find((r) => r.name === 'Date Test Six')!;
    expect(six.status).toBe('problem');
    expect(six.problems).toEqual(['Joining date “31/02/2026” is not a date we can read. Write it like 15/08/2026.']);
    // The owner types 28/02/2026 into the row and taps "Check again".
    const fixed = applyCellEdits(rows, { [six.rowNumber - 1]: { 2: '28/02/2026' } });
    const again = importSheet(fixed).plan.rows.find((r) => r.name === 'Date Test Six')!;
    expect(again.status).toBe('add');
    expect(again.draft!.joinedOn).toBe('2026-02-28');
    // The file itself is untouched.
    expect(rows[six.rowNumber - 1]![2]).toBe('31/02/2026');
  });

  it('Excel date numbers in an .xlsx (and real Excel dates) are read as the day they show', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Name', 'Mobile', 'Joining Date', 'Valid Till'],
        ['Serial One', '9876500611', 46249, 46279],
        ['Serial Two', 9876500612, 46310, 46340],
      ]),
      'Members',
    );
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const sheets = await readSheets('serials.xlsx', buf);
    if (sheets === 'unknown') throw new Error('not read');
    const { plan } = importSheet(sheets[0]!.rows as Cell[][]);
    expect(plan.rows.map((r) => [r.draft?.phone, r.draft?.joinedOn, r.term?.endsOn])).toEqual([
      ['+919876500611', '2026-08-15', '2026-09-14'],
      ['+919876500612', '2026-10-15', '2026-11-14'],
    ]);
  });

  it('a sheet saved month-first (12/25/2025) is read month-first, the unclear dates too', () => {
    const { plan } = importSheet(fixture('dates-month-first.csv'));
    expect(plan.rows.map((r) => [r.draft!.joinedOn, r.term?.endsOn ?? null])).toEqual([
      ['2025-12-25', '2026-01-24'],
      ['2026-08-15', '2026-09-14'],
      ['2026-02-01', '2026-03-01'],
    ]);
  });
});

describe('mobiles with +91, spaces, dashes and a leading 0', () => {
  const { map, plan, byName } = importSheet(fixture('phones-messy.csv'));

  it('every way of writing a mobile becomes +91 and 10 digits', () => {
    expect(map.phone).toBe(1);
    expect(byName('Phone Plus Ninety One')!.draft!.phone).toBe('+919876500801');
    expect(byName('Phone Leading Zero')!.draft!.phone).toBe('+919876500802');
    expect(byName('Phone Dashes')!.draft!.phone).toBe('+919876500803');
    expect(byName('Phone Plus Dash')!.draft!.phone).toBe('+919876500804');
    expect(byName('Phone Spaces')!.draft!.phone).toBe('+919876500808');
  });

  it('a second number goes into the notes, never lost', () => {
    const two = byName('Phone Two Numbers')!;
    expect(two.draft!.phone).toBe('+919876500805');
    expect(two.draft!.notes).toContain('Other number: 9700000806');
  });

  it('a short or Excel-shortened number waits in "Rows to check" with the reason', () => {
    expect(plan.counts).toEqual({ add: 6, duplicate: 0, problem: 2 });
    expect(byName('Phone Too Short')!.problems).toEqual(['Mobile “98765 0080” is not a 10-digit number.']);
    expect(byName('Phone Shortened')!.problems[0]).toMatch(/shortened by Excel/);
  });
});

describe('fees with ₹, "Rs.", commas, "/-" and "only"', () => {
  const { plan, byName } = importSheet(fixture('fees-rupees.csv'));

  it('each amount is read to the rupee and becomes the receipt', () => {
    expect(plan.rows.slice(0, 5).map((r) => r.term?.paidP)).toEqual([150000, 200000, 300000, 150000, 450000]);
    expect(byName('Fee INR')!.term).toMatchObject({ planName: '6 Months', endsOn: '2027-03-31' });
  });

  it('a fees cell that is not an amount is said on the row, and the member still goes in', () => {
    const bad = byName('Fee Bad')!;
    expect(bad.status).toBe('add');
    expect(bad.warnings).toContain('Fees paid “paid later” is not an amount we can read. Left out.');
    expect(bad.term?.paidP).toBe(0);
  });
});

describe('duplicates: the same mobile twice, a family on one mobile, and a member already in the gym', () => {
  const roster = [makeMember({ fullName: 'Dup Already Here', phone: '+919876501102' })];
  const { plan } = importSheet(fixture('duplicates.csv'), roster);
  const [first, renewal, wife, here, fresh] = plan.rows;

  it('the second row of the same person is their renewal, not a second member', () => {
    expect(first).toMatchObject({ status: 'add', rowNumber: 2 });
    expect(renewal).toMatchObject({ status: 'duplicate', sameAsRow: 2 });
    expect(renewal!.term).toMatchObject({ startsOn: '2026-10-01', endsOn: '2026-10-31' });
  });

  it('another name on the same mobile is caught and skipped, with the reason', () => {
    expect(wife).toMatchObject({ status: 'duplicate', sameAsRow: 2, term: null });
    expect(wife!.warnings).toContain('Row 2 has this mobile with another name. This row is skipped.');
  });

  it('a member already in the gym is found by mobile', () => {
    expect(here).toMatchObject({ status: 'duplicate', sameAsRow: null });
    expect(here!.existing!.fullName).toBe('Dup Already Here');
    expect(fresh).toMatchObject({ status: 'add' });
    expect(plan.counts).toEqual({ add: 2, duplicate: 3, problem: 0 });
  });
});

describe('a totals row at the bottom', () => {
  const { plan } = importSheet(fixture('totals-row.csv'));

  it('"TOTAL" and "Grand Total" with the sums are not members and not rows to check', () => {
    expect(plan.rows.map((r) => r.draft?.fullName)).toEqual(['Total Test One', 'Total Test Two', 'Total Test Three']);
    expect(plan.counts).toEqual({ add: 3, duplicate: 0, problem: 0 });
    expect(plan.notMembers).toEqual([
      { rowNumber: 6, why: 'total' },
      { rowNumber: 7, why: 'total' },
    ]);
  });
});

describe('extra columns: Locker No., Trainer, Blood Group, Emergency Contact and odd ones', () => {
  const { map, idCols, extras, plan } = importSheet(fixture('extra-columns.csv'));

  it('every column with no box is kept with its own name; the Aadhaar column is never imported', () => {
    expect(map).toMatchObject({ fullName: 1, phone: 2, amount: null });
    expect(idCols).toEqual([10]);
    expect(extras.filter((e) => e.on).map((e) => e.label)).toEqual([
      'Locker No.', 'Trainer', 'Blood Group', 'Emergency Contact', 'Height (cm)', 'Referred By', 'Diet Pref', 'PT (Y/N)', 'Goal',
    ]);
    const one = plan.rows[0]!.draft!.extra!;
    expect(one).toMatchObject({ 'Locker No.': '12', Trainer: 'Coach Demo', 'Blood Group': 'B+', 'Emergency Contact': '9700001301', 'Height (cm)': '172', 'Referred By': 'Friend', 'Diet Pref': 'Veg', 'PT (Y/N)': 'Y' });
    expect(JSON.stringify(plan.rows.map((r) => r.draft))).not.toMatch(/2345 ?6789/);
    expect(plan.rows[1]!.draft!.extra).toEqual({ 'Locker No.': 'B-3', 'Blood Group': 'O+', 'Emergency Contact': '9700001302', 'Height (cm)': '160', 'Diet Pref': 'Non-veg', 'PT (Y/N)': 'N' });
  });

  it('a value longer than 200 letters is cut, and the row says so', () => {
    const r = plan.rows[0]!;
    expect(r.draft!.extra!.Goal).toHaveLength(200);
    expect(r.warnings).toContain('“Goal” cut to 200 letters.');
  });
});

describe('the skipped-rows file', () => {
  it('lists every row that did not go in, with the reason first', () => {
    const rows = fixture('phones-messy.csv');
    const { plan } = importSheet(rows);
    const skipped = plan.rows.filter((r) => r.status === 'problem').map((row) => ({ row, reason: skipReason(row) }));
    const csv = skippedRowsCsv(rows[0]!, skipped);
    expect(csv).toContain('Row,Why skipped,Name,Phone');
    expect(csv).toContain('Phone Too Short');
    expect(csv).toContain('is not a 10-digit number');
  });
});

describe('nothing is dropped without a word', () => {
  it('a column the AI calls "not needed" is shown unticked with its own name; one tick brings it back', () => {
    const rows = fixture('extra-columns.csv');
    const { headerRow, map, idCols } = importSheet(rows);
    const headers = rows[headerRow]!;
    const applied = applyAiPicks(map, [{ column: 8, target: { ignore: true }, confidence: 0.9 }, { column: 9, target: { extra: 'Diet' }, confidence: 0.3 }], idCols, headers);
    expect(applied.extras[8]).toEqual({ label: 'Referred By', on: false, ai: true, aiIgnored: true });
    // Unsure of a NAME only: the column is still kept.
    expect(applied.extras[9]).toEqual({ label: 'Diet', on: true, ai: true });
    const extras = sheetExtras(rows, headerRow, map, idCols, applied.extras);
    expect(extras.find((e) => e.col === 8)).toMatchObject({ on: false, aiIgnored: true });
    const back = sheetExtras(rows, headerRow, map, idCols, { ...applied.extras, 8: { ...applied.extras[8]!, on: true } });
    const plan = planImport(rows, headerRow, map, [], TODAY, { extras: back, idCols });
    expect(plan.rows[0]!.draft!.extra).toMatchObject({ 'Referred By': 'Friend', Diet: 'Veg' });
  });

  it(`over ${MAX_EXTRAS} kept columns: the ones past it are named before the import`, () => {
    const many = Array.from({ length: MAX_EXTRAS + 2 }, (_, i) => ({ col: i + 2, label: `Detail ${i + 1}`, on: true, ai: false }));
    expect(extrasOverCap(many).map((e) => e.label)).toEqual([`Detail ${MAX_EXTRAS + 1}`, `Detail ${MAX_EXTRAS + 2}`]);
    expect(extrasOverCap(many.slice(0, MAX_EXTRAS))).toEqual([]);
  });

  it('a column of row numbers is found by its name, or by numbers that run 1, 2, 3', () => {
    expect(isRowNumberColumn([['Sr. No.', 'Name'], ['1', 'A']], 0, 0)).toBe(true);
    expect(isRowNumberColumn([['#', 'Name'], ['1', 'A']], 0, 0)).toBe(true);
    expect(isRowNumberColumn([['', 'Name'], ['1', 'A'], ['2', 'B'], ['3', 'C']], 0, 0)).toBe(true);
    expect(isRowNumberColumn([['', 'Name'], ['12', 'A'], ['B-3', 'B']], 0, 0)).toBe(false);
    expect(isRowNumberColumn([['Locker No.', 'Name'], ['1', 'A'], ['2', 'B']], 0, 0)).toBe(false);
  });

  it('a member with too many long details keeps what fits under the server limit, and the row says so', () => {
    const long = 'क'.repeat(190); // Hindi letters take 3 bytes each
    const head = ['Name', 'Mobile', ...Array.from({ length: 30 }, (_, i) => `Note col ${i + 1}`)];
    const rows = [head, ['Big Test', '9876509901', ...Array.from({ length: 30 }, () => long)]];
    const map = { ...guessColumns(head), notes: null };
    const extras = Array.from({ length: 30 }, (_, i) => ({ col: i + 2, label: `Note col ${i + 1}`, on: true, ai: false }));
    const r = planImport(rows, 0, map, [], TODAY, { extras }).rows[0]!;
    expect(r.status).toBe('add');
    const bytes = new TextEncoder().encode(JSON.stringify(r.draft!.extra)).length;
    expect(bytes).toBeLessThanOrEqual(MAX_EXTRA_BYTES);
    expect(Object.keys(r.draft!.extra!).length).toBeLessThan(30);
    expect(r.warnings.some((w) => /is not kept for this member/.test(w))).toBe(true);
  });

  it('a problem row says where to fix it, not that it is gone', () => {
    const { byName } = importSheet(fixture('phones-messy.csv'));
    expect(rowVerdict(byName('Phone Too Short')!)).toBe('Not added yet. See “Rows to check”');
  });
});

describe('the AI is down, over its limit or unsure: matching by hand always works', () => {
  it('every failure leaves our own rules in place, with one calm line', () => {
    for (const [status, body] of [[429, {}], [503, { reason: 'off' }], [503, { reason: 'unreachable' }], [500, {}], [401, {}], [403, {}]] as const) {
      const a = aiAnswer(status, body, 5);
      expect(a.ok).toBe(false);
    }
    expect(AI_WORDS.fallback).toBe('Matched without AI (it was not available). Check the columns below.');
  });

  it('an unsure AI fills nothing in; the owner picks every box by hand, Branch and details included', () => {
    const rows = fixture('ggms-export.csv');
    const { headerRow, map, idCols } = importSheet(rows);
    const unsure = applyAiPicks({ ...map, plan: null }, [{ column: 7, target: { field: 'plan' }, confidence: 0.45 }], idCols, rows[headerRow]!);
    expect(unsure.map.plan).toBeNull();
    expect(unsure.held).toEqual(['AI thinks Column H “Package” is “Plan” (not sure).']);
    // By hand: the owner points Plan at column H; Package is then read as before.
    const byHand = { ...unsure.map, plan: 7 };
    const plan = planImport(rows, headerRow, byHand, [], TODAY, { extras: sheetExtras(rows, headerRow, byHand, idCols), idCols });
    expect(plan.rows[0]!.term!.planName).toBe('3 Months');
  });
});

describe('#36 review: a "Paid" column is read by what is in it, never by its name alone', () => {
  it('Yes / No (and Hinglish): yes = paid in full, no = the whole fee is due; an odd word is said', () => {
    const { map, byName } = importSheet(fixture('paid-yes-no.csv'));
    expect(map).toMatchObject({ total: 5, amount: null, paidFlag: 6 });
    expect(byName('Yesha Paidfull')!.term).toMatchObject({ priceP: 150000, paidP: 150000 });
    expect(byName('Nikhil Notpaid')!.term).toMatchObject({ priceP: 400000, paidP: 0 });
    expect(byName('Haan Wala')!.term).toMatchObject({ paidP: 150000 });
    expect(byName('Blank Paid')!.term).toMatchObject({ priceP: 150000, paidP: 0 });
    expect(byName('Odd Paid')!.warnings).toContain('Paid “maybe” is not yes or no. Nothing is counted as paid for this row.');
  });

  it('ticks and crosses, with fees written ₹1500/- and Rs. 1,500', () => {
    const { map, byName } = importSheet(fixture('paid-ticks.csv'));
    expect(map).toMatchObject({ total: 5, amount: null, paidFlag: 6 });
    expect(byName('Tick One')!.term).toMatchObject({ priceP: 150000, paidP: 150000 });
    expect(byName('Cross One')!.term).toMatchObject({ priceP: 150000, paidP: 0 });
    expect(byName('Tick Two')!.term).toMatchObject({ priceP: 400000, paidP: 400000 });
  });

  it('a "Paid" column of Excel dates in an .xlsx is the payment date, never ₹46,296 paid', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Name', 'Mobile', 'Plan', 'Start Date', 'End Date', 'Amount', 'Paid'],
        ['Date Paid One', '9876500821', 'Monthly', '01/10/2026', '31/10/2026', 1500, 46296],
        ['Date Paid Two', '9876500822', 'Monthly', '02/10/2026', '01/11/2026', 1500, 46297],
      ]),
      'Members',
    );
    const sheets = await readSheets('paid-dates.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    if (sheets === 'unknown') throw new Error('not read');
    const { map, byName } = importSheet(sheets[0]!.rows as Cell[][]);
    expect(map).toMatchObject({ amount: 5, paidOn: 6, total: null, paidFlag: null });
    expect(byName('Date Paid One')!.term).toMatchObject({ paidP: 150000, paidOn: '2026-10-01' });
    expect(byName('Date Paid Two')!.term).toMatchObject({ paidP: 150000, paidOn: '2026-10-02' });
  });

  it('a "Paid" of money no more than the Amount on its row still makes Amount the price', () => {
    const rows = [
      ['Name', 'Mobile', 'Plan', 'Start Date', 'End Date', 'Amount', 'Paid'],
      ['Money One', '9876500831', 'Monthly', '01/10/2026', '31/10/2026', '1500', '1000'],
      ['Money Two', '9876500832', 'Monthly', '02/10/2026', '01/11/2026', '1500', '1500'],
    ];
    const { map, byName } = importSheet(rows);
    expect(map).toMatchObject({ total: 5, amount: 6 });
    expect(byName('Money One')!.term).toMatchObject({ priceP: 150000, paidP: 100000 });
  });
});
