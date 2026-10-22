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
  });

  it('a column is ID numbers by its name or by most of its cells', () => {
    expect(idColumnKind('aadhaar no', ['', ''])).toBe('id');
    expect(idColumnKind('pan card', ['ABCDE1234F'])).toBe('pan');
    expect(idColumnKind('id', [AADHAAR, AADHAAR_PLAIN, ''])).toBe('aadhaar');
    expect(idColumnKind('code', ['ABCDE1234F', 'PQRST6789Z'])).toBe('pan');
    expect(idColumnKind('company', ['Infosys', 'TCS'])).toBeNull(); // "pan" inside a word is not PAN
    expect(idColumnKind('mobile', ['9829012345', '9414054321'])).toBeNull();
    expect(findIdColumns(SHEET, 0, 6)).toEqual([{ col: 3, kind: 'aadhaar' }]);
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

  it('only the column names and 5 example rows, masked; an ID column shows only that it is one', () => {
    const rows = [['Name', 'Mobile', 'Aadhaar'], ...Array.from({ length: 9 }, (_, i) => [`M ${i}`, `98290${String(10000 + i)}`, AADHAAR])];
    const cols = aiColumnsPayload(rows, 0, 3, [2]);
    expect(cols.map((c) => c.header)).toEqual(['Name', 'Mobile', 'Aadhaar']);
    expect(cols[0]!.examples).toEqual(['M 0', 'M 1', 'M 2', 'M 3', 'M 4']);
    expect(cols[1]!.examples[0]).toBe('98XXXXXX00');
    expect(cols[2]!.examples).toEqual(Array(5).fill('[ID number]'));
    const sent = JSON.stringify(cols);
    expect(sent).not.toMatch(/\d{7}/);
    expect(sent).not.toContain('M 5');
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
        { column: 4, target: { extra: 'Blood Group' }, confidence: 0.5 }, // unsure: suggested, not ticked
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
      4: { label: 'Blood Group', on: false, ai: true },
    });
    expect(applied.held).toEqual(['AI thinks Column F “Remarks” is “Mobile”.']); // shown, never applied
    const unsure = applyAiPicks(map({}), [{ column: 4, target: { field: 'batch' }, confidence: 0.45 }], [], headers);
    expect(unsure.map.batch).toBeNull();
    expect(unsure.held).toEqual(['AI thinks Column E “Blood Grp” is “Batch” (not sure).']);
    const clash = applyAiPicks(map({ phone: 1 }), [{ column: 5, target: { field: 'phone' }, confidence: 0.9 }], [], headers);
    expect(clash.map.phone).toBe(1);
    expect(clash.held).toEqual(['AI thinks Column F “Remarks” is “Mobile”.']);
  });

  it('every server answer becomes a plain sentence; the by-hand path is always named', () => {
    expect(aiAnswer(200, { columns: [{ column: 0, target: 'fullName', confidence: 1 }], left: 19 }, 2)).toEqual({
      ok: true,
      picks: [{ column: 0, target: { field: 'fullName' }, confidence: 1 }],
      left: 19,
    });
    expect(aiAnswer(429, { reason: 'limit' }, 2)).toEqual({ ok: false, words: AI_WORDS.limit });
    expect(aiAnswer(503, { reason: 'off' }, 2)).toEqual({ ok: false, words: AI_WORDS.off });
    expect(aiAnswer(503, { reason: 'unreachable' }, 2)).toEqual({ ok: false, words: AI_WORDS.offline });
    expect(aiAnswer(502, { reason: 'failed' }, 2)).toEqual({ ok: false, words: AI_WORDS.failed });
    expect(aiAnswer(403, {}, 2)).toEqual({ ok: false, words: AI_WORDS.owner });
    expect(aiAnswer(401, {}, 2)).toEqual({ ok: false, words: AI_WORDS.signin });
    expect(aiAnswer(500, null, 2)).toEqual({ ok: false, words: AI_WORDS.failed });
    for (const w of Object.values(AI_WORDS).slice(2)) expect(w).toMatch(/yourself/);
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
    expect(await askAiForColumns('key-0123456789abcdef', [], down)).toEqual({ ok: false, words: AI_WORDS.offline });
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
