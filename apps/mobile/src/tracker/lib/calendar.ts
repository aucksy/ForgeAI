/** Month-calendar maths for the workout date picker (Phase 1). PURE. */
import { toISO } from '@/lib/date';

/** Monday-first grid of ISO days (null = padding) for the month containing `iso`. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const days = new Date(year, month + 1, 0).getDate();
  const out: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) out.push(toISO(new Date(year, month, d)));
  while (out.length % 7 !== 0) out.push(null);
  return out;
}
