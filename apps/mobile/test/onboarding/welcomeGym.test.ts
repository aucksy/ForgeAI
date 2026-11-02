import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  WELCOME_SCAN_WORDS,
  welcomeGymAutoCheck,
  welcomeGymChecked,
  welcomeGymCode,
  welcomeGymKept,
  welcomeGymScanned,
  welcomeJoinLabel,
} from '@/onboarding/welcomeGym';
import { START_WORDS } from '@/onboarding/welcomeStart';

describe('welcome screen gym code (OWNER-INBOX #11)', () => {
  it('keeps a 6-character code, in capitals', () => {
    expect(welcomeGymCode(' rams01 ')).toEqual({ ok: true, code: 'RAMS01' });
  });
  it('takes the code out of a pasted gym link', () => {
    expect(welcomeGymCode('https://forgeai.aakashpahuja.in/j/RAMS01')).toEqual({ ok: true, code: 'RAMS01' });
  });
  it('says what is wrong with a short or empty code', () => {
    for (const t of ['', 'RAM', 'RAMS0']) {
      const r = welcomeGymCode(t);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/6 letters or numbers/);
    }
  });
  it('the saved line names the code and when the gym opens', () => {
    expect(welcomeGymKept('RAMS01')).toBe("Gym code RAMS01 saved. Your gym's join screen opens right after setup.");
  });
});

describe('welcome screen "Scan the poster" (1 Nov 2026)', () => {
  it('reads the gym code from the poster check-in QR and from an invite QR', () => {
    expect(welcomeGymScanned('https://app.mettleup.fit/c/rams01')).toBe('RAMS01');
    expect(welcomeGymScanned('https://forgeai.aakashpahuja.in/j/FORGE1')).toBe('FORGE1');
    expect(welcomeGymScanned('mettleup://c/FORGE1')).toBe('FORGE1');
  });
  it('any other QR is not a gym code (scanning goes on)', () => {
    for (const d of ['https://evil.example/c/RAMS01', 'hello', '', null, undefined, 'https://app.mettleup.fit/c/RAM']) {
      expect(welcomeGymScanned(d)).toBeNull();
    }
  });
  it('a scanned code is checked exactly like a typed one', () => {
    const code = welcomeGymScanned('https://app.mettleup.fit/c/FORGE1');
    expect(code).not.toBeNull();
    const typed = welcomeGymCode(code ?? '');
    expect(typed).toEqual({ ok: true, code: 'FORGE1' });
    expect(welcomeGymChecked('FORGE1', { gymName: 'ForgeAI Test Gym' })).toEqual({ keep: true, line: 'ForgeAI Test Gym found. Its join screen opens right after setup.' });
    expect(welcomeGymChecked('ZZZZZ9', null)).toEqual({ keep: false, error: "No gym has the code ZZZZZ9. Check the code with your gym's desk and type it again." });
  });
  it('a refused camera is said in one complete sentence that keeps typing in view', () => {
    for (const line of [WELCOME_SCAN_WORDS.refused, WELCOME_SCAN_WORDS.camOff, WELCOME_SCAN_WORDS.noCamera]) {
      expect(line).toMatch(/^[A-Z].*\.$/);
      expect(line.split(/\.\s/).length).toBe(1);
      expect(line).toMatch(/type your gym's code below/);
    }
    expect(WELCOME_SCAN_WORDS.scan).toBe('Scan the poster');
  });
});

describe('the phone test of the welcome gym code (qa/welcome-gym.yaml)', () => {
  // A Windows checkout (autocrlf) has CRLF line ends; CI's has LF. Read both the same.
  const flow = readFileSync(path.resolve(__dirname, '../../qa/welcome-gym.yaml'), 'utf8').replace(/\r\n/g, '\n');
  const unescape = (re: string) => re.replace(/\\./g, '.').replace(/''/g, "'");
  it('looks for the exact lines the app says', () => {
    const lines = [...flow.matchAll(/assertVisible: '([^\n]+)'\n/g)].map((m) => unescape(m[1]));
    const wrong = welcomeGymChecked('ZZZZZ9', null);
    const found = welcomeGymChecked('FORGE1', { gymName: 'ForgeAI Test Gym' });
    expect(lines).toContain(wrong.keep ? '' : wrong.error);
    expect(lines).toContain(found.keep ? found.line : '');
    // R-277: the "Join my gym" screen and its poster box.
    expect(flow).toContain(`"^${START_WORDS.joinGym}$"`);
    expect(flow).toContain(`"^${START_WORDS.scanTitle}$"`);
    expect(flow).toContain(`"^${welcomeJoinLabel('ForgeAI Test Gym')}$"`);
  });
  it('is run by the whole phone test (part UBK)', () => {
    const script = readFileSync(path.resolve(__dirname, '../../qa/run-device-qa.sh'), 'utf8');
    expect(script).toMatch(/gate_flow ubk_gym welcome-gym\.yaml/);
  });
});
describe('welcome gym code is checked by itself (release QA, 1 Nov 2026)', () => {
  it('checks when the last letter makes a whole code', () => {
    expect(welcomeGymAutoCheck('ZZZZZ', 'ZZZZZ9')).toBe(true);
  });
  it('checks a pasted gym link at once', () => {
    expect(welcomeGymAutoCheck('', 'https://app.mettleup.fit/j/RAMS01')).toBe(true);
  });
  it('does not check a part code, or the same whole code again', () => {
    expect(welcomeGymAutoCheck('ZZZZ', 'ZZZZZ')).toBe(false);
    expect(welcomeGymAutoCheck('ZZZZZ9', 'ZZZZZ9 ')).toBe(false);
  });
});

describe('the "Join my gym" screen button (R-277)', () => {
  it('names the gym once it answered, else says "Join my gym"', () => {
    expect(welcomeJoinLabel('Iron Den Gym')).toBe('Join Iron Den Gym');
    expect(welcomeJoinLabel('  ')).toBe('Join my gym');
    expect(welcomeJoinLabel(null)).toBe('Join my gym');
    expect(welcomeJoinLabel(undefined)).toBe(START_WORDS.joinGym);
  });
  it('[source-text check] joins nothing by itself: it keeps the code, then goes on to the setup questions', () => {
    const src = readFileSync(path.resolve(__dirname, '../../src/onboarding/components/WelcomeGymCode.tsx'), 'utf8');
    // The only server call is the existing gym preview; the join itself happens on the gym's own screen after setup.
    expect(src.match(/api[A-Z]\w+\(/g)).toEqual(['apiPreview(']);
    expect(src).toContain('setPendingInvite(c)');
    expect(src).toMatch(/if \(await save\(\)\) onJoin\(\);/);
  });
});
