/**
 * #38 (24 Oct 2026): the terms and data agreement accepted online. Server side:
 * supabase/tests/0033_terms_acceptance.sql.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { acceptedLine, needsTerms, PRIVACY_URL, termsFromRow, TERMS_URL, TERMS_VERSION } from '../../src/crm/auth/terms';

describe('terms acceptance', () => {
  it('reads owner_terms; anything broken reads as nothing accepted, and nobody to ask', () => {
    expect(termsFromRow({ acceptedVersion: '2026-10-24', acceptedAt: '2026-10-24T06:30:00Z', acceptedByName: 'Ramesh', how: 'create', canAccept: true })).toEqual({
      acceptedVersion: '2026-10-24',
      acceptedAt: Date.parse('2026-10-24T06:30:00Z'),
      acceptedByName: 'Ramesh',
      how: 'create',
      canAccept: true,
    });
    expect(termsFromRow([])).toEqual({ acceptedVersion: null, acceptedAt: null, acceptedByName: null, how: null, canAccept: false });
    expect(termsFromRow({ acceptedVersion: 'soon', canAccept: true }).acceptedVersion).toBeNull();
  });

  it('the owner is asked when nothing, or an older version, was accepted; the desk never', () => {
    const base = { acceptedAt: null, acceptedByName: null, how: null } as const;
    expect(needsTerms({ ...base, acceptedVersion: null, canAccept: true })).toBe(true);
    expect(needsTerms({ ...base, acceptedVersion: '2026-01-01', canAccept: true })).toBe(true);
    expect(needsTerms({ ...base, acceptedVersion: TERMS_VERSION, canAccept: true })).toBe(false);
    expect(needsTerms({ ...base, acceptedVersion: '2027-03-01', canAccept: true })).toBe(false);
    expect(needsTerms({ ...base, acceptedVersion: null, canAccept: false })).toBe(false);
    // A server without 0033 (null): nothing is asked.
    expect(needsTerms(null)).toBe(false);
  });

  it('Settings says when and which version, in India time', () => {
    expect(acceptedLine({ acceptedVersion: '2026-10-24', acceptedAt: Date.parse('2026-10-24T20:00:00Z'), acceptedByName: 'R', how: 'sign_in', canAccept: true })).toBe(
      'You accepted the terms on 25 Oct 2026 (version 2026-10-24).',
    );
    expect(acceptedLine(null)).toBeNull();
    expect(acceptedLine({ acceptedVersion: null, acceptedAt: null, acceptedByName: null, how: null, canAccept: true })).toBeNull();
  });

  it('the version is a date and both pages it links to exist', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const url of [TERMS_URL, PRIVACY_URL]) {
      const html = readFileSync(join(__dirname, '../../public', url), 'utf8');
      expect(html.length, url).toBeGreaterThan(100);
    }
  });

  it("the admin app's version is the newest in the server's one list of versions (0033 _terms_versions)", () => {
    const sql = readFileSync(join(__dirname, '../../../../supabase/migrations/0033_terms_acceptance.sql'), 'utf8');
    const m = /function public\._terms_versions\(\)[\s\S]*?select array\[([^\]]*)\]/.exec(sql);
    expect(m, '_terms_versions not found').not.toBeNull();
    const list = [...m![1]!.matchAll(/'(\d{4}-\d{2}-\d{2})'/g)].map((x) => x[1]);
    expect(list.at(-1)).toBe(TERMS_VERSION);
  });
});
