/**
 * Audit HI-04 — a workout's name and notes, as History and the workout page show them. PURE.
 *
 * The NAME is `sessionTitle` (`tracker/services/finishSummary.ts`): the name it was saved
 * with ("Push 1", "Morning workout"), else its day type ("Push Day").
 *
 * The NOTES: an imported Hevy workout keeps its title as the first line of its notes (that is
 * where older imports put the name). Once the name shows as the title, repeating it as the
 * note's first line says nothing — so it is left out; the rest of the note stays exactly.
 */
export function shownNotes(title: string | null | undefined, notes: string | null | undefined): string | null {
  const raw = (notes ?? '').replace(/\r\n?/g, '\n');
  if (raw.trim() === '') return null;
  const t = (title ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (t) {
    const lines = raw.split('\n');
    if (lines[0].replace(/\s+/g, ' ').trim().toLowerCase() === t) {
      const rest = lines.slice(1).join('\n').trim();
      return rest === '' ? null : rest;
    }
  }
  return raw.trim();
}
