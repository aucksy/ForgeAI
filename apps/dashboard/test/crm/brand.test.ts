/**
 * Gym branding (Level 1) — the panel's Branding screen rules (src/crm/brand/brandLogic.ts) and
 * the shared palette engine as the panel uses it. Contract: supabase/migrations/0005_gym_theme.sql.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUTTON_INK, buildBrandPalette, contrastRatio, parseGymBrand } from '@forgeai/theme';

import {
  CLEAR_ARGS,
  FORGE_ACCENT,
  brandErrorWords,
  checkEncodedLogo,
  draftChanged,
  draftFromBrand,
  draftValid,
  hexError,
  isLogoUrl,
  logoPath,
  MAX_LOGO_BYTES,
  newLogoName,
  previewPalette,
  saveArgs,
} from '../../src/crm/brand/brandLogic';

const TICKET = 'b2'.repeat(24);
const LOGO = `https://hdxzqbdiokjklnypfisq.supabase.co/storage/v1/object/public/gym-logos/${TICKET}/logo-0f3c9a.png`;
const RAMS = parseGymBrand({ accent: '#F7D411', bg: '#0A0A0C', logoUrl: LOGO, heading: 'bold-italic', updatedAt: '2026-10-13T10:00:00Z' })!;

describe('the Branding form', () => {
  it('starts from the saved brand, or from MettleUp’s ember', () => {
    expect(draftFromBrand(RAMS)).toEqual({ accent: '#F7D411', useBg: true, bg: '#0A0A0C', logoUrl: LOGO, heading: 'bold-italic' });
    expect(draftFromBrand(null)).toMatchObject({ accent: FORGE_ACCENT, useBg: false, logoUrl: null, heading: 'normal' });
  });

  it('checks the colour codes in plain words', () => {
    expect(hexError('#F7D411')).toBeNull();
    expect(hexError('f7d411')).toBeNull();
    expect(hexError('')).toMatch(/Pick a colour/);
    expect(hexError('#F7D4')).toMatch(/six letters or numbers/);
    expect(draftValid({ ...draftFromBrand(RAMS), bg: 'nope' })).toBe(false);
    expect(draftValid({ ...draftFromBrand(RAMS), bg: 'nope', useBg: false })).toBe(true);
  });

  it('previews exactly what the app builds (same shared engine)', () => {
    expect(previewPalette(draftFromBrand(RAMS))).toEqual(buildBrandPalette({ accent: '#F7D411', bg: '#0A0A0C' }));
    expect(previewPalette({ ...draftFromBrand(RAMS), accent: '#F7' })).toBeNull();
  });

  it('RAM’s yellow previews with black words on it and every pair readable', () => {
    const p = previewPalette(draftFromBrand(RAMS))!;
    expect(p.color.onAccent).toBe('#0A0A0A');
    expect(contrastRatio(BUTTON_INK, p.gradients.ember[1])).toBeGreaterThanOrEqual(4.5);
    expect(p.ok).toBe(true);
  });

  it('saves the whole look; an unticked background tone is saved as none', () => {
    expect(saveArgs(draftFromBrand(RAMS))).toEqual({ p_accent: '#F7D411', p_bg: '#0A0A0C', p_logo_url: LOGO, p_heading: 'bold-italic' });
    expect(saveArgs({ ...draftFromBrand(RAMS), useBg: false, accent: 'f7d411' })).toMatchObject({ p_accent: '#F7D411', p_bg: null });
    expect(CLEAR_ARGS).toEqual({ p_accent: null, p_bg: null, p_logo_url: null, p_heading: 'normal' });
  });

  it('knows when Save has something to save', () => {
    expect(draftChanged(draftFromBrand(RAMS), RAMS)).toBe(false);
    expect(draftChanged({ ...draftFromBrand(RAMS), heading: 'normal' }, RAMS)).toBe(true);
    // A gym with no look yet: MettleUp's ember IS no look — nothing to save until something changes.
    expect(draftChanged(draftFromBrand(null), null)).toBe(false);
    expect(draftChanged({ ...draftFromBrand(null), logoUrl: LOGO }, null)).toBe(true);
    // A look saved earlier with MettleUp's ember written out: the same look, nothing to save.
    const oldSave = parseGymBrand({ accent: '#FF7A3B', logoUrl: LOGO })!;
    expect(draftChanged(draftFromBrand(oldSave), oldSave)).toBe(false);
  });

  it("D9: a logo-only gym saves NO colour — the phone keeps MettleUp's hand-tuned look", () => {
    const logoOnly = { ...draftFromBrand(null), logoUrl: LOGO };
    expect(saveArgs(logoOnly)).toEqual({ p_accent: null, p_bg: null, p_logo_url: LOGO, p_heading: 'normal' });
    expect(saveArgs({ ...logoOnly, accent: '#ff7a3b' }).p_accent).toBeNull();
    // A colour the owner picked is saved as picked.
    expect(saveArgs({ ...logoOnly, accent: '#D32F2F' }).p_accent).toBe('#D32F2F');
    // …and the preview of the untouched form is MettleUp's own palette, shade for shade.
    const p = previewPalette(logoOnly)!;
    expect(p.color.accentBright).toBe('#FFA043');
    expect(p.gradients.ember).toEqual(['#FF8B4A', '#F0570F']);
    expect(p.nudges).toEqual([]);
  });

  it('D1: the promise under Save is what the phone does (no "next time they open the app")', () => {
    const screen = readFileSync(resolve(__dirname, '../../src/crm/brand/BrandingScreen.tsx'), 'utf8');
    expect(screen).not.toMatch(/next time they open (the app|it)/);
    expect(screen).toMatch(/never in the middle of a workout/);
  });
});

describe('the logo', () => {
  it('goes in the gym-logos bucket under a ticket, as a fresh PNG', () => {
    expect(newLogoName(() => 'AB-cd-0123-zz')).toBe('logo-abcd0123.png');
    expect(logoPath(TICKET, 'logo-abcd.png')).toBe(`${TICKET}/logo-abcd.png`);
    expect(() => logoPath('short', 'logo.png')).toThrow();
    expect(isLogoUrl(LOGO)).toBe(true);
    expect(isLogoUrl(null)).toBe(true);
    expect(isLogoUrl(LOGO.replace('gym-logos', 'product-photos'))).toBe(false);
    expect(isLogoUrl(`${LOGO}/extra`)).toBe(false);
  });

  it('keeps to the bucket’s limits, in plain words', () => {
    expect(checkEncodedLogo({ type: 'image/png', size: 300_000 })).toBeNull();
    expect(checkEncodedLogo({ type: 'image/png', size: MAX_LOGO_BYTES + 1 })).toMatch(/over 1 MB/);
    expect(checkEncodedLogo({ type: 'image/gif', size: 10 })).toMatch(/PNG or JPEG/);
  });

  it('the panel’s logo rule matches the server’s (_logo_url_ok)', () => {
    const sql = readFileSync(resolve(__dirname, '../../../../supabase/migrations/0005_gym_theme.sql'), 'utf8');
    const m = /p_url ~ '(\^https:[^']+)'/.exec(sql);
    expect(m).not.toBeNull();
    const re = new RegExp(m![1]);
    expect(re.test(LOGO)).toBe(true);
    expect(re.test(LOGO.replace('gym-logos', 'product-photos'))).toBe(false);
  });

  it('D8: the server holds every gym row to it (0006: a CHECK, not only owner_set_brand)', () => {
    const sql = readFileSync(resolve(__dirname, '../../../../supabase/migrations/0006_brand_logo_check.sql'), 'utf8');
    const body = sql.replace(/--.*$/gm, '');
    expect(body).toMatch(/add constraint gyms_brand_logo_url_ok\s+check \(public\._logo_url_ok\(brand_logo_url\)\) not valid/i);
    expect(body).toMatch(/validate constraint gyms_brand_logo_url_ok/i);
    // The app refuses the same links on its side (packages/theme logoUrlOf).
    expect(parseGymBrand({ accent: '#F7D411', logoUrl: 'https://tracker.example.com/p.gif' })?.logoUrl).toBeNull();
    expect(parseGymBrand({ accent: '#F7D411', logoUrl: LOGO })?.logoUrl).toBe(LOGO);
  });
});

describe('owner-facing words', () => {
  it('never shows a raw database message', () => {
    expect(brandErrorWords({ message: 'BAD_COLOUR' })).toMatch(/colour code/);
    expect(brandErrorWords({ message: 'BAD_LOGO' })).toMatch(/Upload the logo again/);
    expect(brandErrorWords({ message: 'BAD_KEY' })).toMatch(/no longer available/);
    expect(brandErrorWords({ message: 'Could not find the function public.owner_set_brand' })).toMatch(/isn’t ready for your gym yet. Message MettleUp on WhatsApp/);
    expect(brandErrorWords(new Error('Failed to fetch'))).toMatch(/internet/);
    expect(brandErrorWords({ message: 'deadlock detected' })).toBe('That didn’t save. Please try again.');
  });
});
