import { describe, expect, it } from 'vitest';

import {
  emptyMemberForm,
  findDuplicatePhone,
  formatPhone,
  initials,
  matchesQuery,
  memberToForm,
  normalizeName,
  normalizePhone,
  phoneDigits,
  phoneForExport,
  splitE164,
  validateE164,
  validateMember,
  type MemberFormDraft,
} from '../../src/crm/logic/members';
import { makeMember } from './fixtures';

const TODAY = '2026-07-26';

const form = (over: Partial<MemberFormDraft> = {}): MemberFormDraft => ({
  ...emptyMemberForm(TODAY),
  fullName: 'Riya Sharma',
  phone: '9876543210',
  ...over,
});

describe('normalizePhone', () => {
  it('normalises the shapes a front desk actually types', () => {
    expect(normalizePhone('+91', '9876543210')?.e164).toBe('+919876543210');
    expect(normalizePhone('+91', '98765 43210')?.e164).toBe('+919876543210');
    expect(normalizePhone('+91', '098765-43210')?.e164).toBe('+919876543210');
    expect(normalizePhone('+91', '(987) 654 3210')?.e164).toBe('+919876543210');
    expect(normalizePhone('+91', '+91 98765 43210')?.e164).toBe('+919876543210');
  });

  it('keeps a real Indian mobile that starts with 91', () => {
    // The regression the mobile app's review caught: stripping a "duplicate"
    // country code rejects the genuine 91xxxxxxxx series and locks that member out.
    expect(normalizePhone('+91', '9176543210')?.e164).toBe('+919176543210');
    expect(normalizePhone('+91', '9199999999')?.e164).toBe('+919199999999');
    // What actually protects it is the strict 10-digit rule, not the candidate
    // ordering: the dial-stripped reading of a 10-digit number is 8 digits and
    // can never be valid for +91. Pinned so the real guard is the tested one.
    expect(normalizePhone('+91', '91765432')).toBeNull();
  });

  it('prefers the dial-stripped reading where BOTH readings are plausible', () => {
    // This is where candidate ordering genuinely decides the answer. Outside
    // India the length rule is permissive (6-14 digits), so `447911123456` is
    // valid both as-typed AND with the +44 stripped. A re-typed country code is
    // far likelier, so the stripped reading must win — reverse the ordering and
    // this becomes +44447911123456.
    expect(normalizePhone('+44', '447911123456')?.e164).toBe('+447911123456');
    expect(normalizePhone('+971', '971501234567')?.e164).toBe('+971501234567');
  });

  it('rejects numbers that cannot be Indian mobiles', () => {
    expect(normalizePhone('+91', '5876543210')).toBeNull(); // must start 6-9
    expect(normalizePhone('+91', '98765')).toBeNull(); // too short
    expect(normalizePhone('+91', '98765432109')).toBeNull(); // too long
    expect(normalizePhone('+91', '')).toBeNull();
    expect(normalizePhone('+91', 'abcd')).toBeNull();
  });

  it('stays permissive outside India rather than guessing a local rule', () => {
    expect(normalizePhone('+971', '501234567')?.e164).toBe('+971501234567');
    expect(normalizePhone('+1', '4155550123')?.e164).toBe('+14155550123');
    expect(normalizePhone('+44', '447911123456')?.e164).toBe('+447911123456');
  });

  it('rejects a nonsense dial code', () => {
    expect(normalizePhone('', '9876543210')).toBeNull();
    expect(normalizePhone('+123456', '9876543210')).toBeNull();
  });
});

describe('validateE164 / formatting', () => {
  it('validates a fully typed number', () => {
    expect(validateE164('+919876543210')).toBe('+919876543210');
    expect(validateE164(' +91 98765 43210 ')).toBe('+919876543210');
    expect(validateE164('+915876543210')).toBeNull(); // invalid Indian prefix
    expect(validateE164('9876543210')).toBeNull(); // no country code
  });

  it('formats for reading aloud and strips for links', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('+14155550123')).toBe('+14155550123');
    expect(phoneDigits('+91 98765 43210')).toBe('919876543210');
  });
});

describe('names', () => {
  it('tidies without mangling', () => {
    expect(normalizeName('  riya   sharma ')).toBe('riya sharma');
    expect(normalizeName('')).toBe('');
  });

  it('builds initials from first and last name', () => {
    expect(initials('Riya Sharma')).toBe('RS');
    expect(initials('Riya Anjali Sharma')).toBe('RS');
    expect(initials('Riya')).toBe('R');
    expect(initials('   ')).toBe('?');
  });
});

describe('validateMember', () => {
  it('accepts the minimum a rushed front desk can supply', () => {
    const result = validateMember(form({ email: '', address: '' }), TODAY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fullName).toBe('Riya Sharma');
      expect(result.value.phone).toBe('+919876543210');
      expect(result.value.email).toBeNull();
      expect(result.value.joinedOn).toBe(TODAY);
    }
  });

  it('never returns lifecycle state, so a save cannot un-archive anybody', () => {
    // The bug this pins: validation used to hand back `archived: false` on every
    // save, so opening an archived member to fix a typo silently put them back
    // on the roster and into every count. Archiving is its own action.
    const result = validateMember(form(), TODAY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value)).not.toContain('archived');
      expect(Object.keys(result.value)).not.toContain('photoUri');
    }
  });

  it('names the field at fault instead of failing generically', () => {
    const noName = validateMember(form({ fullName: ' ' }), TODAY);
    expect(noName).toMatchObject({ ok: false, field: 'fullName' });

    const badPhone = validateMember(form({ phone: '12345' }), TODAY);
    expect(badPhone).toMatchObject({ ok: false, field: 'phone' });

    const badEmail = validateMember(form({ email: 'riya@' }), TODAY);
    expect(badEmail).toMatchObject({ ok: false, field: 'email' });

    const badJoin = validateMember(form({ joinedOn: '2026-02-30' }), TODAY);
    expect(badJoin).toMatchObject({ ok: false, field: 'joinedOn' });

    const badEmergency = validateMember(form({ emergencyPhone: '123' }), TODAY);
    expect(badEmergency).toMatchObject({ ok: false, field: 'emergencyPhone' });
  });

  it('rejects a birth date in the future but allows an empty one', () => {
    expect(validateMember(form({ dateOfBirth: '2030-01-01' }), TODAY)).toMatchObject({
      ok: false,
      field: 'dateOfBirth',
    });
    const blank = validateMember(form({ dateOfBirth: '' }), TODAY);
    expect(blank.ok).toBe(true);
    if (blank.ok) expect(blank.value.dateOfBirth).toBeNull();
  });

  it('normalises an emergency number to E.164', () => {
    const result = validateMember(form({ emergencyPhone: '98765 43211' }), TODAY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.emergencyPhone).toBe('+919876543211');
  });

  it('keeps only a recognised gender and treats anything else as unstated', () => {
    const bad = validateMember(form({ gender: 'Male' }), TODAY);
    expect(bad.ok).toBe(true);
    if (bad.ok) expect(bad.value.gender).toBeNull();

    const good = validateMember(form({ gender: 'female' }), TODAY);
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.value.gender).toBe('female');
  });

  it('rejects an over-long name', () => {
    expect(validateMember(form({ fullName: 'a'.repeat(81) }), TODAY)).toMatchObject({
      ok: false,
      field: 'fullName',
    });
  });
});

describe('memberToForm', () => {
  it('round-trips an Indian number back into dial code and national digits', () => {
    const m = makeMember({ phone: '+919876543210', email: 'r@example.com' });
    const f = memberToForm(m);
    expect(f.dialCode).toBe('+91');
    expect(f.phone).toBe('9876543210');
    const back = validateMember({ ...f, fullName: m.fullName }, TODAY);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.value.phone).toBe('+919876543210');
  });

  it('turns nulls into empty strings the form can bind to', () => {
    const f = memberToForm(makeMember({ email: null, notes: null, address: null }));
    expect(f.email).toBe('');
    expect(f.notes).toBe('');
    expect(f.address).toBe('');
  });

  it('round-trips a NON-Indian number instead of dead-ending the edit form', () => {
    // Assuming +91 for everyone meant a stored +971 member reloaded as +91 with
    // 12 digits in the number field, and could not be saved again without
    // retyping it as Indian.
    const uae = makeMember({ phone: '+971501234567' });
    const f = memberToForm(uae);
    expect(f.dialCode).toBe('+971');
    expect(f.phone).toBe('501234567');

    const back = validateMember({ ...f, fullName: uae.fullName }, TODAY);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.value.phone).toBe('+971501234567');
  });
});

describe('splitE164', () => {
  it('takes the longest matching dial code', () => {
    expect(splitE164('+919876543210')).toEqual({ dialCode: '+91', national: '9876543210' });
    expect(splitE164('+971501234567')).toEqual({ dialCode: '+971', national: '501234567' });
    expect(splitE164('+14155550123')).toEqual({ dialCode: '+1', national: '4155550123' });
  });

  it('still splits an unlisted country code so the pair recombines exactly', () => {
    const split = splitE164('+2348012345678');
    expect(`${split.dialCode}${split.national}`).toBe('+2348012345678');
  });
});

describe('findDuplicatePhone', () => {
  const existing = makeMember({ id: 'mem_a', phone: '+919876543210' });
  const other = makeMember({ id: 'mem_b', phone: '+919999999999' });

  it('finds a clash so the roster does not split one person in two', () => {
    expect(findDuplicatePhone([existing, other], '+919876543210')?.id).toBe('mem_a');
    expect(findDuplicatePhone([existing, other], '+911111111111')).toBeNull();
  });

  it('does not report a member as a duplicate of themselves when editing', () => {
    expect(findDuplicatePhone([existing, other], '+919876543210', 'mem_a')).toBeNull();
  });
});

describe('matchesQuery', () => {
  const riya = makeMember({ fullName: 'Riya Sharma', phone: '+919876543210', email: 'riya@example.com' });

  it('finds by name, part of a name, and case-insensitively', () => {
    expect(matchesQuery(riya, 'riya')).toBe(true);
    expect(matchesQuery(riya, 'SHARMA')).toBe(true);
    expect(matchesQuery(riya, 'ya sha')).toBe(true);
    expect(matchesQuery(riya, 'kabir')).toBe(false);
  });

  it('finds by the last digits of a phone number', () => {
    // What a front desk actually does: the member reads out the last four digits.
    expect(matchesQuery(riya, '3210')).toBe(true);
    expect(matchesQuery(riya, '98765 43210')).toBe(true);
    expect(matchesQuery(riya, '+91 98765')).toBe(true);
    expect(matchesQuery(riya, '0000')).toBe(false);
  });

  it('needs at least three digits before treating a query as a number', () => {
    // Otherwise typing "1" matches half the gym.
    const one = makeMember({ fullName: 'Zzz', phone: '+919111111111', email: null });
    expect(matchesQuery(one, '11')).toBe(false);
    expect(matchesQuery(one, '111')).toBe(true);
  });

  it('matches an email and returns everyone for an empty query', () => {
    expect(matchesQuery(riya, 'example.com')).toBe(true);
    expect(matchesQuery(riya, '   ')).toBe(true);
  });
});

describe('a phone number bound for a spreadsheet', () => {
  it('drops the leading + so Excel does not read it as a formula', () => {
    // Found by exporting the real collections report: the CSV injection guard
    // fired on every `+91…` and the whole column came out as `'+91 …`.
    expect(phoneForExport('+919876543210')).toBe('91 98765 43210');
    expect(phoneForExport('+919876543210').startsWith('+')).toBe(false);
  });

  it('keeps a NON-Indian number readable instead of handing Excel a bare integer', () => {
    // The case the first version got wrong. `formatPhone` only spaces out Indian
    // mobiles, so `+971501234567` exported as `971501234567` — twelve bare digits,
    // which Excel renders as 9.71501E+11. A space anywhere makes the cell text.
    expect(phoneForExport('+971501234567')).toBe('971 501234567');
    expect(phoneForExport('+447700900123')).toBe('44 7700900123');
  });

  it('never returns a value a spreadsheet could read as a number', () => {
    // The whole point of the function. Digits alone, with no separator, is the
    // failure mode; a leading + is the other one.
    for (const e164 of ['+919876543210', '+971501234567', '+6591234567', '+14155550123']) {
      const cell = phoneForExport(e164);
      expect(cell.startsWith('+')).toBe(false);
      expect(/^\d+$/.test(cell)).toBe(false);
      expect(cell.replace(/\D/g, '')).toBe(e164.replace(/\D/g, ''));
    }
  });
});
