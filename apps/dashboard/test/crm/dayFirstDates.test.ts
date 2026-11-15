/**
 * Day-first dates (15 Nov 2026, after R-561): every date box an owner, desk or trainer sees in the admin app shows the
 * day first ("17 Oct 2026"), whatever language the phone or computer is set to. A plain date box shows "10/17/2026" on
 * a browser set to US English. The one day box is ui/DayField.tsx (the device's date box, invisible, on top of the day
 * in words); this test fails when any other date box comes back, as a raw <input type="date"> or as
 * <TextField type="date">.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

/** The only files allowed a date box of the device's own, each with why. */
const ALLOWED: Record<string, string> = {
  'crm/ui/DayField.tsx': 'The day-first box itself: the device date box lies invisible on top of the day in words.',
};

/**
 * Date AND time boxes (type="datetime-local") are not day boxes: DayField picks a day only. Each one here is checked
 * to still be one, so a new one is a decision, not an accident.
 */
const DATE_AND_TIME: Record<string, string> = {
  'crm/assistant/ui/Cards.tsx': 'AI Assistant "Send on" (day and time); the card says the day and time in words under it.',
  'crm/shop/MessagesSection.tsx': 'Messages & offers "Day and time" for a message sent later; a day and a time together.',
};

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string): string => p.slice(SRC.length).replace(/\\/g, '/');
const all = files(SRC).map((p) => ({ path: rel(p), text: readFileSync(p, 'utf8') }));

// A date box in code: type="date", type='date', type={'date'} or type: 'date' (not inside `backticks` in a comment).
const DATE_BOX = /(?<![`\w])type(?:=\{?|:\s*)["']date["']/;
const TIME_BOX = /(?<![`\w])type(?:=\{?|:\s*)["']datetime-local["']/;

describe('every date box in the admin app shows the day first', () => {
  it('no plain date box outside DayField', () => {
    const hits = all.flatMap(({ path, text }) =>
      ALLOWED[path]
        ? []
        : text
            .split('\n')
            .map((line, i) => (DATE_BOX.test(line) ? `${path}:${i + 1}: ${line.trim()}` : ''))
            .filter(Boolean),
    );
    expect(hits).toEqual([]);
  });

  it('the check catches each way of writing a date box, and not a comment about one', () => {
    expect(DATE_BOX.test('<input type="date" value={v} />')).toBe(true);
    expect(DATE_BOX.test("        type='date'")).toBe(true);
    expect(DATE_BOX.test("<TextField label=\"From\" type={'date'} />")).toBe(true);
    expect(DATE_BOX.test("const f = { type: 'date' };")).toBe(true);
    expect(DATE_BOX.test('// a `type="date"` field hands over year 0002')).toBe(false);
    expect(DATE_BOX.test('<input type="datetime-local" />')).toBe(false);
  });

  it('every allowed file still needs its exception', () => {
    for (const path of Object.keys(ALLOWED)) {
      const f = all.find((x) => x.path === path);
      expect(f, path).toBeDefined();
      expect(DATE_BOX.test(f!.text), path).toBe(true);
    }
  });

  it('date and time boxes are only the listed ones', () => {
    const found = all.filter(({ text }) => TIME_BOX.test(text)).map((f) => f.path).sort();
    expect(found).toEqual(Object.keys(DATE_AND_TIME).sort());
  });

  it('the date boxes owners fill use DayField', () => {
    const uses = all.filter(({ path, text }) => path !== 'crm/ui/DayField.tsx' && text.includes('<DayField')).map((f) => f.path);
    for (const path of [
      'crm/ui/forms/MemberFormSheet.tsx',
      'crm/ui/forms/SellMembershipSheet.tsx',
      'crm/ui/forms/CollectPaymentSheet.tsx',
      'crm/ui/forms/ChangeStartSheet.tsx',
      'crm/ui/screens/Enquiries.tsx',
      'crm/ui/screens/Attendance.tsx',
      'crm/ui/screens/Expenses.tsx',
      'crm/ui/screens/Money.tsx',
      'crm/ui/screens/GymTimings.tsx',
      'crm/ui/screens/MemberMeasurements.tsx',
      'crm/ui/screens/Challenges.tsx',
      'crm/ui/OwnerNumbers.tsx',
      'crm/shop/OffersSection.tsx',
      'crm/shop/MessagesSection.tsx',
      'crm/assistant/ui/Cards.tsx',
    ]) {
      expect(uses, path).toContain(path);
    }
  });

  it('DayField shows the day in words and keeps the stored value as YYYY-MM-DD', () => {
    const box = all.find((x) => x.path === 'crm/ui/DayField.tsx')!.text;
    expect(box).toContain('formatDay(value)');
    // The value goes straight from the device's date box (always YYYY-MM-DD) to the form, unchanged.
    expect(box).toContain('onChange={(e) => onChange(e.target.value)}');
    expect(box).toContain('value={value}');
    for (const prop of ['error', 'min', 'max', 'hint']) expect(box).toMatch(new RegExp(`\\b${prop}\\?:`));
  });
});
