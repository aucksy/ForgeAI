/**
 * Audit Phase 7 (accessibility): the pure rules behind the shared pieces — how far text may
 * grow with the phone's font size, how big a touch target is, and what a screen reader says
 * for a number. No React Native imports, so the unit tests can load it.
 */

/**
 * How many times its own size a piece of text may grow when the member raises the phone's
 * font size. Body text grows the most; big numerals and page titles grow less, because they
 * are already large and they sit in boxes that must keep their numbers whole.
 */
export const TEXT_SCALE_CAP = {
  /** Body, labels, captions (up to 18 sp). */
  body: 1.6,
  /** Section and card headings, stat numerals (19–27 sp). */
  heading: 1.4,
  /** Page titles (28–39 sp). */
  title: 1.3,
  /** Hero numerals (40 sp and up). */
  hero: 1.2,
  /** Tab-bar labels: four share one row, so they grow the least. */
  tabLabel: 1.3,
  /** A number drawn inside a fixed shape (the middle of a ring). */
  inShape: 1.2,
} as const;

/** The growth cap for text of this base size (no size given = the 14 sp default = body). */
export function textScaleCap(fontSize: number | null | undefined): number {
  if (typeof fontSize !== 'number' || !(fontSize > 0) || fontSize <= 18) return TEXT_SCALE_CAP.body;
  if (fontSize < 28) return TEXT_SCALE_CAP.heading;
  if (fontSize < 40) return TEXT_SCALE_CAP.title;
  return TEXT_SCALE_CAP.hero;
}

/**
 * The `maxFontSizeMultiplier` the app's `Text` passes on, or undefined for none. A screen's own
 * cap always wins. A Text NESTED in another Text with no size of its own passes none, so it keeps
 * its parent's cap (a nested span inherits it) — never the body cap under a capped heading. PURE.
 */
export function textCapProp(
  given: number | null | undefined,
  fontSize: number | null | undefined,
  nested: boolean,
): number | undefined {
  if (given != null) return given;
  if (nested && typeof fontSize !== 'number') return undefined;
  return textScaleCap(fontSize);
}

/** The smallest touch target, in dp (design language: "every tap target at least 48 dp"). */
export const MIN_TOUCH = 48;

/** Extra touch area on each side so a `size`-dp control is at least 48 dp to the finger. */
export function hitSlopFor(size: number, min: number = MIN_TOUCH): number {
  if (!(size > 0)) return Math.ceil(min / 2);
  return Math.max(0, Math.ceil((min - size) / 2));
}

export type DeltaDirection = 'up' | 'down' | 'same';

/** Which way a change reads: "+3" / "+12%" up, "−2" / "-2" down, anything else ("Same") same. */
export function deltaDirection(text: string): DeltaDirection {
  const t = text.trim();
  if (t.startsWith('+')) return 'up';
  // A true minus (U+2212) or a hyphen; "−0" still reads as a fall in words.
  if (t.startsWith('−') || t.startsWith('-')) return 'down';
  return 'same';
}

/** A change in words, for a screen reader: "+3" → "up 3", "−12%" → "down 12 %", "Same" → "same". */
export function deltaWords(text: string): string {
  const dir = deltaDirection(text);
  const rest = text.trim().replace(/^[+\-−]\s*/, '').replace(/(\d)%$/, '$1 %');
  if (dir === 'same') return text.trim().toLowerCase() || 'same';
  return `${dir} ${rest}`;
}

/** Joins the parts a tile shows into one spoken line, skipping blanks: "Recovery, 82 Primed, up 3". */
export function statLabel(parts: {
  label: string;
  value: string;
  unit?: string | null;
  delta?: string | null;
}): string {
  const value = [parts.value, parts.unit].filter((p) => p != null && String(p).trim() !== '').join(' ');
  return [parts.label, value, parts.delta ? deltaWords(parts.delta) : null]
    .filter((p): p is string => p != null && p.trim() !== '')
    .join(', ');
}

/**
 * What a progress ring says: its own words when it has them ("1,420 of 2,200"), else a
 * percentage; a caller's title leads ("Calories, 1,420 of 2,200").
 */
export function ringLabel(parts: {
  title?: string | null;
  label?: string | null;
  sublabel?: string | null;
  value: number;
  max: number;
}): string {
  const words = [parts.label, parts.sublabel].filter((p): p is string => p != null && p.trim() !== '').join(' ');
  const pct = parts.max > 0 && Number.isFinite(parts.value) ? Math.round(Math.min(Math.max(parts.value / parts.max, 0), 1) * 100) : 0;
  const body = words || `${pct} %`;
  return parts.title && parts.title.trim() !== '' ? `${parts.title}, ${body}` : body;
}

/**
 * Whether an error line should be spoken now: when it appears, and whenever its words change.
 *
 * ONE mechanism, on purpose (review fix): error lines (`InlineError`, `LoadError`, the welcome
 * and Profile field lines) are spoken by `announceForAccessibility` and carry NO
 * `accessibilityLiveRegion`. With both, TalkBack said the line twice; a live region alone
 * misses a line that has only just been added, and iOS has none at all.
 */
export function shouldAnnounce(prev: string | null | undefined, next: string | null | undefined): boolean {
  if (!next) return false;
  return next !== prev;
}
