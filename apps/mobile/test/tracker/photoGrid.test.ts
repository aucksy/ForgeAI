/**
 * Audit Phase 8 (PG-19) — the photo grid's rows for the virtualised list. PURE.
 * The rows must draw the same grid the page drew before: same order, three a row, the last row
 * short and left-aligned, and the same tile width.
 */
import { describe, expect, it } from 'vitest';

import { photoRows, tileWidth } from '@/tracker/lib/photoGrid';

const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, dateISO: `2026-01-${String((i % 28) + 1).padStart(2, '0')}` }));

describe('photoRows', () => {
  it('no photos → no rows (the empty state shows)', () => {
    expect(photoRows([], 3)).toEqual([]);
  });

  it('one photo → one short row', () => {
    expect(photoRows(photos(1), 3)).toEqual([{ key: 'row-p1', photos: [photos(1)[0]] }]);
  });

  it('seven photos → 3, 3, 1 in the order given', () => {
    const rows = photoRows(photos(7), 3);
    expect(rows.map((r) => r.photos.map((p) => p.id))).toEqual([['p1', 'p2', 'p3'], ['p4', 'p5', 'p6'], ['p7']]);
  });

  it('every photo appears exactly once, in order, and every row key is distinct (501 photos)', () => {
    const all = photos(501);
    const rows = photoRows(all, 3);
    expect(rows).toHaveLength(167);
    expect(rows.flatMap((r) => r.photos)).toEqual(all);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(rows.every((r, i) => r.photos.length === (i < rows.length - 1 ? 3 : 501 - 3 * 166))).toBe(true);
  });

  it('a row keeps its key while its first photo stays first (no redraw of the rows above a delete)', () => {
    const before = photoRows(photos(9), 3);
    const after = photoRows(photos(9).filter((p) => p.id !== 'p8'), 3);
    expect(after[0].key).toBe(before[0].key);
    expect(after[1].key).toBe(before[1].key);
  });

  it('a nonsense column count never loops or drops photos', () => {
    expect(photoRows(photos(4), 0).map((r) => r.photos.length)).toEqual([1, 1, 1, 1]);
    expect(photoRows(photos(4), 2.7).map((r) => r.photos.length)).toEqual([2, 2]);
  });
});

describe('tileWidth', () => {
  it('matches the page’s old sum: three tiles and two 8-pt gaps inside 20-pt sides', () => {
    expect(tileWidth(390, 20, 8, 3)).toBe(Math.floor((390 - 40 - 16) / 3));
    expect(tileWidth(360, 20, 8, 3)).toBe(101);
  });
});
