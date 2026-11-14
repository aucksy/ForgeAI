/**
 * R-458 (owner, 12 Nov 2026): "if owner is logging in using their phone number, then automatically their gym's
 * colors and branding ... will be unlocked." The Gym tab's no-gym screen: "Do you run a gym on MettleUp?" -> the
 * admin sign-in (mobile + PIN) -> the gym's own "Join <gym>" screen. Nothing of the sign-in is kept.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { STAFF_DOOR, STAFF_DOOR_ON, STAFF_PHONE_ERROR, lockTime, staffDoorFromRow, staffDoorProblem, staffMobile, staffPin } from '@/shop/staffDoor';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

describe('R-458: what the owner types', () => {
  it('an Indian mobile in any usual shape; anything else is refused', () => {
    expect(staffMobile('98765 43210')).toBe('9876543210');
    expect(staffMobile('+91 98765-43210')).toBe('9876543210');
    expect(staffMobile('098765 43210')).toBe('9876543210');
    expect(staffMobile('919876543210')).toBe('9876543210');
    expect(staffMobile('12345 67890')).toBeNull(); // not 6-9 first
    expect(staffMobile('98765 4321')).toBeNull();
    expect(staffMobile('')).toBeNull();
  });
  it('a PIN or one-time code is exactly 6 digits (spaces and a dash allowed)', () => {
    expect(staffPin('482913')).toBe('482913');
    expect(staffPin('482 913')).toBe('482913');
    expect(staffPin('482-913')).toBe('482913');
    expect(staffPin('48291')).toBeNull();
    expect(staffPin('48291a')).toBeNull();
    expect(staffPin('4829130')).toBeNull();
  });
});

describe('R-458: the server answer (staff_sign_in, 0034/0048)', () => {
  it('a good sign-in gives only the gym code and name, never the session key', () => {
    const a = staffDoorFromRow({ sessionKey: 'k'.repeat(40), gymId: 'g1', name: ' Iron Temple ', joinCode: 'ab12cd', person: { name: 'Raj' } });
    expect(a).toEqual({ ok: true, joinCode: 'AB12CD', gymName: 'Iron Temple' });
    expect(JSON.stringify(a)).not.toContain('kkkk');
  });
  it('wrong PIN with tries left, a lock with its time, a bad number, anything else', () => {
    expect(staffDoorFromRow({ error: 'WRONG_CODE', triesLeft: 2 })).toEqual({ ok: false, problem: 'WRONG', triesLeft: 2 });
    expect(staffDoorFromRow({ error: 'WRONG_CODE' })).toEqual({ ok: false, problem: 'WRONG', triesLeft: null });
    expect(staffDoorFromRow({ error: 'TOO_MANY_TRIES', lockedUntil: '2026-11-12T11:05:00Z' })).toEqual({ ok: false, problem: 'LOCKED', lockedUntil: '2026-11-12T11:05:00Z' });
    expect(staffDoorFromRow({ error: 'TOO_MANY_TRIES' })).toEqual({ ok: false, problem: 'LOCKED', lockedUntil: null });
    expect(staffDoorFromRow({ error: 'BAD_PHONE' })).toEqual({ ok: false, problem: 'BAD_PHONE' });
    expect(staffDoorFromRow({ error: 'SUSPENDED' })).toEqual({ ok: false, problem: 'OTHER' });
    // No usable gym code (an old owner key, a broken answer): never opens a join screen.
    expect(staffDoorFromRow({ sessionKey: 'k'.repeat(40), joinCode: '' })).toEqual({ ok: false, problem: 'OTHER' });
    expect(staffDoorFromRow(null)).toEqual({ ok: false, problem: 'OTHER' });
  });
});

describe('R-458: the words', () => {
  it('never says the number has no account (same words for a wrong PIN and an unknown number)', () => {
    const wrong = staffDoorProblem({ ok: false, problem: 'WRONG', triesLeft: null });
    expect(wrong).toBe('This mobile number and PIN do not match. Check both and try again.');
    expect(wrong).not.toMatch(/no account|not found|not registered/i);
  });
  it('tries left only when few; the lock time in India time', () => {
    expect(staffDoorProblem({ ok: false, problem: 'WRONG', triesLeft: 4 })).toBe('This mobile number and PIN do not match. Check both and try again.');
    expect(staffDoorProblem({ ok: false, problem: 'WRONG', triesLeft: 2 })).toBe('This mobile number and PIN do not match. You have 2 tries left before your PIN locks for a while.');
    expect(staffDoorProblem({ ok: false, problem: 'WRONG', triesLeft: 1 })).toContain('You have 1 try left');
    expect(staffDoorProblem({ ok: false, problem: 'WRONG', triesLeft: 0 })).toContain('Your PIN is now locked');
    expect(lockTime('2026-11-12T11:05:00Z')).toBe('4:35 pm');
    expect(lockTime('2026-11-12T18:40:00Z')).toBe('12:10 am');
    expect(lockTime('nonsense')).toBeNull();
    expect(staffDoorProblem({ ok: false, problem: 'LOCKED', lockedUntil: '2026-11-12T11:05:00Z' })).toBe('Too many wrong tries, so your PIN is locked. Try again after 4:35 pm.');
    expect(staffDoorProblem({ ok: false, problem: 'LOCKED', lockedUntil: null })).toBe('Too many wrong tries, so your PIN is locked. Try again in 15 minutes.');
    expect(staffDoorProblem({ ok: false, problem: 'BAD_PHONE' })).toBe(STAFF_PHONE_ERROR);
    expect(staffDoorProblem({ ok: false, problem: 'OFFLINE' })).toBe('There is no internet connection. Connect and try again.');
    expect(staffDoorProblem({ ok: false, problem: 'OTHER' })).toBe('We could not sign you in just now. Try again in a minute.');
  });
  it('the card says who it is for, what happens, and that the PIN is not kept', () => {
    expect(STAFF_DOOR.title).toBe('Do you run a gym on MettleUp?');
    expect(STAFF_DOOR.body).toMatch(/Owners and front-desk staff/);
    expect(STAFF_DOOR.body).toMatch(/in its own colours/);
    expect(STAFF_DOOR.kept).toBe('Your PIN is only checked. It is never saved on this phone.');
    expect(STAFF_DOOR.pinHint).toMatch(/MettleUp admin app/);
    // The boxes' grey hints fit one line on his phone (360 dp, font 1.3): 27 characters were cut (run 43191909724).
    expect(STAFF_DOOR.pinLabel.length).toBeLessThanOrEqual(24);
    expect(STAFF_DOOR.phoneLabel.length).toBeLessThanOrEqual(24);
  });
});

describe('R-458: wiring', () => {
  it('only on the no-gym screen, after the member cards', () => {
    const shop = read('src/shop/ShopScreen.tsx');
    const door = shop.slice(shop.indexOf('function JoinGymDoor'), shop.indexOf('function RecommendGymCard'));
    expect(door).toMatch(/<RecommendGymCard \/>[\s\S]*<StaffDoorCard \/>/);
    expect(shop.match(/<StaffDoorCard/g)?.length).toBe(1);
  });
  it('R-493 (owner, 14 Nov 2026: "I did not want this"): hidden behind its switch, which is off; the code stays', () => {
    expect(STAFF_DOOR_ON).toBe(false);
    const shop = read('src/shop/ShopScreen.tsx');
    expect(shop).toMatch(/\{STAFF_DOOR_ON \? <StaffDoorCard \/> : null\}/);
    expect(shop).not.toMatch(/^\s*<StaffDoorCard \/>\s*$/m);
  });
  it('the session is signed out at once and its key never kept, returned or logged', () => {
    const api = read('src/shop/gymApi.ts');
    const fn = api.slice(api.indexOf('export async function apiStaffGymCode'), api.indexOf("/** The gym's messages for this member"));
    expect(fn).toMatch(/call\('staff_sign_in', \{ p_phone: phone, p_code: pin, p_device:/);
    expect(fn).toMatch(/call\('staff_sign_out', \{ p_key: key \}/);
    expect(fn).not.toMatch(/console\.\w+\([^)]*key/);
    expect(fn).not.toMatch(/setMeta|AsyncStorage|SecureStore|setItem/);
    expect(fn).toMatch(/return staffDoorFromRow\(r\.data\)/);
  });
  it('a good sign-in opens the usual "Join <gym>" screen (which asks first); the PIN is cleared every time', () => {
    const card = read('src/shop/StaffDoorCard.tsx');
    expect(card).toMatch(/router\.push\(`\/j\/\$\{a\.joinCode\}`\)/);
    expect(card.match(/setPin\(''\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(card).toMatch(/secureTextEntry/);
    expect(card).not.toMatch(/setMeta|AsyncStorage|SecureStore/);
  });
});
