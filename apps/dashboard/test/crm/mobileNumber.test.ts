/**
 * R-580 (owner, 15 Nov 2026): every mobile number box keeps ONLY the 10-digit Indian number,
 * whatever the keyboard suggestion, autofill or paste puts in. A phone keyboard that offers the
 * person's own number types "+91 98765 43210" in one go; the box must show 9876543210.
 *
 * One rule (packages/theme/src/indianMobile.ts) for the admin app, the member app and the Workers;
 * the public pages and the HQ page carry a plain-JS copy, and every copy is checked here on the
 * same tables, so they cannot drift.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  MOBILE_CASES,
  MOBILE_INPUT_CASES,
  anyCountryMobileInput,
  asciiDigits,
  cleanMobile,
  dialMobileInput,
  indianMobile,
  mobileInput,
  mobileOrAsTyped,
} from '@forgeai/theme';
import { describe, expect, it } from 'vitest';

import { normalizeMobile } from '../../src/crm/auth/signin';
import { normalizePhone } from '../../src/crm/logic/members';

const repo = (f: string) => resolve(__dirname, '../../../..', f);
const read = (f: string) => readFileSync(repo(f), 'utf8').replace(/\r\n/g, '\n');

/** Pages with the plain-JS copy of the rule. */
const TWINS = [
  'apps/dashboard/public/join-online.html',
  'apps/dashboard/public/friend.html',
  'apps/dashboard/public/home/home.js',
  'apps/dashboard/public/gym-page/page.js',
  'apps/hq/public/logic.js',
];
const START = '// R-580 mobile rule >>>';
const END = '// <<< R-580 mobile rule';

function twinText(file: string): string {
  const all = read(file);
  const a = all.indexOf(START);
  const b = all.indexOf(END);
  expect(a, `${file} has the rule`).toBeGreaterThanOrEqual(0);
  expect(all.indexOf(START, a + 1), `${file} has it once`).toBe(-1);
  return all
    .slice(a, b + END.length)
    .split('\n')
    .map((l) => l.trim())
    .join('\n');
}

type Twin = { cleanMobile: (raw: string) => string; mobileInput: (prev: string, raw: string) => string };
function twin(file: string): Twin {
  // The page's own copy, read from the repo and run as it is.
  return new Function(`${twinText(file)}\nreturn { cleanMobile: cleanMobile, mobileInput: mobileInput };`)() as Twin;
}

describe('R-580: the 10-digit rule', () => {
  it.each(MOBILE_CASES.map(([a, b]): [string, string] => [a, b]))('cleanMobile(%j) is %j', (raw, ten) => {
    expect(cleanMobile(raw)).toBe(ten);
  });

  it.each(MOBILE_INPUT_CASES.map(([a, b, c]): [string, string, string] => [a, b, c]))('a box showing %j, changed to %j, shows %j', (prev, raw, now) => {
    expect(mobileInput(prev, raw)).toBe(now);
  });

  it('typing the keyboard number one key at a time ends on the 10 digits, never pushing a digit out', () => {
    for (const typed of ['+91 98765 43210', '09876543210', '0091 98765 43210', '9876543210']) {
      let box = '';
      for (const key of typed) box = mobileInput(box, box + key);
      expect(box, typed).toBe('9876543210');
    }
  });

  it('Hindi and other Indian keyboards send their own digits: they count as 0-9', () => {
    expect(asciiDigits('९८७६५ ४३२१०')).toBe('98765 43210');
    expect(asciiDigits('৯৮৭৬৫৪৩২১০')).toBe('9876543210'); // Bengali
    expect(asciiDigits('௯௮௭௬௫௪௩௨௧௦')).toBe('9876543210'); // Tamil
    expect(cleanMobile('+९१ ९८७६५ ४३२१०')).toBe('9876543210');
  });

  it('a valid Indian mobile or null', () => {
    expect(indianMobile('+91 98765 43210')).toBe('9876543210');
    expect(indianMobile('98765')).toBeNull();
    expect(indianMobile('5876543210')).toBeNull();
  });

  it('a box that also takes other countries keeps a foreign "+" number as typed', () => {
    expect(anyCountryMobileInput('', '+44 7700 900123')).toBe('+44 7700 900123');
    expect(anyCountryMobileInput('', '0044 7700 900123')).toBe('0044 7700 900123');
    expect(anyCountryMobileInput('', '+91 98765 43210')).toBe('9876543210');
    expect(anyCountryMobileInput('', '+')).toBe('+');
    expect(anyCountryMobileInput('+', '+9')).toBe('+9');
    expect(anyCountryMobileInput('+9', '+97')).toBe('+97'); // UAE, on its way
    expect(anyCountryMobileInput('', '919876543210')).toBe('9876543210');
  });

  it('a box next to a country code: +91 cleans, any other code is left alone', () => {
    expect(dialMobileInput('+91', '', '+91 98765 43210')).toBe('9876543210');
    expect(dialMobileInput('+91', '', '0091 98765 43210')).toBe('9876543210');
    expect(dialMobileInput('+971', '', '+971 50 123 4567')).toBe('+971 50 123 4567');
  });

  it('the gym phone in Settings: an autofilled mobile is cleaned, a landline keeps its 0', () => {
    expect(mobileOrAsTyped('+91 98765 43210')).toBe('9876543210');
    expect(mobileOrAsTyped('0141 2345678')).toBe('0141 2345678');
    expect(mobileOrAsTyped('98765 4321')).toBe('98765 4321');
  });
});

describe('R-580: the admin app checks agree with the boxes', () => {
  it.each(MOBILE_CASES.map(([a, b]): [string, string] => [a, b]))('sign-in normalizeMobile(%j)', (raw, ten) => {
    expect(normalizeMobile(raw)).toBe(/^[6-9]\d{9}$/.test(ten) ? ten : null);
  });

  it('the member form takes the keyboard suggestion with +91 picked', () => {
    for (const raw of ['+91 98765 43210', '0091 98765 43210', '(+91) 98765-43210', '९८७६५४३२१०', '919876543210', '09876543210']) {
      expect(normalizePhone('+91', raw)?.e164, raw).toBe('+919876543210');
    }
  });
});

describe('R-580: every plain-JS copy is the same rule', () => {
  it('every copy is the same text', () => {
    const first = twinText(TWINS[0]);
    for (const f of TWINS.slice(1)) expect(twinText(f), f).toBe(first);
  });

  for (const file of TWINS) {
    it(`${file} follows both tables`, () => {
      const t = twin(file);
      for (const [raw, ten] of MOBILE_CASES) expect(t.cleanMobile(raw), raw).toBe(ten);
      for (const [prev, raw, now] of MOBILE_INPUT_CASES) expect(t.mobileInput(prev, raw), `${prev} -> ${raw}`).toBe(now);
    });
  }

  it('the copy is wired to each page’s box', () => {
    expect(read('apps/dashboard/public/join-online.html')).toContain("keepMobile($('phone'))");
    expect(read('apps/dashboard/public/friend.html')).toContain("keepMobile($('phone'))");
    expect(read('apps/dashboard/public/home/home.js')).toContain('keepMobile(form.elements.phone)');
    expect(read('apps/dashboard/public/gym-page/page.js')).toContain('keepMobile(form.phone)');
    expect(read('apps/dashboard/public/gym-page/page.js')).toContain('keepMobile(chatContact.phone)');
    expect(read('apps/hq/public/app.js')).toContain('keepMobile(mobile)');
  });
});

describe('R-580: no number box has a length limit that cuts an autofill before it is cleaned', () => {
  const pages = [
    ...readdirSync(repo('apps/dashboard/public'))
      .filter((f) => f.endsWith('.html'))
      .map((f) => `apps/dashboard/public/${f}`),
    'apps/dashboard/public/home/index.html',
    'deploy/panel/gymPage.js',
    'apps/hq/public/app.js',
  ];
  it.each(pages)('%s', (file) => {
    const boxes = read(file).match(/<input[^>]*type="tel"[^>]*>/g) ?? [];
    for (const box of boxes) expect(box, file).not.toMatch(/maxlength/i);
    // The HQ page builds its boxes in script: its mobile box has no maxlength either.
    if (file.endsWith('app.js')) expect(read(file)).not.toMatch(/inputmode: 'tel', maxlength/);
  });
});
