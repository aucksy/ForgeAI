/**
 * R-77 (owner, 22 Oct 2026): "the shop shouldn't be there if there is no gym active, and as soon as
 * the gym is active ... and the gym owner has a shop activated ... then it starts showing up";
 * "Leave gym should be a separate option"; after joining, the gym's welcome, then a pop-up to add
 * its icon, and the default icon gone.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { GYM_ICON_WORDS, UNLINKED_TITLE } from '@/shop/gymIconWords';
import { GYM_TAB_LABEL, gymTabFor } from '@/shop/gymTab';

const read = (f: string) => readFileSync(f, 'utf8');

describe('R-77: the gym tab shows only when it works', () => {
  it('no gym: no tab; a gym with no shop: "Gym"; its shop on: "Shop"', () => {
    expect(gymTabFor(false, 0)).toBe('none');
    expect(gymTabFor(false, 12)).toBe('none');
    expect(gymTabFor(true, 0)).toBe('gym');
    expect(gymTabFor(true, 1)).toBe('shop');
    expect(GYM_TAB_LABEL).toEqual({ gym: 'Gym', shop: 'Shop' });
  });

  it('the tab bar leaves the tab out with no gym and names it by the rule', () => {
    const bar = read('src/tracker/components/TrackerTabBar.tsx');
    expect(bar).toMatch(/gymTabFor\(memberId != null, productCount\)/);
    expect(bar).toMatch(/!\(name === 'shop' && gymTab === 'none'\)/);
    expect(bar).toMatch(/if \(!tabShown\(route\.name\)\) return null/);
    expect(bar).toMatch(/GYM_TAB_LABEL\[gymTab\]/);
  });

  it('no gym: the tab address goes to Workout (no join card, no sample shop there)', () => {
    const shop = read('src/shop/ShopScreen.tsx');
    expect(shop).toMatch(/return <Redirect href="\/workout" \/>/);
    expect(shop).not.toMatch(/See a sample shop|function JoinShop|function SampleShop/);
    // The shop's own parts show only while it is on.
    expect(shop).toMatch(/const shopOn = products\.length > 0/);
    expect(shop).toMatch(/\{shopOn \? <BagButton/);
    expect(shop).toMatch(/\{shopOn \? <ProductGrid/);
  });

  it('the gym list is asked for right after a join and on every gym check (the tab is right at once)', () => {
    const actions = read('src/shop/gymActions.ts');
    expect(actions.match(/void refreshProducts\(\)\.catch/g)?.length).toBe(2);
  });

  it('a join lands on Workout; the icon pop-up waits for the welcome to go', () => {
    const offer = read('src/shop/GymIconOffer.tsx');
    expect(offer).toMatch(/if \(!pending \|\| opening\) return undefined/);
    expect(offer).toMatch(/markShortcutOffered\(shown\.joinCode\)/);
    expect(read('src/app/_layout.tsx')).toMatch(/\{ready \? <GymIconOfferHost \/> : null\}/);
  });

  it('the pop-up says plainly how to take the ForgeAI icon off, and never to uninstall', () => {
    expect(GYM_ICON_WORDS.addTitle('RAM Fitness Club')).toBe('Put RAM Fitness Club on your home screen');
    expect(GYM_ICON_WORDS.removeSteps.join(' ')).toMatch(/Press and hold the ForgeAI icon/);
    expect(GYM_ICON_WORDS.removeNote).toMatch(/stays on your phone/);
    expect(GYM_ICON_WORDS.removeNote).toMatch(/Don't tap Uninstall/);
    const all = [GYM_ICON_WORDS.addTitle('X'), GYM_ICON_WORDS.addBody('X'), ...GYM_ICON_WORDS.removeSteps, GYM_ICON_WORDS.removeNote];
    for (const w of all) expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
  });

  it('review fix: the remove step comes only once the gym icon is really on the home screen', () => {
    const offer = read('src/shop/GymIconOffer.tsx');
    // "asked" = Android's question is up, not a yes: wait, then look (ask=false) when the app is back.
    expect(offer).toMatch(/if \(r === 'asked'\) \{[\s\S]*?setStep\('confirm'\)/);
    expect(offer).toMatch(/addGymShortcut\(link, false\)/);
    expect(offer).toMatch(/setStep\(r === 'updated' \? 'remove' : 'notAdded'\)/);
    expect(offer).toMatch(/if \(s === 'active'\) void check\(shown\)/);
    expect(GYM_ICON_WORDS.notAddedBody).toMatch(/Settings → Your gym/);
    // One "Not now" (the footer); the × says Close.
    expect(offer).toMatch(/closeLabel=\{W\.close\}/);
  });

  it('review fix: the gym letting the phone go is said, not just a tab that vanishes', () => {
    expect(UNLINKED_TITLE('RAM Fitness Club')).toBe('No longer in RAM Fitness Club');
    expect(read('src/shop/GymIconOffer.tsx')).toMatch(/if \(prev\.link && s\.notice\) void tell\(UNLINKED_TITLE\(prev\.link\.gymName\), s\.notice\)/);
  });

  it('review fix: bag, product and My orders never fall back to a sample shop', () => {
    for (const f of ['src/shop/BagScreen.tsx', 'src/shop/ProductScreen.tsx', 'src/shop/OrdersScreen.tsx']) expect(read(f), f).toMatch(/<GymOnly>/);
    expect(read('src/shop/OrdersScreen.tsx')).not.toMatch(/function SampleOrders/);
    expect(read('src/shop/GymOnly.tsx')).toMatch(/if \(hydrated && !joined\) return <Redirect href="\/workout" \/>/);
  });
});

