/**
 * ForgeAI HQ (#51, server 0027): a gym ForgeAI paused answers SUSPENDED to anything that would change
 * it (an order, a cancel, a check-in). The member sees one plain sentence, never a code.
 */
import { describe, expect, it } from 'vitest';

import { checkInErrorText, isRealFailure } from '../../src/shop/checkIn';
import { cancelErrorText, classifyRpcError, GYM_PAUSED_TEXT, placeFailure, refreshErrorText } from '../../src/shop/gym';

describe('a paused gym', () => {
  it('is read from the server answer', () => {
    expect(classifyRpcError({ message: 'SUSPENDED' }, 400)).toEqual({ kind: 'SUSPENDED' });
  });

  it('says the same plain words wherever a gym feature fails', () => {
    const err = classifyRpcError({ message: 'SUSPENDED' }, 400);
    expect(GYM_PAUSED_TEXT).toBe("Your gym's MettleUp account is paused. Your workouts are safe on this phone.");
    expect(refreshErrorText(err, true)).toBe(GYM_PAUSED_TEXT);
    expect(refreshErrorText(err, false)).toBe(GYM_PAUSED_TEXT);
    expect(placeFailure(err, [], []).message).toBe(GYM_PAUSED_TEXT);
    expect(placeFailure(err, [], []).refresh).toBe(false);
    expect(cancelErrorText(err)).toBe(GYM_PAUSED_TEXT);
    expect(checkInErrorText(err)).toBe(GYM_PAUSED_TEXT);
  });

  it('is an answer from the server, not a failure to log', () => {
    expect(isRealFailure({ kind: 'SUSPENDED' })).toBe(false);
  });
});
