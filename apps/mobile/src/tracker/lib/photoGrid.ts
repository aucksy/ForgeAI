/**
 * Audit Phase 8 (PG-19) — the progress-photo grid as rows, for a virtualised list. PURE.
 *
 * The photos page drew every tile at once (501 photos = 501 images laid out on open). It now
 * hands rows of three to a FlatList, which lays out only the rows near the screen. The rows
 * keep the grid exactly as it was: the photos in the order given (newest first), three to a
 * row, the last row short and left-aligned.
 */

export interface PhotoRow<T> {
  /** Stable while the row's first photo stays first (the list's key). */
  key: string;
  photos: T[];
}

/** `items` in rows of `cols` (at least 1), in order. */
export function photoRows<T extends { id: string }>(items: readonly T[], cols: number): PhotoRow<T>[] {
  const per = Math.max(1, Math.floor(cols));
  const rows: PhotoRow<T>[] = [];
  for (let i = 0; i < items.length; i += per) {
    const photos = items.slice(i, i + per);
    rows.push({ key: `row-${photos[0].id}`, photos });
  }
  return rows;
}

/** The tile's width so `cols` tiles and their gaps fill `width` exactly (rounded down). PURE. */
export function tileWidth(width: number, sidePad: number, gap: number, cols: number): number {
  return Math.floor((width - sidePad * 2 - gap * (cols - 1)) / cols);
}
