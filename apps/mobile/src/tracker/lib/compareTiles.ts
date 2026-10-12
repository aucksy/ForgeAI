/**
 * The month report's "Against <month>" cards: three equal columns, one number each. PURE.
 *
 * All three numbers share ONE font size, picked from the longest: a 7-character "236,885" on a
 * third of a phone does not fit at the big size, and a shrunk "236,885" beside a full-size "22"
 * looked uneven (design critique, Oct 2026). Each number may still shrink a little to fit.
 */
import { type } from '@/theme/tokens';

/** Longest number this many characters or more ("10,000", "236,885") → the smaller size. */
export const COMPARE_LONG_CHARS = 6;

export function compareValueSize(values: readonly string[]): number {
  const longest = values.reduce((n, v) => Math.max(n, v.length), 0);
  return longest >= COMPARE_LONG_CHARS ? type.size.h3 : type.size.h2;
}
