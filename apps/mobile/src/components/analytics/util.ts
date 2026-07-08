/** Small helpers local to the analytics screen. */

/**
 * Drop leading all-zero points (weeks before the member's history began) so
 * charts open on real data instead of a dead left half. Always keeps >= 1 item.
 */
export function trimLeading<T>(arr: T[], isZero: (t: T) => boolean): T[] {
  let i = 0;
  while (i < arr.length - 1 && isZero(arr[i])) i++;
  return arr.slice(i);
}

/** 'chest' -> 'Chest' (muscle-group labels). */
export function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/** ~6 x-axis labels regardless of point count. */
export function labelStep(n: number): number {
  return Math.max(1, Math.ceil(n / 6));
}
