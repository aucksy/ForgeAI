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

import { FEATURES, type Features } from '@/lib/features';
import { BANNED_MEMBER_WORDS, countWord } from '@/lib/words';

import {
  appJsonTextOf,
  kotlinTextOf,
  MOBILE_ROOT,
  sourceFiles,
  stringsXmlTextOf,
  visibleTextOf,
  type VisibleText,
} from '../helpers/visibleText';

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

/** Words a member must never read: one list, shared with the AI note's filter (C9-5, C9-6). */
const BANNED = BANNED_MEMBER_WORDS;

/**
 * Code that is not member-facing, kept small and each with its reason. A path matches when it
 * starts with the entry. C9-1: an entry marked `untilCoach` holds only while the coach is hidden
 * (lib/features.ts). Turn the coach on and the guard reads those folders too, so their sentences
 * must be swept (or wrapped) before the coach can ship.
 */
const ALLOW: readonly { path: string; why: string; untilCoach?: true }[] = [
  // Frozen (CLAUDE.md). Their sentences only reach coach-only cards (insight, recovery, overload).
  { path: 'src/engine/', why: 'frozen; coach-only text', untilCoach: true },
  { path: 'src/services/', why: 'frozen; coach-only text', untilCoach: true },
  // SQL and the frozen repos' developer errors ("Workout session not found"), never shown.
  { path: 'src/db/repos/', why: 'SQL and developer errors' },
  // The prompt sent to the AI note writer: it TELLS the model never to say "PR" / "volume".
  { path: 'src/tracker/services/coachNote.ts', why: 'model prompt' },
  // Search keywords for matching imported workout names, never shown.
  { path: 'src/tracker/services/routineRebuild.ts', why: 'search keywords' },
  // The banned list itself (its labels name the words).
  { path: 'src/lib/words.ts', why: 'the banned-word list' },
];

/** The allow-list in force: the `untilCoach` entries drop out once the coach is on. PURE. */
export function activeAllow(features: Pick<Features, 'coach'>): typeof ALLOW {
  return ALLOW.filter((a) => !(a.untilCoach && features.coach));
}

function allowed(v: VisibleText): boolean {
  return activeAllow(FEATURES).some((a) => v.file.startsWith(a.path));
}

/**
 * C9-3: the Android text a member reads, outside `src/`: notifications and the rest card
 * (modules/forge-rest), the widget (modules/forge-phone), the watch app (android/wear), the app's
 * own strings.xml, and app.json (the app name and Android's permission questions).
 */
function nativeTexts(): VisibleText[] {
  const kt = [
    ...sourceFiles(join(MOBILE_ROOT, 'modules'), ['.kt']),
    ...sourceFiles(join(MOBILE_ROOT, 'android', 'wear', 'src', 'main'), ['.kt']),
  ];
  const xml = [
    ...sourceFiles(join(MOBILE_ROOT, 'modules'), ['strings.xml']),
    ...sourceFiles(join(MOBILE_ROOT, 'android', 'wear', 'src', 'main'), ['strings.xml']),
    join(MOBILE_ROOT, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml'),
  ];
  return [
    ...kt.flatMap((f) => kotlinTextOf(f, MOBILE_ROOT)),
    ...xml.flatMap((f) => stringsXmlTextOf(f, MOBILE_ROOT)),
    ...appJsonTextOf(join(MOBILE_ROOT, 'app.json'), MOBILE_ROOT),
  ];
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

  it('C9-4: a word handed to countWord, tell or say is read, even one lowercase word', () => {
    const dir = mkdtempSync(join(tmpdir(), 'member-words-'));
    const f = join(dir, 'Probe.ts');
    writeFileSync(
      f,
      [
        "const a = countWord(n, 'session');",
        "const b = countWord(n, 'set', String, 'sessions');",
        "tell('volume');",
        "say('pr');",
        "const c = lookUp(n, 'session');",
      ].join(String.fromCharCode(10)),
    );
    const seen = visibleTextOf(f, dir).map((t) => t.text);
    rmSync(dir, { recursive: true, force: true });
    expect(seen).toEqual(expect.arrayContaining(['session', 'sessions', 'volume', 'pr']));
    expect(seen.filter((s) => s === 'session')).toHaveLength(1); // lookUp's key is code
    expect(countWord(2, 'record')).toBe('2 records');
  });

  it('C9-5: "pr", "Pb", "1RM", "e1RM" and "est-1RM" are caught too; "print" and "1 rep" are not', () => {
    const hit = (s: string): boolean => BANNED.some((b) => b.re.test(s));
    for (const s of ['New pr!', 'Pb today', 'Your 1RM', 'e1RM 100', '110 est-1RM']) expect(hit(s), s).toBe(true);
    for (const s of ['print it', 'Best single (estimate)', '1 rep left', 'Record', 'Rings at notification volume']) {
      expect(hit(s), s).toBe(false);
    }
    expect(hit('Total volume')).toBe(true);
  });

  it('C9-1: the coach folders are read the moment the coach is switched on', () => {
    const hidden = activeAllow({ coach: false }).map((a) => a.path);
    const shown = activeAllow({ coach: true }).map((a) => a.path);
    expect(hidden).toEqual(expect.arrayContaining(['src/engine/', 'src/services/']));
    expect(shown).not.toContain('src/engine/');
    expect(shown).not.toContain('src/services/');
    // The coach's own replies, chips, prompts and demo chat are read today, coach on or off.
    expect(ALLOW.some((a) => a.path.startsWith('src/ai') || a.path.startsWith('src/db/seed'))).toBe(false);
  });

  it('keeps the allow-list small and explained', () => {
    expect(ALLOW.length).toBeLessThanOrEqual(6);
    for (const a of ALLOW) expect(a.why.length).toBeGreaterThan(5);
  });
});

describe('C9-3: the Android text outside src/ — notifications, widget, watch, app.json', () => {
  const texts = nativeTexts();

  it('reads the notification, widget, watch and permission text', () => {
    const all = texts.map((t) => t.text);
    expect(all).toEqual(expect.arrayContaining(['Rest is over', 'Skip', 'Complete set', 'ForgeAI']));
    expect(texts.some((t) => t.file.startsWith('android/wear/'))).toBe(true);
    expect(texts.some((t) => t.file.startsWith('modules/forge-phone/') && t.file.endsWith('strings.xml'))).toBe(true);
    expect(texts.some((t) => t.file === 'app.json' && /microphone/.test(t.text))).toBe(true);
  });

  for (const { word, re } of BANNED) {
    it(`no notification, widget, watch screen or permission question says "${word}"`, () => {
      const hits = texts.filter((t) => re.test(t.text)).map((t) => `${t.file}:${t.line} ${t.text.slice(0, 120)}`);
      expect(hits).toEqual([]);
    });
  }

  it('the Kotlin reader sees what is shown, not logs, comments or keys (a probe file)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'member-words-'));
    const f = join(dir, 'Probe.kt');
    const q = String.fromCharCode(34);
    writeFileSync(
      f,
      [
        `/** The ${q}Session done${q} card. */`,
        `.setContentTitle(${q}Session complete${q})`,
        `b.addAction(icon, ${q}Log PR${q}, pi)`,
        `NotificationChannel(CH, ${q}Volume alerts${q}, IMPORTANCE)`,
        `Log.w(TAG, ${q}session volume ${q} + x)`,
        `val k = o.optString(${q}session note${q}, ${q}${q})`,
        `private const val KEY = ${q}session${q}`,
        `// ${q}PR card${q} is gone`,
      ].join(String.fromCharCode(10)),
    );
    const g = join(dir, 'strings.xml');
    writeFileSync(g, `<resources><string name=${q}a${q}>Your sessions</string><string name=${q}b${q} translatable=${q}false${q}>session volume</string></resources>`);
    const seen = [...kotlinTextOf(f, dir), ...stringsXmlTextOf(g, dir)].map((t) => t.text);
    rmSync(dir, { recursive: true, force: true });
    expect(seen).toEqual(['Session complete', 'Log PR', 'Volume alerts', 'Your sessions']);
  });
});
