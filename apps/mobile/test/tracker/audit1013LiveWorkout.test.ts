/**
 * 13 Oct 2026 audit of v0.37.0 — live workout fixes that live in screens (no pure function to
 * call): read from the source, so a later edit cannot quietly undo them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

describe('audit 13 Oct 2026: live workout screens', () => {
  it('A4: Create in a workout\'s picker carries the exercises already ticked, and the form adds them with the new one', () => {
    const picker = src('src/app/session/add-exercise.tsx');
    expect(picker).toMatch(/const withIds = picked\.map\(\(p\) => p\.id\)\.join\(','\);/);
    expect(picker).toMatch(/with: withIds/);
    const form = src('src/app/library/new.tsx');
    expect(form).toMatch(/params\.with\.split\(','\)/);
    expect(form).toMatch(/addExercises\(\[\.\.\.ticked, made\]\)/);
  });

  it('A6: the sheet\'s ✓ "Done" uses the look\'s on-accent colour, never a fixed near-black', () => {
    const s = src('src/tracker/components/DoneSheet.tsx');
    expect(s).not.toMatch(/#1A0F08/i);
    expect(s).toMatch(/name="check" size=\{22\} color=\{color\.onAccent\}/);
  });

  it('A1: the set row\'s number boxes draw at the size that fits (no extra text scaling on top)', () => {
    const s = src('src/tracker/components/SetRow.tsx');
    expect(s).toMatch(/allowFontScaling=\{false\}\s*\n\s*style=\{inputStyle\(boxFontSize\(p\.value, L\.inputW, fontScale, type\.size\.body\)\)\}/);
  });
});
