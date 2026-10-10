/**
 * v0.29.0 — Import routines from a Hevy share link (owner, 9 Oct 2026). The page fixture is the
 * owner's folder "Jaipur" as the reader saw it on hevy.com that day (test/fixtures).
 */
import { readFileSync as readFromDisk } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseFolderSettings } from '@/tracker/db/folderRepo';
import { inferDayType } from '@/tracker/services/hevyImport';
import {
  linkedRests,
  linkedToFound,
  parseExerciseBox,
  parseHevyPage,
  parsePageMessage,
  parseRoutineLink,
  READ_PAGE_JS,
  readProblem,
  type PageNode,
  type PageRead,
} from '@/tracker/services/routineLink';

// Source paths below are relative to apps/mobile, whatever the working directory (audit QA-25).
const fromApp = (p: string): string => (isAbsolute(p) ? p : join(__dirname, '..', '..', p));
function readFileSync(p: string): Buffer;
function readFileSync(p: string, enc: 'utf8'): string;
function readFileSync(p: string, enc?: 'utf8'): string | Buffer {
  return enc ? readFromDisk(fromApp(p), enc) : readFromDisk(fromApp(p));
}

const page = JSON.parse(readFileSync('test/fixtures/hevy-folder-page.json', 'utf8')) as { nodes: PageNode[]; expected: number };

describe('the link the member pastes', () => {
  it('a folder or routine link, also inside other words or without https', () => {
    expect(parseRoutineLink('https://hevy.com/folder/177335')).toEqual({ app: 'hevy', kind: 'folder', url: 'https://hevy.com/folder/177335' });
    expect(parseRoutineLink('Check out my folder http://www.hevy.com/folder/177335 !')?.url).toBe('https://hevy.com/folder/177335');
    expect(parseRoutineLink('hevy.com/routine/GPmZyr7r4Em')).toEqual({ app: 'hevy', kind: 'routine', url: 'https://hevy.com/routine/GPmZyr7r4Em' });
    expect(parseRoutineLink('https://link.strong.app/kjnivqrp')).toBeNull();
    expect(parseRoutineLink('hello')).toBeNull();
  });
});

describe("an exercise's box on the page", () => {
  it('sets, rep range and rest; a timed exercise has no reps', () => {
    expect(parseExerciseBox('\n\n4 sets · 11-20 reps\n\nRest 2m 15s')).toEqual({ sets: 4, repMin: 11, repMax: 20, restSec: 135 });
    expect(parseExerciseBox('2 sets · 50 reps\nRest 5m 0s')).toEqual({ sets: 2, repMin: 50, repMax: 50, restSec: 300 });
    expect(parseExerciseBox('3 sets\nRest 45s')).toEqual({ sets: 3, repMin: null, repMax: null, restSec: 45 });
    expect(parseExerciseBox('1 set · 1 rep')).toEqual({ sets: 1, repMin: 1, repMax: 1, restSec: null });
    expect(parseExerciseBox('Created byaucksy')).toBeNull();
  });

  it('a note that mentions sets does not change the numbers (review)', () => {
    expect(parseExerciseBox('keep 2 sets in reserve\n3 sets · 9-12 reps\nRest 1m 0s')).toEqual({ sets: 3, repMin: 9, repMax: 12, restSec: 60 });
  });

  it('a new exercise with no reps on the page is timed only when its name is a hold or cardio (review)', async () => {
    const { linkLogType } = await import('@/tracker/services/hevyImport');
    expect(linkLogType('Nordic Curl', true)).not.toMatch(/time|distance/);
    expect(linkLogType('Plank', true)).toMatch(/time/);
    expect(linkLogType('Squat (Bodyweight)', false)).toBe('reps');
    expect(linkLogType('Zercher Squat (Barbell)', false)).toBe('weight_reps');
  });
});

describe("the owner's folder Jaipur, read from its share page", () => {
  const folder = parseHevyPage(page.nodes);

  it('the folder name and its 6 routines in the page order; the creator is not an exercise', () => {
    expect(folder.name).toBe('Jaipur');
    expect(folder.routines.map((r) => [r.title, r.exercises.length])).toEqual([
      ['Pull 2', 9],
      ['Leg 2', 5],
      ['Pull 1', 5],
      ['Push 2', 4],
      ['Legs 1', 6],
      ['Push 1', 7],
    ]);
    expect(folder.routines.flatMap((r) => r.exercises).some((e) => e.title === 'aucksy')).toBe(false);
    expect(folder.routines.length).toBe(page.expected);
  });

  it('every exercise exactly as saved (sets, reps, rest)', () => {
    const push1 = folder.routines.find((r) => r.title === 'Push 1')!;
    expect(push1.exercises[0]).toEqual({ title: 'Incline Bench Press (Dumbbell)', sets: 5, repMin: 8, repMax: 15, restSec: 210 });
    expect(push1.exercises[4]).toEqual({ title: 'Triceps Kickback (Cable)', sets: 4, repMin: 20, repMax: 42, restSec: 150 });
    const pull1 = folder.routines.find((r) => r.title === 'Pull 1')!;
    expect(pull1.exercises.find((e) => e.title === 'Pull Up')).toEqual({ title: 'Pull Up', sets: 3, repMin: null, repMax: null, restSec: 180 });
  });

  it('in the check steps everything is ticked; push / pull / legs come from the names', () => {
    const found = linkedToFound(folder, inferDayType);
    expect(found.every((r) => r.recent && r.exercises.every((e) => e.ticked))).toBe(true);
    expect(found.map((r) => r.dayType)).toEqual(['pull', 'legs', 'pull', 'push', 'legs', 'push']);
    expect(linkedRests(folder).get('Hip Thrust (Machine)')).toBe(300);
  });

  it('a routine link is one routine, named by its page', () => {
    const one = parseHevyPage(
      [
        { tag: 'h2', text: 'Push Day' },
        { tag: 'h3', text: 'Exercises' },
        { tag: 'h5', text: 'Bench Press (Barbell)', detail: 'Bench Press (Barbell)\n4 sets · 6-8 reps\nRest 2m 0s' },
      ],
      'routine',
    );
    expect(one.routines.map((r) => [r.title, r.exercises.length])).toEqual([['Push Day', 1]]);
  });

  it('two routines with one name both come in; an exercise listed twice keeps both blocks (IM-12)', () => {
    const found = linkedToFound(
      {
        name: 'F',
        routines: [
          { title: 'Push', exercises: [{ title: 'A', sets: 3, repMin: 8, repMax: 10, restSec: null }, { title: 'A', sets: 2, repMin: 8, repMax: 10, restSec: null }] },
          { title: 'Push', exercises: [{ title: 'B', sets: 3, repMin: 8, repMax: 10, restSec: null }] },
        ],
      },
      inferDayType,
    );
    expect(found.map((r) => [r.title, r.exercises.map((e) => e.title)])).toEqual([
      ['Push', ['A', 'A']],
      ['Push (2)', ['B']],
    ]);
    expect(found[0].exercises.map((e) => e.key)).toEqual(['0:A', '1:A']);
  });
});

describe('what the member is told when a link gives nothing', () => {
  const read = (p: Partial<PageRead>): PageRead => ({ nodes: [], expected: 0, notFound: false, timedOut: false, ...p });
  it('gone, slow, no internet, or not a routines page', () => {
    expect(readProblem(read({ notFound: true }), null)).toMatch(/does not exist any more/);
    expect(readProblem(read({ timedOut: true }), null)).toMatch(/too long/);
    expect(readProblem(null, null)).toMatch(/couldn’t open/);
    expect(readProblem(read({}), { name: 'x', routines: [] })).toMatch(/no routines/);
    expect(readProblem(read({}), parseHevyPage(page.nodes))).toBeNull();
  });

  it('a message that is not the reader’s is ignored', () => {
    expect(parsePageMessage('nonsense')).toBeNull();
    expect(parsePageMessage('{"nodes":5}')).toBeNull();
    expect(parsePageMessage(JSON.stringify({ nodes: page.nodes, expected: 6 }))?.nodes).toHaveLength(page.nodes.length);
  });
});

describe('the script that runs on Hevy’s page', () => {
  /** A stand-in page: the headings of the fixture, and a box text for each exercise. */
  function fakePage(nodes: PageNode[], expected: number, body = '') {
    const els = nodes.map((n) => ({ tagName: n.tag.toUpperCase(), textContent: n.text, parentElement: { innerText: n.detail ?? '' } }));
    const sent: string[] = [];
    const document = {
      querySelectorAll: () => els,
      getElementById: () => ({ textContent: JSON.stringify({ props: { pageProps: { metadata: { routine_count: expected } } } }) }),
      body: { innerText: body },
    };
    const window = { ReactNativeWebView: { postMessage: (s: string) => sent.push(s) } };
    const timers: (() => void)[] = [];
    const setTimeout = (f: () => void) => timers.push(f);
    new Function('document', 'window', 'setTimeout', READ_PAGE_JS)(document, window, setTimeout);
    while (sent.length === 0 && timers.length > 0) timers.shift()!();
    return sent;
  }

  it('waits for every routine, then sends what the parser reads as the 6 routines', () => {
    const sent = fakePage(page.nodes, 6);
    expect(sent).toHaveLength(1);
    const read = parsePageMessage(sent[0])!;
    expect(read.timedOut).toBe(false);
    expect(parseHevyPage(read.nodes).routines).toHaveLength(6);
  });

  it('a page still loading is waited for, up to 20 s', () => {
    const sent = fakePage([{ tag: 'h2', text: 'Jaipur' }], 6);
    expect(parsePageMessage(sent[0])).toMatchObject({ timedOut: true });
  });

  it('"Folder not found" is said at once', () => {
    const sent = fakePage([{ tag: 'h2', text: 'Folder not found' }], 0, 'Folder not found\nThis folder might not exist anymore.');
    expect(parsePageMessage(sent[0])).toMatchObject({ notFound: true, timedOut: false });
  });
});

describe('continuity with the imported history (v0.29.1, owner)', () => {
  // [source-text check] Reads source text, not behaviour: passes on dead code, fails on a harmless rename (audit QA-12).
  it('[source-text check] a link and the history import find exercises the same way, so a routine and its history are one exercise', () => {
    const hevy = readFileSync('src/tracker/services/hevyImport.ts', 'utf8');
    // Both read the same library and match with the same rule; the link only adds what is missing.
    expect(hevy).toMatch(/export async function exerciseIdsCreating[\s\S]*?const hit = matchTitle\(title, library\)/);
    // IM-15: the member's own "Same as …" answer comes first, then the same rule.
    expect(hevy).toMatch(/for \(const title of parsed\.distinctExerciseTitles\) \{[\s\S]{0,400}?const hit = picked \?\? matchTitle\(title, library\)/);
  });

  // [source-text check] Partly reads source text (the rest is behavioural): passes on dead code, fails on a harmless rename (audit QA-12).
  it('[source-text check] an exercise new to ForgeAI is shown before saving, with how it will be made', async () => {
    const { newExerciseAbout } = await import('@/tracker/services/routineImport');
    expect(newExerciseAbout('Decline Leg Raise (Gurgaon)', false)).toMatch(/ · Reps only$|· Weight and reps$/);
    expect(newExerciseAbout('Plank (Weighted Vest)', true)).toMatch(/· Time$/);
    const steps = readFileSync('src/tracker/components/RoutineImportSteps.tsx', 'utf8');
    expect(steps).toMatch(/new to ForgeAI/);
    expect(steps).toMatch(/lastOne \? void afterChecks\(\)/);
  });

  it('a guess from the name: whole words only ("Crunch" is not a run); a carry is timed (review)', async () => {
    const { linkLogType } = await import('@/tracker/services/hevyImport');
    for (const t of ['Kneeling Cable Crunch', 'Reverse Crunch (Cable)', 'Hanging Windshield Wiper']) expect(linkLogType(t, true)).not.toMatch(/time/);
    for (const t of ['Farmers Carry', 'Plank', 'Treadmill Run']) expect(linkLogType(t, true)).toMatch(/time/);
  });

  // [source-text check] Reads source text, not behaviour: passes on dead code, fails on a harmless rename (audit QA-12).
  it('[source-text check] routines first, history later: the real sets correct a guessed type (unless it was used already)', () => {
    const hevy = readFileSync('src/tracker/services/hevyImport.ts', 'utf8');
    expect(hevy).toMatch(/madeNow\.push\(made\.id\)/); // the link remembers what it guessed
    expect(hevy).toMatch(/if \(guessed\.has\(hit\.id\)\)[\s\S]*?\(used\?\.n \?\? 0\) === 0 && real !== logType/);
  });

  // [source-text check] Reads source text, not behaviour: passes on dead code, fails on a harmless rename (audit QA-12).
  it('[source-text check] the history import names its new exercises, each with a suggested match (IM-15)', () => {
    expect(readFileSync('src/app/import/index.tsx', 'utf8')).toMatch(/<NewNamesCard/);
    expect(readFileSync('src/tracker/components/NewNamesCard.tsx', 'utf8')).toMatch(/new to ForgeAI/);
  });
});

describe('the folder remembers its link', () => {
  it('copying the same link again updates that folder (settings keep the link)', () => {
    expect(parseFolderSettings(JSON.stringify({ fromLink: 'https://hevy.com/folder/177335' })).fromLink).toBe('https://hevy.com/folder/177335');
    expect(parseFolderSettings(JSON.stringify({ fromLink: 'https://evil.example/x' })).fromLink).toBeUndefined();
  });

  // [source-text check] Reads source text, not behaviour: passes on dead code, fails on a harmless rename (audit QA-12).
  it('[source-text check] Import routines is reachable from Profile and from Routines → +', () => {
    expect(readFileSync('src/tracker/components/ImportCard.tsx', 'utf8')).toMatch(/router\.push\('\/import\/routines'\)/);
    expect(readFileSync('src/app/routines/index.tsx', 'utf8')).toMatch(/Import routines from Hevy[\s\S]*router\.push\('\/import\/routines'\)/);
  });
});
