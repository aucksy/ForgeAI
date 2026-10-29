/**
 * The floating feedback button (R-149, 28 Oct 2026): a small round button on every screen of the
 * member app, so testers can say what is wrong where it happens. Tap → a sheet: type, or speak with
 * the keyboard's own microphone (the app has no microphone permission, launch C5), then Send.
 *
 * PURE rules only (the screen and the store read them; test/lib/feedbackButton.test.ts):
 *  - where it may sit: docked on the left or right edge, never over the top bar of a screen and never
 *    over the bottom (tab bar, the minimised workout bar, a screen's main button);
 *  - when it hides: switched off in Settings, the keyboard is open, the feedback page itself, and the
 *    live workout screen (that screen has its own button in its top bar, clear of the set ticks,
 *    the rest timer and Finish);
 *  - the screen name sent with the message.
 */

export const FEEDBACK_BUTTON_SIZE = 48;
/** Room kept clear at the top: the status bar is added to it (a screen's back button and title). */
export const TOP_CLEAR = 76;
/** Room kept clear at the bottom: the tab bar, the minimised workout bar, a screen's main button. */
export const BOTTOM_CLEAR = 150;
/** Gap between the button and the screen edge it docks to. */
export const EDGE_GAP = 6;
/** A finger that moves less than this is a tap, not a drag. */
export const DRAG_SLOP = 8;

export type DockSide = 'left' | 'right';
/** Where the member left the button: which edge, and how far down the free band (0 top … 1 bottom). */
export interface ButtonSpot {
  side: DockSide;
  y: number;
}
// 0.60.0 phone test (part G, both profiles): at 0.62 the button sat mid-screen on the right, over a
// list row's own "More" button once that row was scrolled to the middle. Lowest spot of the free band
// (still clear of the tab bar and a screen's main button), where list ends scroll out from under it.
export const DEFAULT_SPOT: ButtonSpot = { side: 'right', y: 1 };

/** Screens where the floating button never shows. */
/**
 * Screens where the floating button never shows. 0.60.0 phone test (part UH): on the Calendar the
 * docked button sat over the Sunday column and took a tap meant for a day, so the Calendar has none
 * (its grid fills the width; the Settings page and every other screen still reach feedback).
 */
const HIDDEN_ON = new Set(['/session/active', '/settings/feedback', '/calendar']);

export interface ScreenRoom {
  width: number;
  height: number;
  insetTop: number;
  insetBottom: number;
}

/** The top and bottom limits for the button's top edge. A tiny screen still gets one spot. */
export function freeBand(room: ScreenRoom): { minY: number; maxY: number } {
  const minY = Math.max(0, room.insetTop) + TOP_CLEAR;
  const maxY = room.height - Math.max(0, room.insetBottom) - BOTTOM_CLEAR - FEEDBACK_BUTTON_SIZE;
  return maxY >= minY ? { minY, maxY } : { minY, maxY: minY };
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_SPOT.y);

/** The button's top-left corner for a saved spot. */
export function spotToXY(spot: ButtonSpot, room: ScreenRoom): { x: number; y: number } {
  const { minY, maxY } = freeBand(room);
  const x = spot.side === 'left' ? EDGE_GAP : room.width - FEEDBACK_BUTTON_SIZE - EDGE_GAP;
  return { x, y: Math.round(minY + clamp01(spot.y) * (maxY - minY)) };
}

/** Let go after a drag: dock to the nearer edge and stay inside the free band. */
export function spotFromDrop(x: number, y: number, room: ScreenRoom): ButtonSpot {
  const { minY, maxY } = freeBand(room);
  const side: DockSide = x + FEEDBACK_BUTTON_SIZE / 2 < room.width / 2 ? 'left' : 'right';
  const span = maxY - minY;
  const at = span > 0 ? (Math.min(maxY, Math.max(minY, y)) - minY) / span : 0;
  return { side, y: Math.round(at * 1000) / 1000 };
}

/** A saved spot read back; anything odd is the default. */
export function parseSpot(raw: string | null | undefined): ButtonSpot {
  if (!raw) return DEFAULT_SPOT;
  try {
    const v = JSON.parse(raw) as { side?: unknown; y?: unknown };
    const side = v.side === 'left' || v.side === 'right' ? v.side : null;
    if (!side || typeof v.y !== 'number' || !Number.isFinite(v.y)) return DEFAULT_SPOT;
    return { side, y: clamp01(v.y) };
  } catch {
    return DEFAULT_SPOT; // quiet: a damaged saved spot is simply the default spot
  }
}

/** Does the floating button show on this screen right now? */
export function showsFloatingButton(p: { pathname: string; enabled: boolean; keyboardOpen: boolean }): boolean {
  if (!p.enabled || p.keyboardOpen) return false;
  return !HIDDEN_ON.has(normalPath(p.pathname));
}

function normalPath(pathname: string): string {
  const clean = (pathname || '/').split('?')[0].replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
}

/**
 * The screen name sent with a message: the address without ids or codes, so it names the screen and
 * never a member's record ("exercise/:id", "j/:code"). "home" for the first tab.
 */
export function feedbackScreenName(pathname: string): string {
  const parts = normalPath(pathname)
    .split('/')
    .filter(Boolean)
    .map((s) => (/\d/.test(s) || s.length > 24 ? ':id' : s.toLowerCase()));
  const name = parts.join('/');
  return (name || 'home').slice(0, 120);
}

/** The words a member reads (member-words skill, R-98). */
export const FEEDBACK_BUTTON_WORDS = {
  button: 'Send feedback about this screen',
  intro: 'Tell us what is wrong or what you want on this screen. We see which screen you were on.',
  speak: 'Speak',
  speakLabel: 'Speak your feedback with the keyboard microphone',
  speakHint: 'Now tap the microphone key on your keyboard to speak, in Hindi or English.',
  placeholder: 'Type here, or tap Speak',
  hideHow: 'To turn off this round button: Settings → "Send feedback".',
  switchTitle: 'Show the feedback button on every screen',
  switchCaption: 'Drag the round button up or down the screen edge to move it out of your way.',
} as const;

/** How the message was written: the member tapped "Speak" first, or only typed. */
export type FeedbackInput = 'voice' | 'typed';
