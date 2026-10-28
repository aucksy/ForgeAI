/**
 * #47 AI import (23 Oct 2026): what the AI is shown (masked), how its answer is checked and used,
 * the gym's extra details, and Aadhaar / PAN numbers never coming in.
 */
import { describe, expect, it } from 'vitest';

import {
  AI_WORDS,
  aiAnswer,
  aiColumnsPayload,
  applyAiPicks,
  askAiForColumns,
  findIdColumns,
  freeColumns,
  hidePeople,
  idNamedColumns,
  isRealDate,
  maskCell,
  parseAiPicks,
} from '../../src/crm/logic/aiImport';
import { idColumnKind, isAadhaar, scrubIds, verhoeffValid } from '../../src/crm/logic/importIds';
import { emptyColumnMap, fillBlanksPatch, guessColumns, planImport, usableExtras, type ColumnMap } from '../../src/crm/logic/importMembers';
import { gymExportSheets } from '../../src/crm/logic/gymExport';
import { makeMember } from './fixtures';
import { emptySnapshot } from '../../src/crm/data/local';

const TODAY = '2026-10-23';
// Valid Verhoeff check digits (worked out, not real people's numbers).
const AADHAAR = '2345 6789 0124';
const AADHAAR_PLAIN = '234567890124';

function map(over: Partial<ColumnMap>): ColumnMap {
  return { ...emptyColumnMap(), ...over };
}

const SHEET = [
  ['Naam', 'Mob.', 'Locker', 'Aadhaar No.', 'Blood Grp', 'Remarks'],
  ['Ramesh Gupta', '98290 12345', '12', AADHAAR, 'B+', `Aadhaar ${AADHAAR_PLAIN} given`],
  ['Sita Devi', '9414054321', 'B-3', '', 'O+', ''],
  ['Mohan Lal', '9829050003', '', '3456 7890 1238', '', 'PAN ABCDE1234F'],
];

describe('Aadhaar and PAN', () => {
  it('Verhoeff check: a real-shaped Aadhaar passes, one wrong digit fails', () => {
    expect(verhoeffValid(AADHAAR_PLAIN)).toBe(true);
    expect(verhoeffValid('234567890123')).toBe(false);
    expect(isAadhaar(AADHAAR)).toBe(true);
    expect(isAadhaar('123456789012')).toBe(false); // never starts with 1
    expect(isAadhaar('919829012345')).toBe(false); // a +91 mobile written as 12 digits
    // Review of #47: "91" + a mobile is a mobile even when its last digit happens to pass the check.
    expect(verhoeffValid('919829012343')).toBe(true);
    expect(isAadhaar('919829012343')).toBe(false);
    expect(isAadhaar('9198 2901 2343')).toBe(true); // written 4-4-4 it is an Aadhaar
    expect(scrubIds('call +919829012343 or 919829012343').removed).toBe(false);
  });

  it('a column is ID numbers only by what is in it, never by its name alone', () => {
    expect(idColumnKind([AADHAAR, AADHAAR_PLAIN, ''])).toBe('aadhaar');
    expect(idColumnKind(['ABCDE1234F', 'PQRST6789Z'])).toBe('pan');
    expect(idColumnKind(['ABCDE1234F'])).toBe('pan');
    expect(idColumnKind(['', ''])).toBeNull();
    expect(idColumnKind(['Infosys', 'TCS'])).toBeNull();
    expect(idColumnKind(['9829012345', '9414054321'])).toBeNull();
    expect(idColumnKind(['919829012343', '919414054321'])).toBeNull(); // +91 mobiles, one passing the check
    expect(findIdColumns(SHEET, 0, 6)).toEqual([{ col: 3, kind: 'aadhaar' }]);
  });

  it('review of #47: a column only NAMED like an ID column imports normally (name, mobile, uid)', () => {
    const rows = [
      ['Name as per Aadhaar', 'Aadhaar linked mobile', 'Member UID'],
      ['Ramesh Gupta', '9829012345', 'M-001'],
      ['Sita Devi', '9414054321', 'M-002'],
    ];
    expect(findIdColumns(rows, 0, 3)).toEqual([]);
    expect(idNamedColumns(rows, 0, 3, [])).toEqual([0, 1, 2]);
    const guess = guessColumns(rows[0]!);
    expect(guess.fullName).toBe(0);
    expect(guess.phone).toBe(1);
    const plan = planImport(rows, 0, guess, [], TODAY, { idCols: [] });
    expect(plan.counts).toEqual({ add: 2, duplicate: 0, problem: 0 });
    expect(plan.rows[0]!.draft!.fullName).toBe('Ramesh Gupta');
    expect(plan.rows[0]!.draft!.phone).toBe('+919829012345');
  });

  it('an ID-number column picked by hand still comes in with the numbers cut out', () => {
    const plan = planImport(SHEET, 0, map({ fullName: 0, phone: 1, address: 3 }), [], TODAY, { idCols: [3] });
    expect(plan.rows[0]!.draft!.address).toBe('[ID number removed]');
    expect(plan.rows[0]!.warnings).toContain('An Aadhaar or PAN number was left out. ID numbers are never imported.');
    expect(plan.rows[1]!.draft!.address).toBeNull();
  });

  it('an ID number inside a note is cut out, and the row says so', () => {
    expect(scrubIds(`Aadhaar ${AADHAAR_PLAIN} given`)).toEqual({ text: 'Aadhaar [ID number removed] given', removed: true });
    expect(scrubIds('PAN ABCDE1234F').text).toBe('PAN [ID number removed]');
    expect(scrubIds('XXXX XXXX 0124 on file').removed).toBe(true);
    expect(scrubIds('Paid 1500 on 15/08/2026, call 9829012345').removed).toBe(false);
  });

  it('the import never brings an ID number in, whatever column it was pointed at', () => {
    const plan = planImport(SHEET, 0, map({ fullName: 0, phone: 1, notes: 3 }), [], TODAY, { idCols: [3] });
    for (const r of plan.rows) expect(JSON.stringify(r.draft)).not.toMatch(/\d{4} \d{4} \d{4}|ABCDE1234F|234567890124/);
    expect(plan.rows[0]!.draft!.notes).toBe('[ID number removed]');
    const notes = planImport(SHEET, 0, map({ fullName: 0, phone: 1, notes: 5 }), [], TODAY, { idCols: [3] });
    expect(notes.rows[0]!.draft!.notes).toBe('Aadhaar [ID number removed] given');
    expect(notes.rows[0]!.warnings).toContain('An Aadhaar or PAN number was left out. ID numbers are never imported.');
    expect(notes.rows[2]!.draft!.notes).toBe('PAN [ID number removed]');
    expect(notes.rows[1]!.warnings).toEqual([]);
  });
});

describe('what the AI is shown', () => {
  it('masks mobiles, Aadhaar, emails and PAN; keeps dates, money and names', () => {
    expect(maskCell('98290 12345')).toBe('98XXXXXX45');
    expect(maskCell(9829012345)).toBe('98XXXXXX45');
    expect(maskCell('+91-94140-54321')).toBe('91XXXXXXXX21');
    expect(maskCell(AADHAAR)).toBe('23XXXXXXXX24');
    expect(maskCell('ramesh@gmail.com')).toBe('[email]');
    expect(maskCell('ABCDE1234F')).toBe('[PAN]');
    expect(maskCell('15-08-2026')).toBe('15-08-2026');
    expect(maskCell(new Date(Date.UTC(2026, 7, 15)))).toBe('2026-08-15');
    expect(maskCell('Rs. 1,500/-')).toBe('Rs. 1,500/-');
    expect(maskCell('Ramesh Gupta')).toBe('Ramesh Gupta');
  });

  it('review of #47: digits in any script, any separator; only real dates are kept', () => {
    expect(maskCell('९८२९० १२३४५')).toBe('९८XXXXXX४५'); // Devanagari digits
    expect(maskCell('98765/43210')).toBe('98XXXXXX10');
    expect(maskCell('9876.54.3210')).toBe('98XXXXXX10');
    expect(maskCell('98.76.543210')).toBe('98XXXXXX10');
    expect(maskCell('15/08/2026')).toBe('15/08/2026');
    expect(maskCell('१५/०८/२०२६')).toBe('१५/०८/२०२६');
    expect(maskCell('2026-08-15')).toBe('2026-08-15');
    expect(maskCell('01-08-2026 - 31-10-2026')).toBe('01-08-2026 - 31-10-2026');
    expect(maskCell('31/02/2026')).toBe('31XXXX26'); // not a real day
    expect(isRealDate('12/25/2025')).toBe(true); // month-first
    expect(isRealDate('15.08.26')).toBe(true);
    expect(isRealDate('9876.54.3210')).toBe(false);
    expect(isRealDate('29/02/2025')).toBe(false);
  });

  it('only the column names and 5 example rows, masked; an ID column shows only that it is one', () => {
    const rows = [['Name', 'Mobile', 'Aadhaar'], ...Array.from({ length: 9 }, (_, i) => [`M ${i}`, `98290${String(10000 + i)}`, AADHAAR])];
    const cols = aiColumnsPayload(rows, 0, 3, [2]);
    expect(cols.map((c) => c.header)).toEqual(['Name', 'Mobile', 'Aadhaar']);
    // #59: a "Name" column goes as its shape only.
    expect(cols[0]!.examples).toEqual(Array(5).fill('[name]'));
    expect(cols[1]!.examples[0]).toBe('98XXXXXX00');
    expect(cols[2]!.examples).toEqual(Array(5).fill('[ID number]'));
    const sent = JSON.stringify(cols);
    expect(sent).not.toMatch(/\d{7}/);
    expect(sent).not.toContain('M 0');
    expect(sent).not.toContain('M 5');
  });
});

describe('#59 names and addresses are never sent to the AI (owner, 24 Oct 2026)', () => {
  const REGISTER = [
    ['Name', 'Member', 'Address', '', 'Plan', 'Fees', 'Joining Date', 'Gender', 'Batch', 'Paid'],
    ['Ramesh Gupta', 'Ravi Kumar', '12, MG Road, Jaipur', 'Sunil Jain', 'Monthly', '1500', '15-08-2026', 'Male', 'Morning 6-8', 'Yes'],
    ['Sita Devi', 'Anita Sharma', 'B-4 Shastri Nagar', 'Mohan Lal', 'Annual + PT', 'Rs. 12,000', '01/09/2026', 'Female', 'Ladies Batch', 'No'],
    ['Mohan Lal', '', '', 'Kavita Rao', 'Gold Membership', '', '', '', '', ''],
  ];
  const cols = aiColumnsPayload(REGISTER, 0, 10, []);

  it('a "Name" column, a "Member" column of names, an "Address" column and a names column with no header', () => {
    expect(cols[0]).toMatchObject({ header: 'Name', examples: ['[name]', '[name]', '[name]'] });
    expect(cols[1]).toMatchObject({ header: 'Member', examples: ['[name]', '[name]', ''] });
    expect(cols[2]).toMatchObject({ header: 'Address', examples: ['[address]', '[address]', ''] });
    expect(cols[3]).toMatchObject({ header: '', examples: ['[name]', '[name]', '[name]'] });
    const sent = JSON.stringify(cols);
    for (const who of ['Ramesh', 'Sita', 'Mohan', 'Ravi', 'Anita', 'Sunil', 'Kavita', 'MG Road', 'Shastri']) expect(sent).not.toContain(who);
  });

  it('a "Plan" column stays visible, and so do amounts, dates, gender, batch and yes / no', () => {
    expect(cols[4]).toMatchObject({ header: 'Plan', examples: ['Monthly', 'Annual + PT', 'Gold Membership'] });
    expect(cols[5]!.examples).toEqual(['1500', 'Rs. 12,000', '']);
    expect(cols[6]!.examples).toEqual(['15-08-2026', '01/09/2026', '']);
    expect(cols[7]!.examples).toEqual(['Male', 'Female', '']);
    expect(cols[8]!.examples).toEqual(['Morning 6-8', 'Ladies Batch', '']);
    expect(cols[9]!.examples).toEqual(['Yes', 'No', '']);
    // A plan column with no header is not taken for names.
    expect(hidePeople('', ['Monthly Plan', 'Quarterly', 'Half Yearly', 'Personal Training']).examples).toEqual(['Monthly Plan', 'Quarterly', 'Half Yearly', 'Personal Training']);
  });

  it('a sheet with no header row: the first member, sent as the "header", is hidden too', () => {
    const rows = [
      ['Anil Mehta', '9829050001', 'Monthly'],
      ['Ramesh Gupta', '9829050002', 'Quarterly'],
      ['Sita Devi', '9829050003', 'Monthly'],
    ];
    const sent = aiColumnsPayload(rows, 0, 3, []);
    expect(sent[0]).toMatchObject({ header: '[name]', examples: ['[name]', '[name]'] });
    expect(sent[2]).toMatchObject({ header: 'Monthly', examples: ['Quarterly', 'Monthly'] });
    expect(JSON.stringify(sent)).not.toMatch(/Anil|Ramesh|Sita/);
  });

  it('a column our own rules put in the name or address box is hidden whatever it looks like', () => {
    const rows = [['Who', 'Ghar'], ['Rahul', 'Jaipur'], ['Vikas', 'Ajmer']];
    expect(aiColumnsPayload(rows, 0, 2, []).map((c) => c.examples)).toEqual([['Rahul', 'Vikas'], ['Jaipur', 'Ajmer']]);
    expect(aiColumnsPayload(rows, 0, 2, [], { fullName: 0, address: 1 }).map((c) => c.examples)).toEqual([['[name]', '[name]'], ['[address]', '[address]']]);
  });

  it('the server twin (deploy/panel/aiMatch.js) hides exactly the same', async () => {
    const path = '../../../../deploy/panel/aiMatch.js';
    const panel = (await import(/* @vite-ignore */ path)) as { hidePeople: typeof hidePeople; checkRequest: (b: unknown) => { value: { columns: { header: string; examples: string[] }[] } } };
    const cases: [string, string[]][] = [
      ['Name', ['Ramesh Gupta', '', 'Sita']],
      ['Member', ['Ravi Kumar', 'Sita Devi']],
      ['Address', ['12, MG Road, Jaipur', 'B-4 Shastri Nagar']],
      ['', ['Ramesh Gupta', 'Sita Devi', 'R. K. Sharma']],
      ['Anil Mehta', ['Ramesh Gupta', 'Sita Devi']],
      ['Plan', ['Monthly', 'Annual + PT']],
      ['', ['Monthly Plan', 'Quarterly']],
      ['Referred By', ['Sunil Jain']],
      ['Member Since', ['15-08-2025']],
      ['नाम', ['राहुल शर्मा']],
      ['Name', ['[name]', '']],
      ['Trainer', ['Vikram Singh']],
    ];
    for (const [h, ex] of cases) expect(panel.hidePeople(h, ex), h).toEqual(hidePeople(h, ex));
    // And the server applies it to whatever the browser sends.
    expect(panel.checkRequest({ columns: [{ header: 'Name', examples: ['Ramesh Gupta'] }] }).value.columns[0]!.examples).toEqual(['[name]']);
  });

  it('says in one line, while it matches, that names and addresses are hidden too', () => {
    expect(AI_WORDS.privacy).toBe('Names, addresses, phone numbers, emails and ID numbers are hidden before anything is sent.');
  });
});

describe('the AI answer', () => {
  it('is held strictly to our field list; anything else is dropped', () => {
    const picks = parseAiPicks(
      {
        columns: [
          { column: 0, target: 'fullName', confidence: 0.9 },
          { column: 1, target: 'phone', confidence: 0.95 },
          { column: 2, target: 'extra:Locker No.', confidence: 0.8 },
          { column: 3, target: 'aadhaar', confidence: 0.9 },
          { column: 4, target: 'extra:<b>', confidence: 0.9 },
          { column: 5, target: 'notes', confidence: 2 },
          { column: 6, target: 'notes', confidence: 0.9 }, // no such column (width 6)
          { column: 0, target: 'email', confidence: 0.9 }, // second answer for column 0
          { column: 5, target: 'ignore', confidence: 0.7 },
        ],
      },
      6,
    );
    expect(picks).toEqual([
      { column: 0, target: { field: 'fullName' }, confidence: 0.9 },
      { column: 1, target: { field: 'phone' }, confidence: 0.95 },
      { column: 2, target: { extra: 'Locker No.' }, confidence: 0.8 },
      { column: 5, target: { ignore: true }, confidence: 0.7 },
    ]);
    expect(parseAiPicks('nonsense', 6)).toEqual([]);
    expect(parseAiPicks({ columns: 'x' }, 6)).toEqual([]);
  });

  it('fills only what our rules left empty, marks it AI, and only shows a guess that disagrees', () => {
    const headers = SHEET[0]!;
    // Our rules find Naam -> name and Mob. -> mobile on their own; Remarks is left for the AI here.
    const ours = { ...guessColumns(headers), notes: null };
    expect(ours.fullName).toBe(0);
    expect(ours.phone).toBe(1);
    const applied = applyAiPicks(
      ours,
      [
        { column: 0, target: { field: 'fullName' }, confidence: 0.99 }, // agrees
        { column: 5, target: { field: 'phone' }, confidence: 0.9 }, // disagrees with our rules: only shown
        { column: 5, target: { field: 'notes' }, confidence: 0.85 },
        { column: 2, target: { extra: 'Locker No.' }, confidence: 0.8 },
        { column: 4, target: { extra: 'Blood Group' }, confidence: 0.5 }, // unsure: its name suggested, the column kept (#36)
        { column: 3, target: { extra: 'Aadhaar' }, confidence: 0.9 }, // an ID column: never
      ],
      [3],
      headers,
    );
    expect(applied.map.phone).toBe(1);
    expect(applied.map.notes).toBe(5);
    expect(applied.aiFields).toEqual(['notes']);
    expect(applied.extras).toEqual({
      2: { label: 'Locker No.', on: true, ai: true },
      4: { label: 'Blood Group', on: true, ai: true }, // #36: unsure of the NAME only; the column is still kept
    });
    expect(applied.held).toEqual(['AI thinks Column F “Remarks” is “Mobile”.']); // shown, never applied
    const unsure = applyAiPicks(map({}), [{ column: 4, target: { field: 'batch' }, confidence: 0.45 }], [], headers);
    expect(unsure.map.batch).toBeNull();
    expect(unsure.held).toEqual(['AI thinks Column E “Blood Grp” is “Batch” (not sure).']);
    const clash = applyAiPicks(map({ phone: 1 }), [{ column: 5, target: { field: 'phone' }, confidence: 0.9 }], [], headers);
    expect(clash.map.phone).toBe(1);
    expect(clash.held).toEqual(['AI thinks Column F “Remarks” is “Mobile”.']);
  });

  it('every server answer becomes a reason; our own rules stand on any failure', () => {
    expect(aiAnswer(200, { columns: [{ column: 0, target: 'fullName', confidence: 1 }], left: 19 }, 2)).toEqual({
      ok: true,
      picks: [{ column: 0, target: { field: 'fullName' }, confidence: 1 }],
      left: 19,
    });
    expect(aiAnswer(429, { reason: 'limit' }, 2)).toEqual({ ok: false, why: 'limit' });
    expect(aiAnswer(503, { reason: 'off' }, 2)).toEqual({ ok: false, why: 'off' });
    expect(aiAnswer(503, { reason: 'unreachable' }, 2)).toEqual({ ok: false, why: 'unreachable' });
    expect(aiAnswer(502, { reason: 'failed' }, 2)).toEqual({ ok: false, why: 'failed' });
    expect(aiAnswer(403, {}, 2)).toEqual({ ok: false, why: 'owner' });
    expect(aiAnswer(401, {}, 2)).toEqual({ ok: false, why: 'signin' });
    expect(aiAnswer(500, null, 2)).toEqual({ ok: false, why: 'failed' });
    // R-157: a 200 that is not the answer (the app's own page, a proxy's error) is a failure.
    expect(aiAnswer(200, null, 2)).toEqual({ ok: false, why: 'failed' });
    expect(aiAnswer(200, '<html>', 2)).toEqual({ ok: false, why: 'failed' });
    expect(AI_WORDS.fallback).toBe('Matched without AI (it was not available). Check the columns below.');
  });

  it('asks with the sign-in key in a header and never throws', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ columns: [], left: 3 }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await askAiForColumns('key-0123456789abcdef', [{ header: 'Naam', examples: [] }], ok);
    expect(r).toEqual({ ok: true, picks: [], left: 3 });
    expect(seen[0]!.url).toBe('/api/ai/match-columns');
    expect(new Headers(seen[0]!.init.headers).get('X-Forge-Key')).toBe('key-0123456789abcdef');
    expect(seen[0]!.url).not.toContain('key-');
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await askAiForColumns('key-0123456789abcdef', [], down)).toEqual({ ok: false, why: 'offline' });
  });
});

describe('extra details', () => {
  it('ticked columns become the member’s own details, tidy and capped', () => {
    const extras = [
      { col: 2, label: '  Locker   No. ', on: true, ai: true },
      { col: 4, label: 'Blood Group', on: true, ai: false },
      { col: 5, label: 'Remarks', on: false, ai: false },
    ];
    const plan = planImport(SHEET, 0, map({ fullName: 0, phone: 1 }), [], TODAY, { extras, idCols: [3] });
    expect(plan.rows[0]!.draft!.extra).toEqual({ 'Locker No.': '12', 'Blood Group': 'B+' });
    expect(plan.rows[1]!.draft!.extra).toEqual({ 'Locker No.': 'B-3', 'Blood Group': 'O+' });
    expect(plan.rows[2]!.draft!.extra).toBeUndefined(); // nothing in those cells
    // Two columns with one name get "2"; an empty name is not kept; a column a field uses is not an extra.
    expect(usableExtras([{ col: 1, label: 'Locker', on: true, ai: false }, { col: 2, label: 'locker', on: true, ai: false }, { col: 3, label: ' ', on: true, ai: false }])).toEqual([
      { col: 1, label: 'Locker' },
      { col: 2, label: 'locker 2' },
    ]);
    const clash = planImport(SHEET, 0, map({ fullName: 0, phone: 1, batch: 2 }), [], TODAY, { extras });
    expect(clash.rows[0]!.draft!.extra).toEqual({ 'Blood Group': 'B+' });
  });

  it('an ID number inside an extra column is cut out too; long values are cut short', () => {
    const rows = [['Name', 'Mobile', 'Other'], ['Ramesh', '9829012345', `card ${AADHAAR}`], ['Sita', '9414054321', 'x'.repeat(300)]];
    const plan = planImport(rows, 0, map({ fullName: 0, phone: 1 }), [], TODAY, { extras: [{ col: 2, label: 'Other', on: true, ai: false }] });
    expect(plan.rows[0]!.draft!.extra).toEqual({ Other: 'card [ID number removed]' });
    expect(plan.rows[1]!.draft!.extra!.Other!.length).toBe(200);
  });

  it('the free columns: not used by a field, not ID numbers, not empty', () => {
    const rows = [...SHEET.map((r) => [...r, ''])];
    expect(freeColumns(rows, 0, 7, map({ fullName: 0, phone: 1 }), [3])).toEqual([2, 4, 5]);
  });

  it('"fill in blank details" adds only the extra details a member does not have', () => {
    const existing = makeMember({ extra: { 'Locker No.': '7' } });
    const patch = fillBlanksPatch(existing, { ...existing, extra: { 'Locker No.': '12', 'Blood Group': 'B+' } });
    expect(patch.extra).toEqual({ 'Locker No.': '7', 'Blood Group': 'B+' });
    expect(fillBlanksPatch(existing, { ...existing, extra: { 'Locker No.': '12' } }).extra).toBeUndefined();
  });

  it('the gym export gets one column per extra detail, only when there are any', () => {
    const snap = emptySnapshot(0);
    snap.members.push(makeMember({ id: 'a', extra: { 'Locker No.': '12' } }), makeMember({ id: 'b', phone: '+919414054321' }));
    const members = gymExportSheets(snap).find((s) => s.name === 'Members')!;
    expect(members.rows[0]!.slice(-2)).toEqual(['Uses the app', 'Locker No.']);
    expect(members.rows[1]!.at(-1)).toBe('12');
    expect(members.rows[2]!.at(-1)).toBeNull();
    const plain = gymExportSheets(emptySnapshot(0)).find((s) => s.name === 'Members')!;
    expect(plain.rows[0]!.at(-1)).toBe('Uses the app');
  });
});
