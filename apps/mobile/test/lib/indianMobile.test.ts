/**
 * R-580 (owner, 15 Nov 2026): every mobile number box in the member app keeps ONLY the 10-digit
 * Indian number, whatever the keyboard suggestion, autofill or paste puts in. A phone keyboard that
 * offers the member's own number types "+91 98765 43210" in one go; the box must show 9876543210.
 * The rule is shared (packages/theme/src/indianMobile.ts); this runs the same tables the admin app
 * and the Workers run, and checks every phone box in the app uses it with no length limit (a
 * maxLength cut "(+91) 98765-43210" at 16 characters BEFORE the rule saw it).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MOBILE_CASES, MOBILE_INPUT_CASES, anyCountryMobileInput, cleanMobile, mobileInput } from '@forgeai/theme';
import { describe, expect, it } from 'vitest';

import { parsePhone } from '@/onboarding/form';

const src = (f: string) => readFileSync(resolve(__dirname, '../../src', f), 'utf8');

describe('R-580: the 10-digit rule in the member app', () => {
  it.each(MOBILE_CASES.map(([a, b]): [string, string] => [a, b]))('cleanMobile(%j) is %j', (raw, ten) => {
    expect(cleanMobile(raw)).toBe(ten);
  });

  it.each(MOBILE_INPUT_CASES.map(([a, b, c]): [string, string, string] => [a, b, c]))('a box showing %j, changed to %j, shows %j', (prev, raw, now) => {
    expect(mobileInput(prev, raw)).toBe(now);
  });

  it('typing one key at a time ends on the 10 digits', () => {
    for (const typed of ['+91 98765 43210', '09876543210', '9876543210']) {
      let box = '';
      for (const key of typed) box = mobileInput(box, box + key);
      expect(box, typed).toBe('9876543210');
    }
  });

  it('the optional "any country" number: India cleaned, another country kept, and both still save', () => {
    const india = anyCountryMobileInput('', '+91 98765 43210');
    expect(india).toBe('9876543210');
    expect(parsePhone(india)).toEqual({ ok: true, phone: '9876543210' });
    const uk = anyCountryMobileInput('', '+44 7700 900123');
    expect(uk).toBe('+44 7700 900123');
    expect(parsePhone(uk)).toEqual({ ok: true, phone: '+447700900123' });
    expect(anyCountryMobileInput('', '९८७६५४३२१०')).toBe('9876543210');
  });
});

describe('R-580: every phone box uses the rule and has no length limit', () => {
  const INDIA_ONLY = ['onboarding/components/WelcomePhone.tsx', 'app/find-gym.tsx', 'shop/CheckInScreen.tsx', 'shop/StaffDoorCard.tsx'];
  const ANY_COUNTRY = ['onboarding/components/WelcomeScreen.tsx', 'components/settings/ProfileCard.tsx'];

  /** The text of each phone box: from its keyboardType back to the TextInput that holds it. */
  function phoneBoxes(file: string): string[] {
    const text = src(file);
    const out: string[] = [];
    let at = text.indexOf('phone-pad');
    while (at >= 0) {
      const tag = text.lastIndexOf('<TextInput', at);
      const helper = text.lastIndexOf("box('phone'", at);
      const start = Math.max(tag, helper);
      const end = start === tag ? text.indexOf('/>', at) : text.indexOf('})', at);
      expect(start, file).toBeGreaterThanOrEqual(0);
      out.push(text.slice(start, end));
      at = text.indexOf('phone-pad', at + 1);
    }
    return out;
  }

  it.each(INDIA_ONLY)('%s', (file) => {
    const boxes = phoneBoxes(file);
    expect(boxes.length, file).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box).toContain('mobileInput(');
      expect(box).not.toMatch(/maxLength(=\{|:\s*\d)/);
      expect(box).toContain('textContentType="telephoneNumber"');
    }
  });

  it.each(ANY_COUNTRY)('%s', (file) => {
    const boxes = phoneBoxes(file);
    expect(boxes.length, file).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box).toContain('anyCountryMobileInput(');
      expect(box).not.toMatch(/maxLength(=\{|:\s*\d)/);
    }
  });

  it('no other phone box hides in the app: a new phone-pad box must join one of the lists above', () => {
    const root = resolve(__dirname, '../../src');
    const found = (readdirSync(root, { recursive: true }) as string[])
      .map((f) => f.split('\\').join('/'))
      .filter((f) => /\.tsx?$/.test(f) && readFileSync(resolve(root, f), 'utf8').includes('phone-pad'))
      .sort();
    expect(found).toEqual([...INDIA_ONLY, ...ANY_COUNTRY].sort());
  });
});
