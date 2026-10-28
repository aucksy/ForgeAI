/**
 * R-155 / R-157 (owner, 28 Oct 2026): a sheet with several phone columns ("Phone" of landlines and
 * blanks, "Home phone", "Cell phone" with the real mobiles) must read the member's mobile from
 * "Cell phone", by our own rules and with the AI (a stand-in: no network). A row whose Cell phone is
 * empty falls back to the next phone-like column.
 */
import { describe, expect, it } from 'vitest';

import { AI_SURE, aiColumnsPayload, applyAiPicks, askAiForColumns, sheetStats, statsBack } from '../../src/crm/logic/aiImport';
import { guessSheet } from '../../src/crm/logic/importGuess';
import { choosePhoneColumn, guessColumns, phoneBackupColumns, phoneColumns, planImport } from '../../src/crm/logic/importMembers';

const TODAY = '2026-10-28';
// Made-up numbers in the 98765000xx range the other tests use.
const SHEET = [
  ['Name', 'Phone', 'Home phone', 'Cell phone', 'Emergency contact', 'Plan'],
  ['Asha Test', '0141-2745101', '', '9876500011', '9876500091', 'Monthly'],
  ['Ravi Test', '', '0141-2745102', '9876500012', '9876500092', 'Quarterly'],
  ['Neha Test', '0141-2745103', '', '9876500013', '9876500093', 'Monthly'],
  ['Amit Test', '', '', '9876500014', '9876500094', 'Annual'],
  ['Sunil Test', '', '9876500025', '', '9876500095', 'Monthly'],
];
const PHONE = 1;
const HOME = 2;
const CELL = 3;

describe('several phone columns: our own rules', () => {
  it('the header alone would pick "Phone" (the old bug)', () => {
    expect(guessColumns(SHEET[0]!).phone).toBe(PHONE);
  });

  it('the column with the most valid mobiles wins: Cell phone', () => {
    expect(phoneColumns(SHEET, 0)).toEqual([
      { col: CELL, mobiles: 4 },
      { col: HOME, mobiles: 1 },
    ]); // Phone has no mobile; the emergency contact is someone else's number
    expect(guessSheet(SHEET, TODAY, null).map.phone).toBe(CELL);
  });

  it('a tie keeps the current pick; a column another box uses is left alone', () => {
    const tie = [
      ['Mobile', 'WhatsApp'],
      ['9876500011', '9876500021'],
      ['9876500012', '9876500022'],
    ];
    const base = guessColumns(tie[0]!);
    expect(choosePhoneColumn(tie, 0, { ...base, phone: 0 }).phone).toBe(0);
    expect(choosePhoneColumn(SHEET, 0, { ...guessColumns(SHEET[0]!), notes: CELL }).phone).toBe(HOME);
  });

  it('a row whose Cell phone is empty falls back to Home phone; the others read Cell phone', () => {
    const { headerRow, map } = guessSheet(SHEET, TODAY, null);
    expect(phoneBackupColumns(SHEET, headerRow, map)).toEqual([HOME]);
    const plan = planImport(SHEET, headerRow, map, [], TODAY);
    const phones = Object.fromEntries(plan.rows.map((r) => [r.draft?.fullName, r.draft?.phone]));
    expect(phones).toEqual({
      'Asha Test': '+919876500011',
      'Ravi Test': '+919876500012',
      'Neha Test': '+919876500013',
      'Amit Test': '+919876500014',
      'Sunil Test': '+919876500025',
    });
    expect(plan.rows.every((r) => r.status === 'add')).toBe(true);
  });

  it('a landline in the chosen column is kept in the notes when a mobile replaces it', () => {
    const map = { ...guessSheet(SHEET, TODAY, null).map, phone: PHONE };
    const plan = planImport(SHEET, 0, map, [], TODAY, { phoneBackups: [CELL, HOME] });
    const asha = plan.rows.find((r) => r.draft?.fullName === 'Asha Test')!;
    expect(asha.draft!.phone).toBe('+919876500011');
    expect(asha.draft!.notes).toContain('Other number: 0141-2745101');
    // No backups: a row with no mobile is still a row to check.
    const none = planImport(SHEET, 0, map, [], TODAY, { phoneBackups: [] });
    expect(none.rows.find((r) => r.draft?.fullName === 'Amit Test' || r.rowNumber === 5)!.status).not.toBe('add');
  });
});

describe('several phone columns: with the AI (stand-in)', () => {
  const headers = SHEET[0]!;
  const stats = sheetStats(SHEET, 0, headers.length);
  /** The old rules' pick (by header): Phone. */
  const byHeader = { ...guessSheet(SHEET, TODAY, null).map, phone: PHONE };

  it('the AI is sent counts per column, and the mobiles keep only their shape', () => {
    const sent = aiColumnsPayload(SHEET, 0, headers.length, []);
    expect(sent[CELL]!.stats).toMatchObject({ filled: 80, mobile: 80 });
    expect(sent[PHONE]!.stats).toMatchObject({ filled: 40, mobile: 0 });
    expect(sent[CELL]!.examples[0]).toBe('98XXXXXX11');
    expect(JSON.stringify(sent)).not.toMatch(/9876500011|2745101/);
  });

  it('a sure AI pick of Cell phone moves the Mobile box off the rules\' "Phone"', () => {
    expect(AI_SURE).toBeLessThanOrEqual(0.9);
    const applied = applyAiPicks(byHeader, [{ column: CELL, target: { field: 'phone' }, confidence: 0.9 }], [], headers, stats);
    expect(applied.map.phone).toBe(CELL);
    expect(applied.aiFields).toEqual(['phone']);
  });

  it('a wrong AI pick of "Phone" is refused: the counts do not back it', () => {
    const ours = guessSheet(SHEET, TODAY, null).map;
    const applied = applyAiPicks(ours, [{ column: PHONE, target: { field: 'phone' }, confidence: 0.99 }], [], headers, stats);
    expect(applied.map.phone).toBe(CELL);
    expect(applied.aiFields).toEqual([]);
    expect(statsBack('phone', PHONE, CELL, stats)).toBe(false);
  });

  it('a box the owner set by hand is never changed by the AI', () => {
    const applied = applyAiPicks(byHeader, [{ column: CELL, target: { field: 'phone' }, confidence: 0.95 }], [], headers, stats, ['phone']);
    expect(applied.map.phone).toBe(PHONE);
  });

  it('the whole round trip: ask (stand-in server), apply, import: every member gets the Cell phone', async () => {
    const seen: string[] = [];
    const server = (async (_url: string, init: RequestInit) => {
      seen.push(String(init.body));
      return new Response(
        JSON.stringify({
          columns: [
            { column: 0, target: 'fullName', confidence: 0.99 },
            { column: CELL, target: 'phone', confidence: 0.95 },
            { column: PHONE, target: 'extra:Landline', confidence: 0.7 },
            { column: 4, target: 'extra:Emergency Contact', confidence: 0.9 },
            { column: 5, target: 'plan', confidence: 0.97 },
          ],
          left: 19,
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const answer = await askAiForColumns('key-0123456789abcdef', aiColumnsPayload(SHEET, 0, headers.length, [], byHeader), server);
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    const applied = applyAiPicks(byHeader, answer.picks, [], headers, stats);
    expect(applied.map.phone).toBe(CELL);
    expect(seen[0]).not.toMatch(/9876500011/);
    const plan = planImport(SHEET, 0, applied.map, [], TODAY);
    expect(plan.rows.map((r) => r.draft?.phone)).toEqual(['+919876500011', '+919876500012', '+919876500013', '+919876500014', '+919876500025']);
  });

  it('the AI is down: our own rules alone still pick Cell phone', async () => {
    const down = (async () => new Response('oops', { status: 502 })) as unknown as typeof fetch;
    const answer = await askAiForColumns('key-0123456789abcdef', aiColumnsPayload(SHEET, 0, headers.length, []), down);
    expect(answer).toEqual({ ok: false, why: 'failed' });
    expect(guessSheet(SHEET, TODAY, null).map.phone).toBe(CELL);
  });
});
