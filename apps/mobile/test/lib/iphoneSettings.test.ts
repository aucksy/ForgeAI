/**
 * R-339: on the iPhone build, Settings leaves out the rows that are not built there yet (reminders,
 * watch, Health, widgets) and says so in one plain line, never an Android page that does nothing.
 */
import { describe, expect, it } from 'vitest';

import { NOT_ON_IPHONE_YET, settingsGroups } from '@/components/settings/settingsLines';

const BASE = { gymName: null, canAddGymLogo: false, hasHealth: true, coach: false, watch: true };

describe('Settings on iPhone', () => {
  it('Android keeps every row and no note', () => {
    const g = settingsGroups(BASE);
    const keys = g.flatMap((x) => x.rows.map((r) => r.key));
    expect(keys).toEqual(expect.arrayContaining(['reminders', 'watch', 'health', 'widgets']));
    expect(g.some((x) => x.note)).toBe(false);
  });

  it('iPhone leaves out reminders, watch, Health and widgets and says so', () => {
    const g = settingsGroups({ ...BASE, iphone: true });
    const keys = g.flatMap((x) => x.rows.map((r) => r.key));
    for (const k of ['reminders', 'watch', 'health', 'widgets']) expect(keys).not.toContain(k);
    const phone = g.find((x) => x.title === 'Phone and watch');
    expect(phone?.rows).toEqual([]);
    expect(phone?.note).toBe(NOT_ON_IPHONE_YET);
    expect(keys).toEqual(expect.arrayContaining(['profile', 'units', 'backup', 'erase', 'about']));
  });

  it('the note uses plain member words', () => {
    expect(NOT_ON_IPHONE_YET).toMatch(/^Not on iPhone yet: /);
    expect(NOT_ON_IPHONE_YET).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});
