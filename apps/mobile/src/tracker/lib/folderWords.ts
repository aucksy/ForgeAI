/**
 * Fresh-eyes review (5 Nov 2026): a folder's name dropped into a sentence. The import's own folder is
 * called "From Hevy" / "From Strong", so "from From Hevy" and "In From Hevy: every 6 weeks…" read as
 * typos. A name that itself starts with "From" is quoted and called a folder ("from your “From Hevy”
 * folder"); every other name reads as before ("from Push Pull Legs"). PURE.
 */

/** Does this folder name read as a phrase of its own ("From Hevy")? */
function startsWithFrom(name: string): boolean {
  return /^from\s/i.test(name.trim());
}

/** "from Push Pull Legs" / "from your “From Hevy” folder". */
export function fromFolder(name: string): string {
  return startsWithFrom(name) ? `from your “${name.trim()}” folder` : `from ${name}`;
}

/** "In Push Pull Legs" / "In your “From Hevy” folder" (the start of a sentence). */
export function inFolder(name: string): string {
  return startsWithFrom(name) ? `In your “${name.trim()}” folder` : `In ${name}`;
}
