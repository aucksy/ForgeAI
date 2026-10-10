/**
 * Audit Phase 7, packet B — one design language (docs/DESIGN-LANGUAGE.md).
 *
 *  1. The shared spellings: "kg lifted", "9 Oct 2025", "1h 05m", a notice in the app's own sheet.
 *  2. A guard: the words a member reads never say "session", "PR", "volume" or "kg moved".
 *     It reads every screen (.tsx) and every member-facing .ts file with the TypeScript parser
 *     (test/helpers/visibleText.ts) — JSX text, and string / template literals that look like
 *     words. A new screen that says "Session volume" fails here.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { answerConfirm, useConfirmStore } from '@/components/ui/confirmStore';
import { tinyDateWithYear } from '@/lib/date';
import { fmtTotalTime } from '@/lib/format';
import { NOTICE_BUTTON, tell } from '@/lib/tell';
import { liftedWords } from '@/lib/units';

import { MOBILE_ROOT, sourceFiles, visibleTextOf, type VisibleText } from '../helpers/visibleText';

describe('the shared spellings', () => {
  it('"kg lifted" / "lb lifted", with a capital only to start a label', () => {
    expect(liftedWords('metric')).toBe('kg lifted');
    expect(liftedWords('imperial')).toBe('lb lifted');
    expect(liftedWords('metric', true)).toBe('Kg lifted');
    expect(liftedWords('imperial', true)).toBe('Lb lifted');
  });

  it('a list date says its year only when it is not this year', () => {
    expect(tinyDateWithYear('2026-10-09', '2026-10-11')).toBe('9 Oct');
    expect(tinyDateWithYear('2025-12-05', '2026-10-11')).toBe('5 Dec 2025');
  });

  it('one spelling for a length of time: "45 min", "1h 05m", "2h" — never "0m 12s" or "11 h 20 min"', () => {
    expect(fmtTotalTime(12)).toBe('1 min');
    expect(fmtTotalTime(45 * 60)).toBe('45 min');
    expect(fmtTotalTime(65 * 60)).toBe('1h 05m');
    expect(fmtTotalTime(2 * 3600)).toBe('2h');
    expect(fmtTotalTime(25 * 3600 + 39 * 60)).toBe('25h 39m');
  });

  it('a notice opens the app’s own sheet with one named button, and resolves when closed', async () => {
    const shown = tell('Could not save', 'Please try again.');
    const req = useConfirmStore.getState().request;
    expect(req).toMatchObject({ title: 'Could not save', body: 'Please try again.', confirmLabel: NOTICE_BUTTON, notice: true });
    expect(NOTICE_BUTTON).not.toMatch(/^(OK|Yes)$/i);
    answerConfirm(req!.id, true);
    await expect(shown).resolves.toBeUndefined();
    expect(useConfirmStore.getState().request).toBeNull();
  });
});

/** Words a member must never read (DESIGN-LANGUAGE.md, "Words: one word per idea"). */
const BANNED: readonly { word: string; re: RegExp }[] = [
  { word: 'session', re: /\bsessions?\b/i },
  { word: 'PR', re: /\bP[RB]s?\b/ },
  { word: 'volume', re: /\bvolumes?\b/i },
  { word: 'kg moved', re: /\b(kg|lbs?)\s+moved\b/i },
  { word: 'vol', re: /\bvol\b/i },
];

/**
 * Code that is not member-facing, kept small and each with its reason. A path matches when it
 * starts with the entry.
 */
const ALLOW: readonly { path: string; why: string }[] = [
  // The AI coach is hidden (lib/features.ts, coach: false), and much of this is the model's own
  // prompt and tool descriptions, which a member never reads. Swept when the coach comes back.
  { path: 'src/ai/', why: 'hidden coach + model prompts' },
  // Frozen (CLAUDE.md). Their sentences only reach coach-only cards (insight, recovery, overload).
  { path: 'src/engine/', why: 'frozen; coach-only text' },
  { path: 'src/services/', why: 'frozen; coach-only text' },
  // SQL, the schema and the coach's demo chat seed.
  { path: 'src/db/', why: 'SQL and the hidden coach demo seed' },
  // The prompt sent to the AI note writer: it TELLS the model never to say "PR" / "volume".
  { path: 'src/tracker/services/coachNote.ts', why: 'model prompt' },
  // Search keywords for matching imported workout names, never shown.
  { path: 'src/tracker/services/routineRebuild.ts', why: 'search keywords' },
];

function allowed(v: VisibleText): boolean {
  return ALLOW.some((a) => v.file.startsWith(a.path));
}

describe('one word per idea — the guard', () => {
  const files = sourceFiles(join(MOBILE_ROOT, 'src'), ['.tsx', '.ts']);
  const texts = files.flatMap((f) => visibleTextOf(f, MOBILE_ROOT));

  it('reads enough of the app to mean something', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(texts.some((t) => t.text === 'Workout in progress')).toBe(true);
  });

  for (const { word, re } of BANNED) {
    it(`no screen, sheet, notification or picture says "${word}"`, () => {
      const hits = texts.filter((t) => !allowed(t) && re.test(t.text)).map((t) => `${t.file}:${t.line} ${t.text.slice(0, 120)}`);
      expect(hits).toEqual([]);
    });
  }

  it('the reader sees words, not code (a probe file)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'member-words-'));
    const f = join(dir, 'Probe.tsx');
    writeFileSync(
      f,
      [
        "import { x } from '@/session/volume';",
        'export function P({ n }: { n: number }) {',
        "  const sql = 'SELECT COUNT(*) FROM workout_sessions';",
        "  if (kind === 'session') go('/session/active');",
        '  return (',
        '    <Screen title="Log a session">',
        '      <Icon name="volume" />',
        "      <Text>{n === 1 ? 'session' : 'sessions'}</Text>",
        '      <Text>Total volume</Text>',
        '    </Screen>',
        '  );',
        '}',
      ].join(String.fromCharCode(10)),
    );
    const seen = visibleTextOf(f, dir).map((t) => t.text);
    rmSync(dir, { recursive: true, force: true });
    expect(seen).toEqual(expect.arrayContaining(['Log a session', 'session', 'sessions', 'Total volume']));
    expect(seen).not.toContain('volume'); // the icon's name
    expect(seen.some((s) => s.includes('/session/') || s.startsWith('SELECT'))).toBe(false);
  });

  it('keeps the allow-list small and explained', () => {
    expect(ALLOW.length).toBeLessThanOrEqual(6);
    for (const a of ALLOW) expect(a.why.length).toBeGreaterThan(5);
  });
});
