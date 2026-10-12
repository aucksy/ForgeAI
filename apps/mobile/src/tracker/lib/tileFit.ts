/**
 * 12 Oct 2026 design pass — will a Dashboard tile's name fit on one line BESIDE its icon? PURE.
 *
 * The owner's phone runs a large font AND a large display size; there "Statistics" wrapped inside
 * the word ("Statistic / s"). The tiles are two equal columns of the screen (20 dp page margins,
 * 12 dp between), each with 16 dp padding, a 1 dp border, a 22 dp icon and a 12 dp gap. A word's
 * width is summed from rough Manrope SemiBold letter widths, plus 5 % (on the emulator at 1.0:
 * "Statistics" 70 dp, "Measures" 71 dp; this says 71 and 72). When the longest name would not
 * fit beside the icon, the icon goes above it, where the name has the tile's whole width. All four tiles switch together, so the grid stays even.
 */
const PAGE_X = 20;
const GAP = 12;
const PAD_X = 16;
const BORDER = 1;
const ICON = 22;
const ICON_GAP = 12;
const FONT = 15;
const MARGIN = 1.05;

/** A letter's rough width in em (Manrope SemiBold). */
function em(ch: string): number {
  if ('ijlt'.includes(ch)) return 0.32;
  if ('fr'.includes(ch)) return 0.38;
  if ('mw'.includes(ch)) return 0.85;
  if ('MW'.includes(ch)) return 0.9;
  if (ch === ' ') return 0.26;
  if (ch >= 'A' && ch <= 'Z') return 0.68;
  return 0.56;
}

/** The width a tile's name needs at this font scale, in dp. PURE. */
export function tileLabelWidth(label: string, fontScale: number): number {
  let w = 0;
  for (const ch of label) w += em(ch);
  return w * FONT * Math.max(1, fontScale) * MARGIN;
}

/** True when the icon must sit ABOVE the names (some name would not fit beside it). PURE. */
export function dashboardTileStacked(windowWidth: number, fontScale: number, labels: readonly string[]): boolean {
  const tile = (windowWidth - 2 * PAGE_X - GAP) / 2;
  const room = tile - 2 * PAD_X - 2 * BORDER - ICON - ICON_GAP;
  return labels.some((l) => tileLabelWidth(l, fontScale) > room);
}
