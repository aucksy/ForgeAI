/**
 * R-86: Messages & offers → Automatic reminders — the switches read over the defaults, the days
 * field, what a save sends, the refusal words, and the SAME keys / defaults / ranges as the member
 * app's planner and the server's check (three files that must never drift).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  REMINDER_CASES,
  daysText,
  defaultReminderSettings,
  exampleFor,
  onCount,
  parseDays,
  reminderErrorWords,
  reminderPayload,
  reminderSettingsFromRow,
  remindersFromAnswer,
  sameReminderSettings,
} from '../../src/crm/logic/autoReminders';

const root = resolve(__dirname, '../../../..');
const sql = readFileSync(resolve(root, 'supabase/migrations/0029_auto_reminders.sql'), 'utf8');
const phone = readFileSync(resolve(root, 'apps/mobile/src/shop/autoReminders.ts'), 'utf8');

describe('automatic reminders: the switches', () => {
  it('the common ones start on', () => {
    const d = defaultReminderSettings();
    expect(REMINDER_CASES.filter((c) => d[c.key].on).map((c) => c.key)).toEqual(['plan_ends_soon', 'plan_ends_today', 'plan_ended', 'birthday', 'welcome', 'offer_reward']);
    expect(d.plan_ends_soon.days).toEqual([7, 3]);
    expect(d.welcome.days).toEqual([]);
    expect(onCount(d)).toBe(6);
  });

  it('reads the saved switches over the defaults; nothing saved is the defaults', () => {
    const a = remindersFromAnswer({ settings: { birthday: { on: false }, plan_ends_soon: { on: true, days: [3, 99, 3, 1] }, x: { on: true } }, updatedAt: '2026-10-23T04:00:00Z', updatedByName: 'Ramesh', canEdit: true });
    expect(a.saved).toBe(true);
    expect(a.settings.birthday.on).toBe(false);
    expect(a.settings.plan_ends_soon.days).toEqual([3, 1]);
    expect(a.updatedByName).toBe('Ramesh');
    const none = remindersFromAnswer({ settings: null, canEdit: false });
    expect(none).toMatchObject({ saved: false, canEdit: false, updatedAt: null });
    expect(none.settings).toEqual(defaultReminderSettings());
    expect(reminderSettingsFromRow('nonsense')).toEqual(defaultReminderSettings());
  });

  it('a save sends every case, days only where they matter', () => {
    const p = reminderPayload(defaultReminderSettings());
    expect(Object.keys(p).sort()).toEqual(REMINDER_CASES.map((c) => c.key).sort());
    expect(p.plan_ends_soon).toEqual({ on: true, days: [7, 3] });
    expect(p.birthday).toEqual({ on: true });
    expect(sameReminderSettings(reminderSettingsFromRow(p), defaultReminderSettings())).toBe(true);
  });

  it('the days field: tidy numbers in range, or plain words for what is wrong', () => {
    const soon = REMINDER_CASES.find((c) => c.key === 'plan_ends_soon')!.numbers!;
    expect(parseDays('3, 7', soon)).toEqual({ ok: true, days: [7, 3] });
    expect(parseDays(' 7  3 3 ', soon)).toEqual({ ok: true, days: [7, 3] });
    expect(parseDays('1,2,3,4', soon)).toEqual({ ok: false, error: 'Days before the last day: whole numbers from 1 to 30, up to 3 (like 7, 3).' });
    expect(parseDays('0', soon).ok).toBe(false);
    expect(parseDays('31', soon).ok).toBe(false);
    expect(parseDays('', soon).ok).toBe(false);
    expect(parseDays('2.5', soon).ok).toBe(false);
    const away = REMINDER_CASES.find((c) => c.key === 'miss_you')!.numbers!;
    expect(parseDays('10', away)).toEqual({ ok: true, days: [10] });
    expect(parseDays('10, 20', away)).toEqual({ ok: false, error: "Days without a check-in: a whole number from 5 to 60." });
    expect(daysText([7, 3])).toBe('7, 3');
  });

  it('refusals in plain words', () => {
    expect(reminderErrorWords({ message: 'OWNER_ONLY' })).toBe('Only the owner can change automatic reminders.');
    expect(reminderErrorWords(new Error('INVALID'))).toMatch(/not allowed/);
    expect(reminderErrorWords(new Error('timed out'))).toBeNull();
  });

  it("the examples carry the gym's name and never say volume, PR, session or money", () => {
    for (const c of REMINDER_CASES) {
      const e = exampleFor(c, "RAM'S FITNESS");
      expect(e).not.toContain('{gym}');
      expect(`${c.title} ${c.when} ${e}`, c.key).not.toMatch(/\bvolume\b|\bPRs?\b|session|₹|price|dues/i);
    }
    expect(exampleFor(REMINDER_CASES.find((c) => c.key === 'birthday')!, "RAM'S FITNESS")).toBe("Happy birthday, Asha! Best wishes from all of us at RAM'S FITNESS.");
  });
});

describe('automatic reminders: the admin app, the phone and the server agree', () => {
  it('the same case keys, defaults and ranges in all three', () => {
    for (const c of REMINDER_CASES) {
      expect(phone, c.key).toContain(`'${c.key}'`);
      expect(sql, c.key).toContain(`'${c.key}'`);
      // The phone's default switch.
      expect(phone, c.key).toMatch(new RegExp(`\\n  ${c.key}: ${c.defaultOn},`));
      const n = c.numbers;
      if (n) {
        // Phone: { default: [..], min, max, most }; server: ('key', min, max, most).
        expect(phone, c.key).toContain(`${c.key}: { default: [${n.default.join(', ')}], min: ${n.min}, max: ${n.max}, most: ${n.most} }`);
        expect(sql, c.key).toContain(`('${c.key}', ${n.min}, ${n.max}, ${n.most})`);
      } else {
        expect(sql, c.key).toContain(`('${c.key}', null, null, null)`);
      }
    }
  });
});
