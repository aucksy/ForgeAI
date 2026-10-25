/**
 * R-123: the phone test's backup file (qa/fixtures/qa-backup.zip, made by qa/tools/make_backup_zip.py
 * the way ForgeAI 0.55.2 writes one) opens with the app's own reader and says exactly what part UBK
 * (qa/uat-bk.yaml) looks for on screen. If the format moves, this fails here, not on a phone.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { openBackup } from '@/backup/backupOpen';
import { MemIo } from './memIo';

describe('the phone test backup', () => {
  it('opens, and its summary is the line part UBK checks', async () => {
    const io = new MemIo();
    io.put('file:///cache/qa-backup.zip', Uint8Array.from(readFileSync(path.resolve(__dirname, '../../qa/fixtures/qa-backup.zip'))));
    const r = await openBackup(io, 'file:///cache/qa-backup.zip');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.summary).toBe('3 workouts, 4 routines, 2 measurements and 1 photo, saved on 25 Oct 2026 by ForgeAI 0.55.2');
    const flow = readFileSync(path.resolve(__dirname, '../../qa/uat-bk.yaml'), 'utf8');
    expect(flow).toContain("'3 workouts, 4 routines, 2 measurements and 1 photo, saved on 25 Oct 2026 by ForgeAI 0\\.55\\.2\\.'");
    expect(r.backup.file.settings['forgeai-tracker-prefs']).toEqual({ weeklyGoal: 5, weightJump: 'large', repRange: 'strength' });
  });
});
