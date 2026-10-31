import { describe, expect, it } from 'vitest';

import { frontScreen } from '@/tracker/phone/widgetLink';

describe('frontScreen (the shortcut Resume self-check)', () => {
  it('walks into the tabs to the screen in front', () => {
    expect(frontScreen({ index: 0, routes: [{ name: '(tabs)', state: { index: 1, routes: [{ name: 'workout' }, { name: 'progress' }] } }] })).toBe('progress');
  });
  it('sees the open workout on top of the tabs', () => {
    expect(frontScreen({ index: 1, routes: [{ name: '(tabs)' }, { name: 'session/active' }] })).toBe('session/active');
  });
  it('uses the last route when the index is missing', () => {
    expect(frontScreen({ routes: [{ name: '(tabs)' }, { name: 'workout/start' }] })).toBe('workout/start');
  });
  it('says nothing for no state', () => {
    expect(frontScreen(undefined)).toBeNull();
    expect(frontScreen({ routes: [] })).toBeNull();
  });
});
