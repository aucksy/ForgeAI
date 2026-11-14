/**
 * R-517 (owner, 14 Nov 2026): "let the logo of the gym and the name of the gym be bigger, and the logo
 * can be tappable so people can tap on it and see the enlarged logo." The Gym tab's header
 * (src/shop/GymHeaderMark.tsx) and its sizes (src/shop/gymHeader.ts). The test lane draws nothing, so
 * the header is read from its source; the phone pictures are qa/uat-rel-r517-*.yaml (part u517).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bigLogoBox, GYM_HEADER_LOGO, GYM_LOGO_CLOSE_LABEL, GYM_LOGO_TAP_LABEL, gymHeaderLogoWidth } from '@/shop/gymHeader';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const header = read('src/shop/GymHeaderMark.tsx');
const shop = read('src/shop/ShopScreen.tsx');

describe('R-517: the logo on the Gym tab is twice the old size, in its own shape', () => {
  it('56 dp high (the small mark on Workout and Profile stays 28)', () => {
    expect(GYM_HEADER_LOGO).toBe(56);
    expect(header).toMatch(/const LOGO = 56;/);
    expect(header).toMatch(/height: LOGO,/);
    expect(read('src/components/GymBrandMark.tsx')).toMatch(/const LOGO = 28;/);
  });

  it('a square logo is a 56 dp square; a wide one grows up to 2:1 so the name keeps its room', () => {
    expect(gymHeaderLogoWidth(512, 512)).toBe(56);
    expect(gymHeaderLogoWidth(512, 256)).toBe(112);
    expect(gymHeaderLogoWidth(900, 100)).toBe(112); // capped: shown whole inside a 2:1 box
    expect(gymHeaderLogoWidth(300, 200)).toBe(84);
    expect(gymHeaderLogoWidth(100, 400)).toBe(56); // a tall one: contained in the square
    expect(gymHeaderLogoWidth(0, 0)).toBe(56); // not loaded yet
    expect(gymHeaderLogoWidth(null, undefined)).toBe(56);
  });

  it('at 360 dp the name still has most of the row next to the widest logo', () => {
    const row = 360 - 2 * 20; // the page's side padding
    expect(row - gymHeaderLogoWidth(900, 100) - 12).toBeGreaterThanOrEqual(190);
  });

  it('shown whole (never cropped, never squeezed into a circle), with a thin border, and it never shrinks', () => {
    expect(header).toMatch(/contentFit="contain"/);
    expect(header).not.toMatch(/contentFit="cover"/);
    expect(header).toMatch(/borderWidth: 1,/);
    expect(header).toMatch(/flexShrink: 0,/);
  });
});

describe('R-517: the gym name is bigger and bold, with "Your gym" small under it', () => {
  it('22 sp in the heading font, the main ink colour, the gym\'s heading style, up to 2 lines', () => {
    expect(header).toMatch(/fontFamily: type\.display,\s+fontSize: type\.size\.h2,/);
    expect(header).toMatch(/color: color\.ink,\s+\.\.\.brandHeadingStyle\(\)/);
    expect(header).toMatch(/numberOfLines=\{2\}/);
  });

  it('the tagline is its own line under the name (phone tests wait for "Pay at the desk")', () => {
    expect(header).toMatch(/<Text style=\{\{ fontFamily: type\.bodyMedium, fontSize: type\.size\.sub, color: color\.inkSecondary \}\}>\{tagline\}<\/Text>/);
    expect(shop).toMatch(/<GymHeaderMark tagline=\{tagline\} \/>/);
    expect(shop).toMatch(/const tagline = shopOn \? 'Pay at the desk' : 'Your gym';/);
  });

  it('TalkBack still says "Your gym: <name>" (what the phone tests look for on every tab)', () => {
    expect(header).toMatch(/accessibilityLabel=\{`Your gym: \$\{look\.gymName\}`\}/);
  });

  it('only the Gym tab gets the big header; Workout and Profile keep the small mark', () => {
    expect(shop).not.toMatch(/GymBrandMark/);
    expect(read('src/app/(tabs)/workout.tsx')).toMatch(/<GymBrandMark \/>/);
    expect(read('src/app/(tabs)/profile.tsx')).toMatch(/<GymBrandMark \/>/);
  });
});

describe('R-517: tapping the logo shows it full size', () => {
  it('the logo is a button with the words TalkBack reads', () => {
    expect(GYM_LOGO_TAP_LABEL).toBe('Gym logo, tap to see it bigger');
    expect(header).toMatch(/onPress=\{\(\) => setOpen\(true\)\}\s+accessibilityRole="imagebutton"\s+accessibilityLabel=\{GYM_LOGO_TAP_LABEL\}/);
  });

  it('no logo (or one that failed to load): the small dot, and nothing to tap or open', () => {
    // The button and the viewer are both drawn only when there is a logo to show.
    expect(header).toMatch(/\{logo \? \(\s+<Pressable/);
    expect(header).toMatch(/\{logo \? \(\s+<BigLogo/);
    expect(header).toMatch(/failed !== brand\.logoUrl \? brand\.logoUrl : null/);
    expect(header).toMatch(/onError=\{\(\) => setFailed\(logo\)\}/);
    expect(header.match(/setOpen\(true\)/g)?.length).toBe(1);
    expect(header).toMatch(/width: 8, height: 8, borderRadius: 4, backgroundColor: color\.accent/);
  });

  it('a full-screen dark view: Back, the X and a tap anywhere close it', () => {
    expect(header).toMatch(/<Modal visible=\{visible\} transparent animationType="fade" onRequestClose=\{onClose\}/);
    expect(header).toMatch(/backgroundColor: BACKDROP/);
    expect(header).toMatch(/const BACKDROP = 'rgba\(6, 7, 10, 0\.9\d\)';/);
    expect(header).toMatch(/accessible=\{false\}\s+onPress=\{onClose\}/);
    expect(header).toMatch(/<IconButton icon="close" onPress=\{onClose\} accessibilityLabel=\{GYM_LOGO_CLOSE_LABEL\} \/>/);
    expect(GYM_LOGO_CLOSE_LABEL).toBe('Close the logo');
    // The gym's name under the logo.
    expect(header).toMatch(/\{gymName\}\s+<\/Text>/);
  });

  it('the full-size logo is as large as fits, in its own shape', () => {
    // A square logo on a 360 x 700 dp phone: the width less 24 dp each side.
    expect(bigLogoBox(512, 512, 360, 700)).toEqual({ width: 312, height: 312 });
    // A 2:1 logo keeps 2:1.
    expect(bigLogoBox(512, 256, 360, 700)).toEqual({ width: 312, height: 156 });
    // A tall logo is held to 60% of the height, still its own shape.
    expect(bigLogoBox(200, 800, 360, 700)).toEqual({ width: 105, height: 420 });
    // Not loaded yet: a square box (the picture inside is shown whole anyway).
    expect(bigLogoBox(undefined, undefined, 360, 700)).toEqual({ width: 312, height: 312 });
    // Landscape: the height decides.
    expect(bigLogoBox(512, 512, 800, 360)).toEqual({ width: 216, height: 216 });
  });
});
