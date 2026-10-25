/** R-123: the backup file's shape, its words, and which versions it reads. PURE, made-up data. */
import { describe, expect, it } from 'vitest';

import {
  backupFileName,
  backupSummary,
  DAMAGED_BACKUP,
  FORGEAI_RENAMES,
  NEWER_BACKUP,
  NOT_A_BACKUP,
  parseBackup,
  photoEntryName,
  pickSettings,
  safeId,
  SETTINGS_KEYS,
} from '@/backup/backupFormat';
import { FIELDS_LEFT_OUT } from '@/backup/backupCoverage';
import { settingsToApply } from '@/backup/backupSettings';
import { choiceHelp, replaceQuestion, restoredText, savingText } from '@/backup/backupText';
import { PACK_VERSION } from '@/cloud/pack';

const base = { format: 'mettleup-backup', formatVersion: 1, packVersion: PACK_VERSION, app: 'MettleUp', appVersion: '0.57.0', createdAt: '2026-10-25T12:00:00.000Z', units: 'metric' };

describe('reading a backup', () => {
  it('a minimal file (only the header and its records) reads: missing parts are empty', () => {
    const r = parseBackup(JSON.stringify({ ...base, items: [['b', '2026-10-01', [80]]] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.counts.bodyWeights).toBe(1);
    expect(r.file).toMatchObject({ photos: [], settings: {}, hiddenExercises: [], libraryEdits: [], meta: {}, rows: {} });
  });

  it('an older pack version reads; a newer format or pack version is refused with what to do', () => {
    expect(parseBackup(JSON.stringify({ ...base, packVersion: 0, items: [] })).ok).toBe(true);
    expect(parseBackup(JSON.stringify({ ...base, packVersion: PACK_VERSION + 1, items: [] }))).toEqual({ ok: false, why: NEWER_BACKUP });
    expect(parseBackup(JSON.stringify({ ...base, formatVersion: 2, items: [] }))).toEqual({ ok: false, why: NEWER_BACKUP });
  });

  it('unknown record kinds and broken records are skipped, never fatal', () => {
    const r = parseBackup(JSON.stringify({ ...base, items: [['z', 'a', [1]], ['w', 5, []], 'junk', ['m', '2026-10-01|waist', [80]]], photos: [{ kind: 'video', id: 'a', file: 'x' }] }));
    expect(r.ok && r.skipped).toBe(4);
    expect(r.ok && r.file.items).toEqual([['m', '2026-10-01|waist', [80]]]);
  });

  it('junk is refused in plain words', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, why: NOT_A_BACKUP });
    expect(parseBackup('[]')).toEqual({ ok: false, why: NOT_A_BACKUP });
    expect(parseBackup(JSON.stringify({ app: 'forgeai', tables: {} }))).toEqual({ ok: false, why: NOT_A_BACKUP });
    expect(parseBackup(JSON.stringify({ format: 'mettleup-backup' }))).toEqual({ ok: false, why: DAMAGED_BACKUP });
  });

  it('settings: only fields this version saves itself are read', () => {
    const r = parseBackup(JSON.stringify({ ...base, items: [], settings: { 'forgeai-tracker-prefs': { weightJump: 'large', somethingNew: 1 }, 'not-a-store': { a: 1 } } }));
    expect(r.ok && r.file.settings).toEqual({ 'forgeai-tracker-prefs': { weightJump: 'large' } });
  });
});

describe('ForgeAI 0.55.1 / 0.55.2 settings', () => {
  // Every saved field of ForgeAI 0.55.1's stores (read from the v0.55.1 tag, 25 Oct 2026).
  const FORGEAI_0551: Record<string, string[]> = {
    'forgeai-settings': ['ai', 'unitSystem', 'language'],
    'forgeai-tracker-prefs': ['advancedSets', 'coachNotes', 'sounds', 'restSound', 'bodyFigure', 'weeklyGoal', 'chartMetric', 'chartRange', 'previousFrom', 'shareSize', 'shareLook', 'weightJump', 'repRange', 'inUseAfterSet'],
    'forgeai-plate-setup': ['metric', 'imperial'],
    'forgeai-rest-alert-prefs': ['exactAsked', 'exactAnswer', 'ringThroughDnd'],
    'forgeai-phone-prefs': ['healthConnect', 'remindersOn', 'reminderDays', 'reminderMinutes', 'reminderChosen', 'healthUnsent', 'healthLast', 'gymRemindersOn'],
    'forgeai-muscle-tips': ['on', 'muted', 'snoozedUntil', 'notNow', 'shown'],
    'forgeai-folder-open': ['open'],
    meta: ['restTimerDefaultSec', 'photo_backup_on'],
  };

  it('each one is restored under MettleUp\'s name, or stays on the phone for a stated reason', () => {
    for (const [store, fields] of Object.entries(FORGEAI_0551)) {
      for (const f of fields) {
        const name = FORGEAI_RENAMES[`${store}.${f}`] ?? f;
        const carried = SETTINGS_KEYS[store]?.includes(name) ?? false;
        const left = (FIELDS_LEFT_OUT[store] ?? {})[name] != null;
        expect(carried || left, `${store}.${f}`).toBe(true);
      }
    }
  });

  it('a ForgeAI file\'s settings read as MettleUp\'s (next-weight rules included)', () => {
    const r = parseBackup(JSON.stringify({ ...base, app: 'ForgeAI', appVersion: '0.55.2', items: [], settings: { 'forgeai-tracker-prefs': { weightJump: 'small', repRange: 'higher' } } }));
    expect(r.ok && r.file.settings['forgeai-tracker-prefs']).toEqual({ weightJump: 'small', repRange: 'higher' });
    expect(r.ok && r.file.app).toBe('ForgeAI');
  });
});

describe('settings picked for a backup', () => {
  it('only the listed fields, as plain data', () => {
    const s = pickSettings({
      'forgeai-settings': { unitSystem: 'imperial', language: 'hi', ai: { provider: 'groq' }, setUnitSystem: () => undefined },
      'forgeai-phone-prefs': { remindersOn: true, reminderDays: [1, 3], healthUnsent: ['w1'], healthConnect: true },
      'forgeai-gym-shop': { link: 'secret' },
    });
    expect(s).toEqual({ 'forgeai-settings': { unitSystem: 'imperial', language: 'hi' }, 'forgeai-phone-prefs': { remindersOn: true, reminderDays: [1, 3], healthConnect: true } });
  });

  it('a restore never switches Health Connect on by itself, and says it was on', () => {
    const r = settingsToApply({ 'forgeai-phone-prefs': { healthConnect: true, remindersOn: true } }, true);
    expect(r).toEqual({ blob: { 'forgeai-phone-prefs': { remindersOn: true } }, healthConnectWasOn: true });
    expect(settingsToApply({ 'forgeai-phone-prefs': { healthConnect: true } }, false).blob).toEqual({ 'forgeai-phone-prefs': { healthConnect: true } });
  });
});

describe('names and words', () => {
  it('file and photo names are safe', () => {
    expect(backupFileName('2026-10-25')).toBe('mettleup-backup-2026-10-25.zip');
    expect(photoEntryName('progress', 'abc-1', 'file:///x/abc-1.PNG')).toBe('photos/progress-abc-1.png');
    expect(photoEntryName('exercise', 'k9', 'file:///x/v.mov', true)).toBe('photos/exercise-k9.mov');
    expect(safeId('../../etc')).toBeNull();
  });

  it('the summary says what is inside and who made it', () => {
    const counts = { workouts: 512, folders: 3, routines: 9, ownExercises: 4, bodyWeights: 30, measurements: 10, photos: 12 };
    expect(backupSummary({ counts, createdAt: '2026-10-25T12:00:00.000Z', app: 'ForgeAI', appVersion: '0.55.2' })).toBe(
      '512 workouts, 9 routines, 40 measurements and 12 photos, saved on 25 Oct 2026 by ForgeAI 0.55.2',
    );
    expect(backupSummary({ counts: { ...counts, workouts: 1, routines: 1, bodyWeights: 0, measurements: 1, photos: 0 }, createdAt: 'x', app: 'MettleUp', appVersion: '' })).toBe(
      '1 workout, 1 routine, 1 measurement, saved on an unknown day by MettleUp',
    );
  });

  it('the screens\' words never say "volume", "PR" or "session"', () => {
    const lines = [
      savingText(37, 210),
      choiceHelp(12),
      choiceHelp(0),
      replaceQuestion(12, 3).body,
      restoredText({ mode: 'add', workouts: 2, routines: 9, measurements: 1, photos: 1, photosFailed: 1, alreadyHere: 3 }),
    ];
    expect(savingText(37, 210)).toBe('Saving 37 of 210 photos…');
    for (const l of lines) expect(l).not.toMatch(/\b(volume|PR|PRs|session|sessions)\b/i);
  });
});
