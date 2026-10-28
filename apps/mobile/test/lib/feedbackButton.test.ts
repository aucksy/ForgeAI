import { describe, expect, it } from 'vitest';

import {
  BOTTOM_CLEAR,
  DEFAULT_SPOT,
  EDGE_GAP,
  FEEDBACK_BUTTON_SIZE,
  FEEDBACK_BUTTON_WORDS,
  TOP_CLEAR,
  feedbackScreenName,
  freeBand,
  parseSpot,
  showsFloatingButton,
  spotFromDrop,
  spotToXY,
} from '@/lib/feedbackButton';

// The owner's phone in QA terms: a Pixel at large display size (~360 x 760 dp), gesture bar.
const pixel = { width: 360, height: 760, insetTop: 32, insetBottom: 24 };

describe('the floating feedback button (R-149)', () => {
  it('never sits over a screen\'s top bar or its bottom (tab bar, workout bar, main button)', () => {
    const { minY, maxY } = freeBand(pixel);
    expect(minY).toBe(pixel.insetTop + TOP_CLEAR);
    expect(maxY + FEEDBACK_BUTTON_SIZE).toBe(pixel.height - pixel.insetBottom - BOTTOM_CLEAR);
    for (const y of [0, 0.5, 1, -3, 9, Number.NaN]) {
      const at = spotToXY({ side: 'right', y }, pixel);
      expect(at.y).toBeGreaterThanOrEqual(minY);
      expect(at.y).toBeLessThanOrEqual(maxY);
    }
  });

  it('docks to the edge it is dropped nearer to, and stays in the free band', () => {
    expect(spotToXY({ side: 'left', y: 0 }, pixel).x).toBe(EDGE_GAP);
    expect(spotToXY({ side: 'right', y: 0 }, pixel).x).toBe(pixel.width - FEEDBACK_BUTTON_SIZE - EDGE_GAP);
    expect(spotFromDrop(40, 300, pixel).side).toBe('left');
    expect(spotFromDrop(250, 300, pixel).side).toBe('right');
    expect(spotFromDrop(250, -500, pixel).y).toBe(0);
    expect(spotFromDrop(250, 5000, pixel).y).toBe(1);
    // A drop and its spot agree: dropped mid-band, drawn mid-band.
    const { minY, maxY } = freeBand(pixel);
    const mid = Math.round((minY + maxY) / 2);
    expect(Math.abs(spotToXY(spotFromDrop(300, mid, pixel), pixel).y - mid)).toBeLessThanOrEqual(1);
  });

  it('a tiny screen still gets one spot (never a band upside down)', () => {
    const tiny = { width: 320, height: 250, insetTop: 24, insetBottom: 0 };
    const { minY, maxY } = freeBand(tiny);
    expect(maxY).toBe(minY);
    expect(spotFromDrop(10, 999, tiny)).toEqual({ side: 'left', y: 0 });
  });

  it('a saved spot read back; anything damaged is the default', () => {
    expect(parseSpot(JSON.stringify({ side: 'left', y: 0.25 }))).toEqual({ side: 'left', y: 0.25 });
    expect(parseSpot(JSON.stringify({ side: 'left', y: 7 }))).toEqual({ side: 'left', y: 1 });
    expect(parseSpot('{bad')).toEqual(DEFAULT_SPOT);
    expect(parseSpot(JSON.stringify({ side: 'up', y: 0.2 }))).toEqual(DEFAULT_SPOT);
    expect(parseSpot(null)).toEqual(DEFAULT_SPOT);
    expect(DEFAULT_SPOT.side).toBe('right');
  });

  it('hides when switched off, while the keyboard is open, on the live workout and the feedback page', () => {
    const on = { enabled: true, keyboardOpen: false };
    expect(showsFloatingButton({ ...on, pathname: '/' })).toBe(true);
    expect(showsFloatingButton({ ...on, pathname: '/progress' })).toBe(true);
    expect(showsFloatingButton({ ...on, pathname: '/session/finish' })).toBe(true);
    expect(showsFloatingButton({ ...on, pathname: '/session/active' })).toBe(false); // its own top-bar button
    expect(showsFloatingButton({ ...on, pathname: '/session/active/' })).toBe(false);
    expect(showsFloatingButton({ ...on, pathname: '/calendar' })).toBe(false); // its day grid fills the width (part UH)
    expect(showsFloatingButton({ ...on, pathname: '/settings/feedback' })).toBe(false);
    expect(showsFloatingButton({ ...on, keyboardOpen: true, pathname: '/' })).toBe(false);
    expect(showsFloatingButton({ enabled: false, keyboardOpen: false, pathname: '/' })).toBe(false);
  });

  it('names the screen, never a record or a code', () => {
    expect(feedbackScreenName('/')).toBe('home');
    expect(feedbackScreenName('/session/active')).toBe('session/active');
    expect(feedbackScreenName('/exercise/123')).toBe('exercise/:id');
    expect(feedbackScreenName('/routines/view/8f3a2c1e-77aa-4bb1-9c0d-1234567890ab')).toBe('routines/view/:id');
    expect(feedbackScreenName('/j/AB12CD')).toBe('j/:id');
    expect(feedbackScreenName('/settings/rest?from=x')).toBe('settings/rest');
  });

  it('member words: plain, short, never volume, PR or session', () => {
    for (const w of Object.values(FEEDBACK_BUTTON_WORDS)) {
      expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
      expect(w.length).toBeLessThanOrEqual(100);
    }
  });
});
