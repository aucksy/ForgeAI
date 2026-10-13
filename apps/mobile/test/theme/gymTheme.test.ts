/**
 * Gym branding (Level 1): the theme on the phone — the gym's palette written into the theme
 * tokens (theme/brandTokens.ts), ForgeAI's own values back on Leave, and the controller
 * (theme/gymTheme.ts) that follows the gym shop's link: join → repaint + the logo opening; leave /
 * erase → ForgeAI's look; an owner's change mid-use, or the gym dropping this phone → saved, and
 * shown at the next safe moment (back to the foreground with no workout open, under the logo).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));
// The synchronous mirror (expo-sqlite's key-value store) is device-only: kept in a variable here.
const mirror = { value: null as unknown };
vi.mock('@/theme/themeMirror', () => ({
  readMirrorSync: () => mirror.value,
  writeMirror: (m: unknown) => {
    mirror.value = m;
  },
}));

import type { GymBrand } from '@forgeai/theme';

import { useGymShop } from '@/shop/gymStore';
import type { GymLink } from '@/shop/types';
import { appliedBrand, applyBrandToTokens, brandHeadingStyle, defaultColor, paletteForBrand } from '@/theme/brandTokens';
import { UNLINKED_TEXT } from '@/shop/gym';
import { logoMarkWidth } from '@/components/GymBrandMark';
import { dismissOpening, reconcileGymTheme, resetGymThemeForTests, setWorkoutCheck, showWaitingLook, useGymTheme, WAITING_LOOK_AWAY_MS } from '@/theme/gymTheme';
import { chart, color, gradients, shadow } from '@/theme/tokens';

const RAMS: GymBrand = { accent: '#F7D411', bg: '#0A0A0C', logoUrl: `https://hdxzqbdiokjklnypfisq.supabase.co/storage/v1/object/public/gym-logos/${'ab'.repeat(24)}/logo.png`, heading: 'bold-italic', updatedAt: '2026-10-13T10:00:00Z' };
const LINK: GymLink = { memberKey: 'k'.repeat(48), memberId: 'm1', gymId: 'g-rams', gymName: "RAM'S FITNESS CLUB IMPACT", joinCode: 'RAMS01', name: 'Asha', brand: RAMS };
const PLAIN: GymLink = { memberKey: 'p'.repeat(48), memberId: 'm2', gymId: 'g-forge', gymName: 'ForgeAI Test Gym', joinCode: 'FORGE1', name: 'Asha' };

const FORGE = { bg: '#07080C', accent: '#FF7A3B', onAccent: '#1F0D05', ember0: '#FF8B4A', series0: '#E8641F', ramp4: '#E8641F', glow: '#FF7A3B' };

describe('brand tokens: apply and restore', () => {
  beforeEach(() => {
    applyBrandToTokens(null);
  });

  it("writes RAM's palette into the very same token objects", () => {
    const series = chart.series;
    const ember = gradients.ember;
    applyBrandToTokens(RAMS);
    expect(color.accent).toBe('#F7D411');
    expect(color.bg).toBe('#0A0A0C');
    expect(color.onAccent).toBe('#0A0A0A');
    expect(gradients.ember).toBe(ember); // same array, new values (frozen code may hold it)
    expect(ember[0]).not.toBe(FORGE.ember0);
    expect(chart.series).toBe(series);
    expect(series[0]).not.toBe(FORGE.series0);
    expect(shadow.glow.shadowColor).toBe('#F7D411');
    expect(chart.diverging.pos).toBe(series[0]);
    // Ink greys and status colours are not the gym's to change.
    expect(color.ink).toBe(defaultColor('ink'));
    expect(color.critical).toBe(defaultColor('critical'));
    expect(appliedBrand()).toBe(RAMS);
    expect(brandHeadingStyle()).toEqual({ fontStyle: 'italic' });
  });

  it("puts ForgeAI's own values back exactly", () => {
    applyBrandToTokens(RAMS);
    applyBrandToTokens(null);
    expect(color.bg).toBe(FORGE.bg);
    expect(color.accent).toBe(FORGE.accent);
    expect(color.onAccent).toBe(FORGE.onAccent);
    expect(gradients.ember[0]).toBe(FORGE.ember0);
    expect(chart.series[0]).toBe(FORGE.series0);
    expect(chart.ramp[4]).toBe(FORGE.ramp4);
    expect(shadow.glow.shadowColor).toBe(FORGE.glow);
    expect(brandHeadingStyle()).toEqual({});
  });

  it('a logo-only brand keeps ForgeAI\'s colours; a tone-only brand keeps ForgeAI\'s accent', () => {
    expect(paletteForBrand({ ...RAMS, accent: null, bg: null })).toBeNull();
    applyBrandToTokens({ ...RAMS, accent: null });
    expect(color.accent).toBe(FORGE.accent);
    expect(color.bg).toBe('#0A0A0C');
  });

  it('a damaged colour never breaks the app', () => {
    expect(applyBrandToTokens({ ...RAMS, accent: 'not-a-colour' })).toBeNull();
    expect(color.accent).toBe(FORGE.accent);
  });
});

describe('gym theme controller', () => {
  beforeEach(() => {
    applyBrandToTokens(null);
    mirror.value = null;
    useGymShop.getState().unlink(null);
    resetGymThemeForTests(null);
  });

  it('joining a branded gym repaints the app and shows its logo', () => {
    useGymShop.getState().setLink(LINK);
    reconcileGymTheme(false);
    const s = useGymTheme.getState();
    expect(s.epoch).toBe(1);
    expect(color.accent).toBe('#F7D411');
    expect(s.opening).toMatchObject({ gymName: LINK.gymName, logoUrl: RAMS.logoUrl, heading: 'bold-italic', bg: '#0A0A0C' });
    expect(mirror.value).toEqual({ gymId: 'g-rams', gymName: LINK.gymName, brand: RAMS });
  });

  it('Leave gym brings ForgeAI\'s look back (no opening) and forgets the saved look', () => {
    useGymShop.getState().setLink(LINK);
    reconcileGymTheme(false);
    dismissOpening();
    useGymShop.getState().unlink(null);
    reconcileGymTheme(false);
    expect(useGymTheme.getState().epoch).toBe(2);
    expect(useGymTheme.getState().opening).toBeNull();
    expect(color.accent).toBe(FORGE.accent);
    expect(mirror.value).toBeNull();
  });

  it('joining an unbranded gym redraws nothing', () => {
    useGymShop.getState().setLink(PLAIN);
    reconcileGymTheme(false);
    expect(useGymTheme.getState().epoch).toBe(0);
    expect(useGymTheme.getState().opening).toBeNull();
    expect(mirror.value).toEqual({ gymId: 'g-forge', gymName: 'ForgeAI Test Gym', brand: null });
  });

  it("the owner's new colour mid-use is saved, never re-drawn on the spot", () => {
    useGymShop.getState().setLink(LINK);
    reconcileGymTheme(false);
    dismissOpening();
    const red: GymBrand = { ...RAMS, accent: '#D32F2F' };
    useGymShop.getState().setGymNow({ gymId: 'g-rams', gymName: LINK.gymName, brand: red });
    reconcileGymTheme(false);
    expect(useGymTheme.getState().epoch).toBe(1); // no redraw
    expect(color.accent).toBe('#F7D411');
    expect((mirror.value as { brand: GymBrand }).brand.accent).toBe('#D32F2F'); // next launch
  });

  it('D1: …and shown when the app next comes back to the foreground, under the logo — not during a workout', () => {
    useGymShop.getState().setLink(LINK);
    reconcileGymTheme(false);
    dismissOpening();
    useGymShop.getState().setGymNow({ gymId: 'g-rams', gymName: LINK.gymName, brand: { ...RAMS, accent: '#D32F2F' } });
    reconcileGymTheme(false);
    let lifting = true;
    setWorkoutCheck(() => lifting);
    expect(showWaitingLook()).toBe(false); // a workout is open: it keeps waiting
    expect(useGymTheme.getState().epoch).toBe(1);
    expect(color.accent).toBe('#F7D411');
    lifting = false;
    expect(showWaitingLook()).toBe(true);
    const s = useGymTheme.getState();
    expect(s.epoch).toBe(2);
    expect(color.accent).not.toBe('#F7D411');
    expect(s.opening).toMatchObject({ gymName: LINK.gymName, logoUrl: RAMS.logoUrl }); // the logo covers the redraw
    expect(showWaitingLook()).toBe(false); // nothing waits any more
    expect(useGymTheme.getState().epoch).toBe(2);
  });

  it("D1: a member's gym that newly gets a look sees it at the next foreground (not two launches later)", () => {
    useGymShop.getState().setLink(PLAIN);
    reconcileGymTheme(false);
    useGymShop.getState().setGymNow({ gymId: 'g-forge', gymName: PLAIN.gymName, brand: RAMS });
    reconcileGymTheme(false);
    expect(useGymTheme.getState().epoch).toBe(0);
    expect((mirror.value as { brand: GymBrand }).brand).toEqual(RAMS); // a cold start would show it too
    expect(showWaitingLook()).toBe(true);
    expect(color.accent).toBe('#F7D411');
    expect(useGymTheme.getState().opening?.gymName).toBe(PLAIN.gymName);
  });

  it('D2: the gym dropping this phone (left on another phone, removed) never redraws mid-use', () => {
    useGymShop.getState().setLink(LINK);
    reconcileGymTheme(false);
    dismissOpening();
    useGymShop.getState().unlink(UNLINKED_TEXT);
    reconcileGymTheme(false);
    expect(useGymTheme.getState().epoch).toBe(1); // no redraw now (a running hold timer survives)
    expect(color.accent).toBe('#F7D411');
    expect(mirror.value).toBeNull(); // the next launch starts in ForgeAI's look
    expect(useGymTheme.getState().look?.gymId).toBe('g-rams'); // the header still matches the colours
    setWorkoutCheck(() => true);
    expect(showWaitingLook()).toBe(false);
    expect(color.accent).toBe('#F7D411');
    setWorkoutCheck(() => false);
    expect(showWaitingLook()).toBe(true);
    expect(color.accent).toBe(FORGE.accent);
    expect(useGymTheme.getState().epoch).toBe(2);
    expect(useGymTheme.getState().opening).toBeNull();
    expect(useGymTheme.getState().look).toBeNull();
  });

  it('review fix: a quick trip out (share sheet, picker) is not a visit — the waiting look keeps waiting', () => {
    useGymShop.getState().setLink(LINK);
    reconcileGymTheme(false);
    dismissOpening();
    useGymShop.getState().setGymNow({ gymId: 'g-rams', gymName: LINK.gymName, brand: { ...RAMS, accent: '#D32F2F' } });
    reconcileGymTheme(false);
    setWorkoutCheck(() => false);
    expect(showWaitingLook(5_000)).toBe(false);
    expect(color.accent).toBe('#F7D411');
    expect(showWaitingLook(WAITING_LOOK_AWAY_MS)).toBe(true);
    expect(color.accent).not.toBe('#F7D411');
  });

  it('review fix: an owner change arriving while the logo is up at start-up never redraws over an open workout', () => {
    useGymShop.getState().setLink(LINK);
    reconcileGymTheme(false); // the opening is up
    expect(useGymTheme.getState().opening).not.toBeNull();
    const epoch = useGymTheme.getState().epoch;
    setWorkoutCheck(() => true);
    useGymShop.getState().setGymNow({ gymId: 'g-rams', gymName: LINK.gymName, brand: { ...RAMS, accent: '#D32F2F' } });
    reconcileGymTheme(false);
    expect(useGymTheme.getState().epoch).toBe(epoch);
    expect(color.accent).toBe('#F7D411');
    expect((mirror.value as { brand: GymBrand }).brand.accent).toBe('#D32F2F'); // waits for the next launch / visit
  });

  it("D12: the header's gym (logo and name) switches together with the colours, never before", () => {
    useGymShop.getState().setLink(LINK);
    reconcileGymTheme(false);
    expect(useGymTheme.getState().look).toEqual({ gymId: 'g-rams', gymName: LINK.gymName, brand: RAMS });
    dismissOpening();
    const next: GymBrand = { ...RAMS, accent: '#D32F2F', logoUrl: null };
    useGymShop.getState().setGymNow({ gymId: 'g-rams', gymName: 'RAMS', brand: next });
    reconcileGymTheme(false);
    expect(useGymTheme.getState().look?.brand).toEqual(RAMS); // still the colours on screen
    expect(useGymTheme.getState().look?.gymName).toBe(LINK.gymName);
    showWaitingLook();
    expect(useGymTheme.getState().look).toEqual({ gymId: 'g-rams', gymName: 'RAMS', brand: next });
  });

  it('a renamed gym with the same look just takes the new name (no redraw)', () => {
    useGymShop.getState().setLink(LINK);
    reconcileGymTheme(false);
    dismissOpening();
    useGymShop.getState().setGymNow({ gymId: 'g-rams', gymName: 'RAMS Club', brand: RAMS });
    reconcileGymTheme(false);
    expect(useGymTheme.getState().epoch).toBe(1);
    expect(useGymTheme.getState().look?.gymName).toBe('RAMS Club');
  });

  it('…but while the logo is still on screen it is applied at once, under it', () => {
    useGymShop.getState().setLink(LINK);
    reconcileGymTheme(false);
    const id = useGymTheme.getState().opening?.id;
    useGymShop.getState().setGymNow({ gymId: 'g-rams', gymName: LINK.gymName, brand: { ...RAMS, accent: '#D32F2F' } });
    reconcileGymTheme(false);
    expect(useGymTheme.getState().epoch).toBe(2);
    expect(useGymTheme.getState().opening?.id).toBe(id); // same animation, not restarted
    expect(color.accent).not.toBe('#F7D411');
  });

  it('at launch, a branded gym gets its opening even when the saved look already matches', () => {
    applyBrandToTokens(RAMS);
    resetGymThemeForTests({ gymId: 'g-rams', gymName: LINK.gymName, brand: RAMS });
    useGymShop.getState().setLink(LINK);
    reconcileGymTheme(true);
    expect(useGymTheme.getState().epoch).toBe(0); // the boot already painted it
    expect(color.accent).toBe('#F7D411');
  });
});

describe('the header mark keeps a logo whole (D14)', () => {
  it('a square badge stays 28 dp; a wide wordmark gets its own width (up to 4:1), never squeezed', () => {
    expect(logoMarkWidth(512, 512)).toBe(28);
    expect(logoMarkWidth(512, 128)).toBe(112);
    expect(logoMarkWidth(900, 100)).toBe(112); // capped at 4:1
    expect(logoMarkWidth(300, 200)).toBe(42);
    expect(logoMarkWidth(100, 400)).toBe(28); // a tall one: contained in the square
    expect(logoMarkWidth(0, 0)).toBe(28); // not known yet
    expect(logoMarkWidth(null, undefined)).toBe(28);
  });
});
