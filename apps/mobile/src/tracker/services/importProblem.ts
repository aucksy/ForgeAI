/**
 * The words the Import screen shows when a file can't be read (audit C9-15).
 *
 * The Hevy and Strong readers throw plain sentences of their own ("That file has no rows to
 * import.", "That doesn't look like a Strong export…", "The dates in its Date column could not
 * be read…"). Anything else (a file-system error, the spreadsheet library's "Unexpected token <
 * in JSON at position 0") used to be appended to "Couldn't read that file." as it was. Now it goes
 * to the log, and the member reads what to do instead. PURE apart from the log line.
 */

/** The readers' own sentences: they start like this, and are shown as they are. */
const OWN_SENTENCE = /^(This file isn’t|That file|That doesn’t look like|The dates in its|Could not read that file\.|Couldn’t read that file\.|No workouts were found|The file is no longer open)/;

export const READ_AGAIN =
  'Couldn’t read that file. Export it again (Hevy: Settings → Export & Backup Data; Strong: Settings → Export Strong Data) and pick the new file.';

export function readProblemText(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  if (OWN_SENTENCE.test(m)) return m;
  console.warn('[ForgeErr] import: the file could not be read', e);
  return READ_AGAIN;
}
