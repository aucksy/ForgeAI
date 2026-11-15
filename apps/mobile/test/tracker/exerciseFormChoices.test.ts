/**
 * R-572 (owner, 15 Nov 2026, option A): the New exercise / Edit exercise form is one card of rows, each
 * opening a sheet. The pure words and groups (src/tracker/components/exerciseForm/formChoices.ts), and the
 * screen's wiring read from its source (what a phone test cannot see on every path).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MUSCLES } from '@/tracker/catalog/muscles';
import { alsoWorksText, groupsWithout, JOINT_WORDS, mediaWords, MUSCLE_GROUPS, SHEET_WORDS } from '@/tracker/components/exerciseForm/formChoices';

const read = (p: string): string => readFileSync(join(__dirname, '..', '..', p), 'utf8');

describe('R-572: the muscle sheets group every muscle once', () => {
  it('the five headings hold every muscle exactly once, top of the body to the bottom', () => {
    expect(MUSCLE_GROUPS.map((g) => g.title)).toEqual(['Chest and shoulders', 'Back', 'Arms and core', 'Legs', 'Other']);
    const all = MUSCLE_GROUPS.flatMap((g) => g.muscles);
    expect([...all].sort()).toEqual([...MUSCLES].sort());
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual([...MUSCLES]);
  });

  it('"Also works" leaves out the main muscle, and a heading left empty goes too', () => {
    const g = groupsWithout('cardio');
    expect(g.map((x) => x.title)).not.toContain('Other');
    expect(g.flatMap((x) => x.muscles)).not.toContain('cardio');
    expect(groupsWithout(null)).toHaveLength(5);
  });
});

describe('R-572: the row values', () => {
  it('"Also works" says None, names one or two, and counts the rest', () => {
    expect(alsoWorksText([], 'side_delts')).toBe('None');
    expect(alsoWorksText(['side_delts'], 'side_delts')).toBe('None');
    expect(alsoWorksText(['front_delts', 'traps'], 'side_delts')).toBe('Front shoulders, Traps');
    expect(alsoWorksText(['front_delts', 'traps', 'triceps', 'abs'], null)).toBe('Front shoulders, Traps and 2 more');
  });

  it('every sheet line and the photo words are complete sentences (owner style: no fragments)', () => {
    const w = mediaWords(30, false);
    const lines = [...Object.values(SHEET_WORDS), w.addLine, w.sheetLine, w.galleryLine, w.photoLine, w.videoLine, w.setLine, JOINT_WORDS.one.detail, JOINT_WORDS.several.detail];
    for (const l of lines) expect(l).toMatch(/^[A-Z"].*[.]$/);
    expect(w.videoLine).toBe('You can record up to 30 seconds.');
    expect(mediaWords(30, true).addLine).toContain('instead of our picture');
  });
});

describe('R-572: the screen', () => {
  const f = read('src/app/library/new.tsx');

  it('Save is pinned under the scrolling page, with the same labels as before', () => {
    expect(f).toContain('<Screen scroll={false}');
    expect(f).toMatch(/<\/ScrollView>\s*\n\s*\{\/\* R-572: Save stays pinned/);
    expect(f).toContain("missing ?? (existing ? 'Save changes' : forWorkout ? 'Save and add to workout' : 'Save exercise')");
  });

  it('rows that do not apply keep their rules (distance unit, body weight, joints and the weight step)', () => {
    expect(f).toMatch(/logType === 'distance' \|\| logType === 'time_distance'\s*\n\s*\? \[\{ kind: 'dist'/);
    expect(f).toMatch(/isBodyweightType\(logType\)\s*\n\s*\? \[\{ kind: 'bodyweight'/);
    expect(f).toMatch(/usesWeight\(logType\)\s*\n\s*\? \[\s*\n\s*\{\s*\n\s*kind: 'joints'/);
    expect(f).toContain("locked: typeLocked");
  });

  it('a library exercise shows only its photo or video; the sheet closes before the camera opens', () => {
    expect(f).toMatch(/\{isLibrary \? null : \(\s*\n\s*<>\s*\n\s*<ChoiceSheet/);
    expect(f).toMatch(/setOpen\(null\);\s*\n\s*setTimeout\(\(\) => void addMedia\(from\), SHEET_CLOSE_MS\);/);
  });
});
