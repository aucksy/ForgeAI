import { describe, expect, it } from 'vitest';

import { welcomeGymCode, welcomeGymKept } from '@/onboarding/welcomeGym';

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
