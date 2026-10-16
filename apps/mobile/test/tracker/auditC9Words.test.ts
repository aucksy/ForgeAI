/**
 * Audit C9-15, C9-16: a file problem reaches the member as plain words with a next step;
 * a raw parser, file-system or database message goes to the log only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoutineFileProblem, routineFileProblemText } from '@/tracker/plans/routineFile';
import { READ_AGAIN, readProblemText } from '@/tracker/services/importProblem';

afterEach(() => vi.restoreAllMocks());

describe('C9-15: Import from Hevy / Strong', () => {
  it('the readers’ own sentences are shown as they are', () => {
    for (const m of [
      'That file has no rows to import.',
      'That doesn’t look like a Strong export (unexpected columns).',
      'The dates in its Date column could not be read (for example “x”).',
      'This file isn’t a Hevy or Strong export. In Hevy: Settings → Export & Backup Data.',
      'No workouts were found in that file.',
    ]) {
      expect(readProblemText(new Error(m))).toBe(m);
    }
  });

  it('a raw message is logged, and the member is told how to export again', () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const raw = new Error('Unexpected token < in JSON at position 0');
    expect(readProblemText(raw)).toBe(READ_AGAIN);
    expect(READ_AGAIN).toContain('Settings → Export & Backup Data');
    expect(log).toHaveBeenCalledWith('[ForgeErr] import: the file could not be read', raw);
  });
});

describe('C9-16: opening a routine file', () => {
  const saveText = (): string => 'Nothing was changed. Please try again.';

  it('the file’s own reason is shown; a failed save says what was kept', () => {
    expect(routineFileProblemText(new RoutineFileProblem('That file is not a ForgeAI routine file.'), saveText)).toBe(
      'That file is not a ForgeAI routine file.',
    );
    const save = Object.assign(new Error('The routines were not saved.'), { name: 'RoutineSaveError' });
    expect(routineFileProblemText(save, saveText)).toBe('Nothing was changed. Please try again.');
  });

  it('a raw SQLite or file message is never shown', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const shown = routineFileProblemText(new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed'), saveText);
    expect(shown).toBe('That file couldn’t be opened. Ask the sender to share it again, then try again.');
  });
});
