/**
 * R-77 (owner, 22 Oct 2026): "the shop shouldn't be there if there is no gym active, and as soon as
 * the gym is active ... and the gym owner has a shop activated ... then it starts showing up";
 * "Leave gym should be a separate option"; after joining, the gym's welcome, then a pop-up to add
 * its icon, and the default icon gone.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { GYM_ICON_WORDS, UNLINKED_TITLE } from '@/shop/gymIconWords';
import { APP_TABS } from '@/lib/appTabs';
import { GYM_TAB_LABEL, gymShopOn } from '@/shop/gymTab';

const read = (f: string) => readFileSync(f, 'utf8');

// Release A, A1 (docs/ux/MEMBER-APP-MAP.md, 24 Oct 2026) replaced R-77's "no gym, no tab; Shop with
// products": the Gym tab is always there and always "Gym"; its shop is a part of it.
describe('Release A: the Gym tab is always there, always "Gym"', () => {
  it('one label whatever the gym and its shop; the shop part shows once the gym lists something', () => {
    expect(GYM_TAB_LABEL).toBe('Gym');
    expect(APP_TABS.find((t) => t.route === 'shop')?.title).toBe('Gym');
    expect(gymShopOn(false, 12)).toBe(false);
    expect(gymShopOn(true, 0)).toBe(false);
    expect(gymShopOn(true, 1)).toBe(true);
  });

  it('the tab bar shows the 4 tabs by the one list, never by the gym', () => {
    const bar = read('src/tracker/components/TrackerTabBar.tsx');
    expect(bar).toMatch(/isShownTab\(name\)/);
    expect(bar).not.toMatch(/gymTab === 'none'|products\.length/);
    expect(bar).toMatch(/if \(!tabShown\(route\.name\)\) return null/);
    expect(bar).toMatch(/tabTitle\(route\.name\)/);
  });

  it('no gym: the tab is the one "Join your gym" screen (no sample shop, no locked rows)', () => {
    const shop = read('src/shop/ShopScreen.tsx');
    expect(shop).toMatch(/return <JoinGymDoor key="door" \/>/);
    expect(shop).toMatch(/<JoinGymCard scan \/>/);
    expect(shop).toMatch(/No gym\? Everything else works without one\./);
    expect(shop).not.toMatch(/See a sample shop|function JoinShop|function SampleShop/);
    // The shop's own parts show only while it is on; Leave is not on the tab any more (A4).
    expect(shop).toMatch(/const shopOn = gymShopOn\(true, products\.length\)/);
    expect(shop).toMatch(/\{shopOn \? <BagButton/);
    expect(shop).toMatch(/<ProductGrid products=\{products\}/);
    expect(shop).not.toMatch(/askAndLeaveGym|accessibilityLabel=\{`Leave/);
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

  it('the pop-up says plainly how to take the MettleUp icon off, and never to uninstall', () => {
    expect(GYM_ICON_WORDS.addTitle('RAM Fitness Club')).toBe('Put RAM Fitness Club on your home screen');
    expect(GYM_ICON_WORDS.removeSteps.join(' ')).toMatch(/Press and hold the MettleUp icon/);
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
    expect(read('src/shop/GymOnly.tsx')).toMatch(/if \(hydrated && !joined\) return <Redirect href="\/shop" \/>/);
  });
});

