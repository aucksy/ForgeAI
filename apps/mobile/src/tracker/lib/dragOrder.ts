/**
 * Press-and-hold, then drag, to reorder routines in a folder (15 Oct 2026; owner asked, Hevy does
 * it: "tap and hold on a routine to activate drag-and-drop"). The maths, PURE so it is tested here
 * and run unchanged inside the animation (worklet) code:
 *  - `dropIndex`: where the dragged card would land, from the cards' heights and how far it moved;
 *  - `shiftFor`: how far each other card slides to make the gap;
 *  - `movedIds`: the new order to save.
 */

/**
 * The index the card at `from` lands on after moving `dy` pixels (down is +). It crosses a
 * neighbour when its middle passes the neighbour's middle — the feel of every native reorder list.
 */
export function dropIndex(heights: readonly number[], gap: number, from: number, dy: number): number {
  'worklet';
  const n = heights.length;
  if (n === 0 || from < 0 || from >= n) return from;
  let to = from;
  if (dy > 0) {
    let travelled = 0;
    for (let i = from + 1; i < n; i += 1) {
      const need = travelled + gap + heights[i] / 2;
      if (dy > need) {
        to = i;
        travelled += gap + heights[i];
      } else break;
    }
  } else if (dy < 0) {
    let travelled = 0;
    for (let i = from - 1; i >= 0; i -= 1) {
      const need = travelled + gap + heights[i] / 2;
      if (-dy > need) {
        to = i;
        travelled += gap + heights[i];
      } else break;
    }
  }
  return to;
}

/** How far card `i` slides while the card at `from` hovers over `to` (it fills the gap left). */
export function shiftFor(i: number, from: number, to: number, draggedHeight: number, gap: number): number {
  'worklet';
  if (from < 0 || i === from) return 0;
  if (to > from && i > from && i <= to) return -(draggedHeight + gap);
  if (to < from && i < from && i >= to) return draggedHeight + gap;
  return 0;
}

/** The ids with the one at `from` moved to `to`. Null when nothing moved. */
export function movedIds(ids: readonly string[], from: number, to: number): string[] | null {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return null;
  const out = [...ids];
  const [id] = out.splice(from, 1);
  out.splice(to, 0, id);
  return out;
}
