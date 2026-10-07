/**
 * A number with its word, never "1 sets" (v0.25.1: one helper for every count a member
 * reads — screens, share pictures, the coach's replies). PURE.
 *
 *   countWord(1, 'set')            → "1 set"
 *   countWord(3, 'set')            → "3 sets"
 *   countWord(2, 'exercise')       → "2 exercises"
 *   countWord(1240, 'set', fmtInt) → "1,240 sets"
 */
export function countWord(n: number, singular: string, fmt: (n: number) => string = String, plural = `${singular}s`): string {
  return `${fmt(n)} ${n === 1 ? singular : plural}`;
}
