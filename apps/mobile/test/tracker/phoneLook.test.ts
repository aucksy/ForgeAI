/**
 * Gym branding (D5): what lives outside the app — the home-screen widgets and the scheduled
 * workout reminders — follows the app's look. The widgets get the live accent (and the ink on
 * it) with their data; a reminder keeps the colour it was scheduled with, so the stamp that
 * decides "set them again?" holds the accent, and a new look sets them again.
 */
import { describe, expect, it } from 'vitest';

import { needsReschedule, reminderStampKey } from '@/tracker/phone/reminders';
import { widgetLook } from '@/tracker/phone/widgets';
import { applyBrandToTokens } from '@/theme/brandTokens';

const RAMS = { accent: '#F7D411', bg: '#0A0A0C', logoUrl: null, heading: 'bold-italic' as const, updatedAt: null };

describe('widgets wear the app look', () => {
  it("ForgeAI's orange, then the gym's accent and the ink that reads on it, then orange again", () => {
    applyBrandToTokens(null);
    expect(widgetLook()).toEqual({ accent: '#FF7A3B', onAccent: '#1F0D05' });
    applyBrandToTokens(RAMS);
    expect(widgetLook()).toEqual({ accent: '#F7D411', onAccent: '#0A0A0A' });
    applyBrandToTokens(null);
    expect(widgetLook().accent).toBe('#FF7A3B');
  });
});

describe('reminders are set again when the look changes', () => {
  it('the stamp key holds the accent, so a new colour reschedules them', () => {
    const triggers = [{ id: 'forgeai-reminder-w0', kind: 'weekly', weekday: 0, hour: 18, minute: 0 }];
    const ids = ['forgeai-reminder-w0'];
    const orange = { offset: -330, key: reminderStampKey(triggers, 'Next: Push 1', '#FF7A3B') };
    const yellow = { offset: -330, key: reminderStampKey(triggers, 'Next: Push 1', '#F7D411') };
    expect(needsReschedule(orange, { ...orange }, ids, ids)).toBe(false);
    expect(needsReschedule(orange, yellow, ids, ids)).toBe(true);
  });
});
