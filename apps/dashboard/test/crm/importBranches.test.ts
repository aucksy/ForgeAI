/**
 * Tracker #41 + #36 (24 Oct 2026): importing a gym with several branches, and saving that never
 * stops halfway. The branch matcher, the Branch column, one sheet per branch, duplicates checked
 * against the RIGHT branch, a branch that can't be opened, a batch that fails, "Try again", and
 * "Undo this import" per branch. Every name and number is invented.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { matchBranchName } from '../../src/crm/branches/context';
import { emptySnapshot, LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { findIdColumns } from '../../src/crm/logic/aiImport';
import { branchesToOpen, branchNamesInFile, guessBranchColumn, rowsPerBranch } from '../../src/crm/logic/importBranches';
import { guessSheet, sheetExtras, sheetWidth } from '../../src/crm/logic/importGuess';
import {
  decodeCsvBytes,
  emptyColumnMap,
  guessColumns,
  parseCsv,
  planImport,
  saveInBatches,
  SKIP_BRANCH,
  type BranchRouting,
  type Cell,
  type ImportRow,
} from '../../src/crm/logic/importMembers';
import { mergeSaveResults, rowsToRetry, saveImport, type ImportSaver } from '../../src/crm/logic/importSave';
import { pastImports } from '../../src/crm/logic/undoImport';
import { readSheets } from '../../src/crm/logic/sheets';
import type { Member } from '../../src/crm/types';
import { makeMember } from './fixtures';

const TODAY = '2026-10-24';

const BRANCHES = [
  { gymId: 'g-vai', name: "Ram's Fitness Club, Vaishali Nagar" },
  { gymId: 'g-mal', name: "Ram's Fitness Club, Malviya Nagar" },
  { gymId: 'g-man', name: "Ram's Fitness Club, Mansarovar" },
];
const match = (t: string) => matchBranchName(t, BRANCHES);

function fixture(name: string): string[][] {
  const path = fileURLToPath(new URL(`./fixtures/import/${name}`, import.meta.url));
  return parseCsv(decodeCsvBytes(new Uint8Array(readFileSync(path))));
}

function routing(over: Partial<BranchRouting> = {}): BranchRouting {
  return { branches: BRANCHES, currentGymId: 'g-vai', sheetGymId: null, match, answers: {}, rosters: { 'g-mal': [], 'g-man': [] }, failed: {}, ...over };
}

function plan(rows: readonly (readonly unknown[])[], route: BranchRouting, roster: readonly Member[] = []) {
  const { headerRow, map } = guessSheet(rows, TODAY, match);
  const idCols = findIdColumns(rows, headerRow, sheetWidth(rows)).map((c) => c.col);
  const extras = sheetExtras(rows, headerRow, map, idCols);
  return { headerRow, map, plan: planImport(rows, headerRow, map, roster, TODAY, { extras, idCols, branches: route }) };
}

describe('matchBranchName (the loose matcher)', () => {
  it('case, spaces and the words every branch shares do not matter', () => {
    expect(match('Vaishali Nagar')).toBe('g-vai');
    expect(match('  VAISHALI   nagar ')).toBe('g-vai');
    expect(match('vaishali')).toBe('g-vai');
    expect(match('Malviya')).toBe('g-mal');
    expect(match('MANSAROVAR branch')).toBe('g-man');
    expect(match("Ram's Fitness Club, Malviya Nagar")).toBe('g-mal');
    expect(match('Mansa')).toBe('g-man'); // the start of a word
  });

  it('a name that fits no branch, or more than one, is not guessed', () => {
    expect(match('Jaipur Central')).toBeNull();
    expect(match('Nagar')).toBeNull(); // Vaishali Nagar or Malviya Nagar?
    expect(match('')).toBeNull();
    expect(match('   ')).toBeNull();
    expect(matchBranchName('Vaishali', [])).toBeNull();
  });

  it('Hindi and Hinglish "branch" words are left out of the match', () => {
    expect(match('Shakha Mansarovar')).toBe('g-man');
  });
});

describe('the Branch column', () => {
  it('is found by its header in English, Hinglish and Hindi; "Location" and "Area" stay the address', () => {
    expect(guessColumns(['Name', 'Mobile', 'Branch']).branch).toBe(2);
    expect(guessColumns(['Name', 'Mobile', 'Centre']).branch).toBe(2);
    expect(guessColumns(['Naam', 'Mob No', 'Shakha']).branch).toBe(2);
    expect(guessColumns(['नाम', 'मोबाइल', 'शाखा']).branch).toBe(2);
    expect(guessColumns(['Name', 'Mobile', 'Gym Location']).branch).toBe(2);
    expect(guessColumns(['Name', 'Mobile', 'Location']).address).toBe(2);
    expect(guessColumns(['Name', 'Mobile', 'Area']).address).toBe(2);
  });

  it('a column whose VALUES are branch names becomes the Branch column, whatever its header', () => {
    const rows = [
      ['Name', 'Mobile', 'Location'],
      ['A Test', '9876502001', 'vaishali'],
      ['B Test', '9876502002', 'Malviya Nagar'],
      ['C Test', '9876502003', 'mansarovar'],
    ];
    const map = guessBranchColumn(rows, 0, guessColumns(rows[0]!), match);
    expect(map).toMatchObject({ branch: 2, address: null });
    // Members' home areas are not branch names: the address stays the address.
    const homes = [['Name', 'Mobile', 'Location'], ['A Test', '9876502001', 'Sector 4, Jhotwara'], ['B Test', '9876502002', 'C-Scheme']];
    expect(guessBranchColumn(homes, 0, guessColumns(homes[0]!), match)).toMatchObject({ branch: null, address: 2 });
  });

  it('a gym with ONE branch: no Branch box; the column is kept as a detail, nothing else changes', () => {
    const rows = fixture('central-branches.csv');
    const { headerRow, map } = guessSheet(rows, TODAY, null);
    expect(map.branch).toBeNull();
    const extras = sheetExtras(rows, headerRow, map, []);
    expect(extras.map((e) => [e.label, e.on])).toEqual([['Branch', true]]);
    const p = planImport(rows, headerRow, map, [], TODAY, { extras });
    expect(p.rows.every((r) => r.gymId === undefined)).toBe(true);
    expect(p.rows[0]!.draft!.extra).toEqual({ Branch: 'Vaishali Nagar' });
    // The row with the same mobile is a repeat (one gym), exactly as before.
    expect(p.rows[8]).toMatchObject({ status: 'duplicate', sameAsRow: 2 });
  });
});

describe('one sheet for all branches (central-branches.csv)', () => {
  const rows = fixture('central-branches.csv');
  const malviyaRoster = [makeMember({ fullName: 'Branch Malviya Two', phone: '+919876501004', gymId: 'g-mal' })];

  it('sends each row to the branch it names, matched loosely', () => {
    const { map, plan: p } = plan(rows, routing({ rosters: { 'g-mal': malviyaRoster, 'g-man': [] } }));
    expect(map.branch).toBe(2);
    const where = Object.fromEntries(p.rows.map((r) => [`${r.rowNumber}`, r.gymId ?? null]));
    expect(where).toMatchObject({ 2: 'g-vai', 3: 'g-vai', 4: 'g-mal', 5: 'g-mal', 6: 'g-man' });
  });

  it('checks duplicates against THAT branch: a member of Malviya is "already a member" there only', () => {
    const { plan: p } = plan(rows, routing({ rosters: { 'g-mal': malviyaRoster, 'g-man': [] } }));
    expect(p.rows.find((r) => r.rowNumber === 5)).toMatchObject({ status: 'duplicate', gymId: 'g-mal' });
    expect(p.rows.find((r) => r.rowNumber === 5)!.existing!.fullName).toBe('Branch Malviya Two');
    // The same person in two branches is two memberships, not a repeat row.
    expect(p.rows.find((r) => r.rowNumber === 10)).toMatchObject({ status: 'add', gymId: 'g-mal', sameAsRow: null });
    expect(rowsPerBranch(p.rows).get('g-mal')).toEqual({ add: 2, duplicate: 1 });
  });

  it('lists every branch name once; the ones that match nothing come first and wait for a pick', () => {
    const names = branchNamesInFile(rows, 0, guessSheet(rows, TODAY, match).map, { match, answers: {} });
    expect(names.map((nm) => [nm.shown, nm.rows, nm.target])).toEqual([
      ['Jaipur Central', 2, null],
      ['', 1, null],
      ['MALVIYA NAGAR', 3, 'g-mal'], // "MALVIYA NAGAR", "Malviya  Nagar " and "Malviya Nagar" are one name
      ['mansarovar', 1, 'g-man'],
      ['vaishali', 1, 'g-vai'],
      ['Vaishali Nagar', 1, 'g-vai'],
    ]);
  });

  it('a name that matches nothing: its rows wait in "Rows to check" with the reason, the rest still go in', () => {
    const { plan: p } = plan(rows, routing());
    const unknown = p.rows.filter((r) => r.needsBranch);
    expect(unknown.map((r) => r.rowNumber)).toEqual([7, 8, 9]);
    expect(unknown[0]!.problems).toEqual(['The branch “Jaipur Central” is not one of your branches. Pick the branch for it under “Branches in your file”.']);
    expect(unknown[2]!.problems).toEqual(['No branch is written on this row. Pick the branch for it under “Branches in your file”.']);
    expect(p.counts).toEqual({ add: 6, duplicate: 0, problem: 3 });
  });

  it('the owner picks the branch once for every row of that name, or skips them', () => {
    const { plan: p } = plan(rows, routing({ answers: { 'jaipur central': 'g-man', '': SKIP_BRANCH } }));
    expect(p.rows.filter((r) => r.rowNumber === 7 || r.rowNumber === 8).map((r) => [r.status, r.gymId])).toEqual([
      ['add', 'g-man'],
      ['add', 'g-man'],
    ]);
    const blank = p.rows.find((r) => r.rowNumber === 9)!;
    expect(blank).toMatchObject({ status: 'problem', ownerSkipped: true });
    // A loose match the owner corrects is moved too.
    const moved = plan(rows, routing({ answers: { vaishali: 'g-mal' } })).plan;
    expect(moved.rows.find((r) => r.rowNumber === 3)!.gymId).toBe('g-mal');
  });

  it('a branch that could not be opened holds back only its rows, with the reason', () => {
    const { plan: p } = plan(rows, routing({ rosters: { 'g-mal': [] }, failed: { 'g-man': 'Check the internet.' }, answers: { 'jaipur central': 'g-vai', '': 'g-vai' } }));
    const man = p.rows.find((r) => r.rowNumber === 6)!;
    expect(man).toMatchObject({ status: 'problem', branchWaiting: true });
    expect(man.problems).toEqual(['The branch “Ram\'s Fitness Club, Mansarovar” could not be opened: Check the internet.']);
    expect(p.counts).toEqual({ add: 8, duplicate: 0, problem: 1 });
    // Still opening: the same rows wait (the Add button waits for it on screen).
    const opening = plan(rows, routing({ rosters: { 'g-mal': [] } })).plan;
    expect(opening.rows.find((r) => r.rowNumber === 6)!.problems).toEqual(['The branch “Ram\'s Fitness Club, Mansarovar” is still opening. Wait a moment.']);
  });

  it('only the branches the rows go to are opened', () => {
    const names = branchNamesInFile(rows, 0, guessSheet(rows, TODAY, match).map, { match, answers: {} });
    expect(branchesToOpen(names, null, 'g-vai', true).sort()).toEqual(['g-mal', 'g-man']);
    expect(branchesToOpen([], 'g-mal', 'g-vai', false)).toEqual(['g-mal']);
    expect(branchesToOpen([], 'g-vai', 'g-vai', false)).toEqual([]);
  });
});

describe('one sheet per branch (a workbook)', () => {
  it('each sheet goes to the branch picked for it (its name is matched first)', async () => {
    const wb = XLSX.utils.book_new();
    const sheet = (rows: unknown[][]) => XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, sheet([['Name', 'Mobile'], ['Sheet Vaishali One', '9876502101'], ['Sheet Vaishali Two', '9876502102']]), 'Vaishali Nagar');
    XLSX.utils.book_append_sheet(wb, sheet([['Name', 'Mobile'], ['Sheet Malviya One', '9876502201'], ['Sheet Vaishali One', '9876502101']]), 'Malviya');
    const sheets = await readSheets('branches.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    if (sheets === 'unknown') throw new Error('not read');
    expect(sheets.map((s) => match(s.name))).toEqual(['g-vai', 'g-mal']);
    const second = sheets[1]!.rows as Cell[][];
    const { plan: p } = plan(second, routing({ sheetGymId: 'g-mal' }));
    expect(p.rows.map((r) => [r.draft!.fullName, r.gymId, r.status])).toEqual([
      ['Sheet Malviya One', 'g-mal', 'add'],
      ['Sheet Vaishali One', 'g-mal', 'add'],
    ]);
  });
});

// ---------------------------------------------------------------- saving

function rowsFor(n: number, gymId?: string): ImportRow[] {
  return Array.from({ length: n }, (_, i) => ({
    rowNumber: i + 2,
    cells: [],
    name: `Save Test ${i}`,
    status: 'add' as const,
    draft: { ...makeMember({ fullName: `Save Test ${i}`, phone: `+9198765030${String(i).padStart(2, '0')}` }), importId: undefined },
    existing: null,
    sameAsRow: null,
    problems: [],
    warnings: [],
    term: null,
    ...(gymId ? { gymId } : {}),
  }));
}

function fakeSaver(over: Partial<ImportSaver> = {}): ImportSaver & { saved: string[] } {
  const saved: string[] = [];
  return {
    saved,
    createMembers: async (drafts) => {
      saved.push(...drafts.map((d) => d.phone));
      return drafts.map((d) => makeMember({ phone: d.phone }));
    },
    updateMember: async (id) => makeMember({ id }),
    importTerms: async () => ({ plans: 0, memberships: 0, payments: 0, skipped: 0 }),
    ...over,
  };
}

describe('saving never stops halfway', () => {
  it('saveInBatches(keepGoing): a failed batch waits; the batches after it are still saved', async () => {
    const rows = rowsFor(7);
    let n = 0;
    const out = await saveInBatches(rows, async (drafts) => {
      n += 1;
      if (n === 2) throw new Error('No internet.');
      return drafts.map((d) => makeMember({ phone: d.phone }));
    }, () => undefined, 3, true);
    expect(out.added.map((r) => r.rowNumber)).toEqual([2, 3, 4, 8]);
    expect(out.notSaved.map((r) => r.rowNumber)).toEqual([5, 6, 7]);
    expect(out.stopped).toBe('No internet.');
  });

  it('a branch that cannot be opened: its rows wait, every other branch is saved', async () => {
    const vai = fakeSaver();
    const mal = fakeSaver();
    const rows = [...rowsFor(2, 'g-vai'), ...rowsFor(4, 'g-man').slice(2), ...rowsFor(6, 'g-mal').slice(4)];
    const out = await saveImport({
      rows,
      dupMode: 'skip',
      role: 'owner',
      importId: 'import-test',
      currentGymId: 'g-vai',
      branchName: (id) => BRANCHES.find((b) => b.gymId === id)!.name,
      saverFor: async (id) => {
        if (id === 'g-man') throw new Error('Check the internet.');
        return id === 'g-mal' ? mal : vai;
      },
    });
    expect(vai.saved).toHaveLength(2);
    expect(mal.saved).toHaveLength(2);
    expect(out.branches.map((b) => [b.gymId, b.added, b.openError])).toEqual([
      ['g-vai', 2, null],
      ['g-man', 0, 'Check the internet.'],
      ['g-mal', 2, null],
    ]);
    const waiting = out.skipped.filter((s) => s.waiting);
    expect(waiting).toHaveLength(2);
    expect(waiting[0]!.reason).toBe('The branch “Ram\'s Fitness Club, Mansarovar” could not be opened: Check the internet. Tap “Try again”.');
  });

  it('"Try again" sends only the waiting rows, under the same import, and the summary adds up', async () => {
    let online = false;
    const vai = fakeSaver({
      createMembers: async (drafts) => {
        if (!online) throw new Error('No internet.');
        return drafts.map((d) => makeMember({ phone: d.phone }));
      },
    });
    const rows = rowsFor(5, 'g-vai');
    const input = { dupMode: 'skip' as const, role: 'owner' as const, importId: 'import-test', currentGymId: 'g-vai', saverFor: async () => vai, batchSize: 2 };
    const first = await saveImport({ ...input, rows });
    expect(first.branches[0]).toMatchObject({ added: 0, stopped: 'No internet.' });
    expect(rowsToRetry(first)).toHaveLength(5);
    online = true;
    const again = await saveImport({ ...input, rows: rowsToRetry(first) });
    const merged = mergeSaveResults(first, again);
    expect(merged.branches[0]).toMatchObject({ added: 5, stopped: null });
    expect(merged.skipped).toEqual([]);
  });

  it('a whole gym of two branches, saved for real, with "Undo this import" in each branch', async () => {
    const store = () => new LocalCrmData({ store: memoryStore(), now: (() => { let c = 1_800_000_000_000; return () => (c += 1); })(), seed: () => emptySnapshot(0, 'Test Gym'), today: () => TODAY });
    const vaishali = store();
    const malviya = store();
    await malviya.createMembers([{ ...makeMember({ fullName: 'Branch Malviya Two', phone: '+919876501004' }), photoUri: null, archived: false }]);
    const rows = fixture('central-branches.csv');
    const { plan: p } = plan(
      rows,
      routing({ rosters: { 'g-mal': (await malviya.load()).members }, failed: { 'g-man': 'Check the internet.' }, answers: { 'jaipur central': 'g-mal', '': SKIP_BRANCH } }),
      (await vaishali.load()).members,
    );
    const importId = `import-${(1_800_000_000_500).toString(36)}`;
    const out = await saveImport({
      rows: p.rows,
      dupMode: 'skip',
      role: 'owner',
      importId,
      currentGymId: 'g-vai',
      saverFor: async (id) => {
        if (id === 'g-vai') return vaishali;
        if (id === 'g-mal') return malviya;
        throw new Error('Check the internet.');
      },
    });
    const vNames = (await vaishali.load()).members.map((m) => m.fullName).sort();
    const mNames = (await malviya.load()).members.map((m) => m.fullName).sort();
    expect(vNames).toEqual(['Branch Vaishali One', 'Branch Vaishali Two']);
    expect(mNames).toEqual(['Branch Malviya One', 'Branch Malviya Two', 'Branch Unknown', 'Branch Unknown Two', 'Branch Vaishali One']);
    expect(out.branches.map((b) => [b.gymId, b.added])).toEqual([
      ['g-vai', 2],
      ['g-mal', 4],
    ]);
    // Mansarovar's row and the skipped blank one are listed, with why; nothing is lost silently.
    expect(out.skipped.map((s) => s.row.rowNumber)).toEqual([5, 6, 9]);
    // Each branch's own "Past imports" list has this import, with its own members.
    expect(pastImports(await vaishali.load())).toMatchObject([{ importId, members: 2 }]);
    expect(pastImports(await malviya.load())).toMatchObject([{ importId, members: 4 }]);
    await malviya.undoImport(importId);
    expect((await malviya.load()).members.map((m) => m.fullName)).toEqual(['Branch Malviya Two']);
    expect((await vaishali.load()).members).toHaveLength(2);
  });
});

describe('a gym with one branch saves exactly as before', () => {
  it('no branch on any row; one group; the store is asked for "" (this gym)', async () => {
    const asked: string[] = [];
    const saver = fakeSaver();
    const out = await saveImport({ rows: rowsFor(3), dupMode: 'skip', role: 'owner', importId: 'i', saverFor: async (id) => (asked.push(id), saver) });
    expect(asked).toEqual(['']);
    expect(out.branches).toEqual([{ gymId: '', added: 3, updated: 0, lastSavedRow: 4, terms: null, termsError: null, stopped: null, openError: null }]);
    expect(emptyColumnMap().branch).toBeNull();
  });
});
