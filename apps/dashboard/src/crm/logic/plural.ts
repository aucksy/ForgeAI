/**
 * "1 member", "2 members" — a count with its word (UAT U-A8, 17 Oct 2026). PURE.
 *
 * The Members page, the Today "Fees due" tile and Settings' data line said "1 members" and
 * "1 payments" for a gym with one of them, which is the first thing a new owner sees.
 */
export function countOf(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
