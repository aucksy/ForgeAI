import { describe, expect, it } from 'vitest';

import { AGREE_LABEL, PRIVACY_URL, TERMS_URL, agreementWords } from '@/shop/joinTerms';

// Launch plan D5/D6 (21 Oct 2026): joining a gym needs the 18+ / terms box ticked.
describe('join agreement', () => {
  it('blocks a join until the box is ticked, and names what to do', () => {
    expect(agreementWords(false)).toMatch(/Tick the box/);
    expect(agreementWords(false)).toMatch(/18 or older/);
    expect(agreementWords(true)).toBeNull();
  });
  it('asks for both the age and the agreement in one line, with both documents linked', () => {
    expect(AGREE_LABEL).toMatch(/18 or older/);
    expect(AGREE_LABEL).toMatch(/terms and privacy notice/);
    expect(TERMS_URL).toMatch(/^https:\/\/.+\/terms\.html$/);
    expect(PRIVACY_URL).toMatch(/^https:\/\/.+\/privacy\.html$/);
  });
});
